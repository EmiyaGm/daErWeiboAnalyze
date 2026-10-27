import { config } from "../config.js";
import {
  createCrawlRun,
  insertImage,
  insertPost,
  postExists,
  submitIdExists,
  updateCrawlRun,
} from "../db/queries.js";
import { getDb } from "../db/schema.js";
import { downloadImage } from "./images.js";
import { parseSubmitPost } from "./parse.js";

export type CrawlMode = "incremental" | "full" | "until";

export type CrawlOptions = {
  mode?: CrawlMode;
  /** ISO date `YYYY-MM-DD` — keep posts on/after this day, stop after older pages */
  untilDate?: string;
  maxPages?: number;
  cookie?: string;
  uid?: string;
  delayMs?: number;
  signal?: AbortSignal;
  onProgress?: (state: CrawlProgress) => void;
};

export type CrawlProgress = {
  runId: number;
  mode: CrawlMode;
  status: "running" | "completed" | "failed" | "stopped";
  page: number;
  scanned: number;
  matched: number;
  inserted: number;
  skippedDup: number;
  error?: string;
};

/** Start of local calendar day as ISO string for comparison with post.created_at */
function untilDateStartIso(untilDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(untilDate)) {
    throw new Error("untilDate 格式应为 YYYY-MM-DD");
  }
  const d = new Date(`${untilDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error("untilDate 无效");
  return d.toISOString();
}

type WeiboPic = {
  url?: string;
  large?: { url?: string };
  largest?: { url?: string };
  original?: { url?: string };
};

type WeiboStatus = {
  id?: number | string;
  idstr?: string;
  mid?: string;
  text?: string;
  text_raw?: string;
  created_at?: string;
  reposts_count?: number;
  comments_count?: number;
  attitudes_count?: number;
  isLongText?: boolean;
  pic_infos?: Record<string, WeiboPic>;
  pic_ids?: string[];
  retweeted_status?: WeiboStatus;
};

type MymblogResponse = {
  ok?: number;
  msg?: string;
  data?: {
    list?: WeiboStatus[];
    since_id?: number | string;
  };
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

function browserHeaders(cookie: string): Record<string, string> {
  return {
    Cookie: cookie,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    Referer: "https://weibo.com/",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
  };
}

function parseWeiboDate(createdAt?: string): string {
  if (!createdAt) return new Date().toISOString();
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return createdAt;
  return d.toISOString();
}

function extractPicUrls(status: WeiboStatus): string[] {
  const urls: string[] = [];
  const infos = status.pic_infos || {};
  const ids = status.pic_ids || Object.keys(infos);

  for (const id of ids) {
    const pic = infos[id];
    if (!pic) continue;
    const url =
      pic.largest?.url || pic.original?.url || pic.large?.url || pic.url;
    if (url) urls.push(url);
  }
  return urls;
}

function statusText(status: WeiboStatus): string {
  return status.text_raw || status.text || "";
}

export async function checkCookie(cookie = config.weiboCookie): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!cookie.trim()) {
    return { ok: false, message: "未配置 WEIBO_COOKIE" };
  }

  try {
    const url = new URL("https://weibo.com/ajax/statuses/mymblog");
    url.searchParams.set("uid", config.weiboUid);
    url.searchParams.set("page", "1");
    url.searchParams.set("feature", "0");

    const res = await fetch(url, { headers: browserHeaders(cookie) });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `Cookie 可能失效（HTTP ${res.status}）` };
    }
    const json = (await res.json()) as MymblogResponse & { error_code?: number };
    if (!res.ok) {
      return { ok: false, message: `请求失败 HTTP ${res.status}` };
    }
    if (json.ok === 0 || json.error_code) {
      return { ok: false, message: json.msg || "Cookie 无效或权限不足" };
    }
    if (!json.data?.list) {
      return { ok: false, message: "返回数据异常，请检查 Cookie / UID" };
    }
    return { ok: true, message: `可用，本页 ${json.data.list.length} 条` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

async function fetchPage(
  uid: string,
  page: number,
  cookie: string,
): Promise<WeiboStatus[]> {
  const url = new URL("https://weibo.com/ajax/statuses/mymblog");
  url.searchParams.set("uid", uid);
  url.searchParams.set("page", String(page));
  url.searchParams.set("feature", "0");

  const res = await fetch(url, { headers: browserHeaders(cookie) });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Cookie 失效（HTTP ${res.status}），请更新 .env 中的 WEIBO_COOKIE`);
  }
  if (!res.ok) {
    throw new Error(`mymblog HTTP ${res.status}`);
  }

  const json = (await res.json()) as MymblogResponse;
  if (json.ok === 0) {
    throw new Error(json.msg || "微博接口返回失败，可能 Cookie 已失效");
  }
  return json.data?.list || [];
}

async function fetchStatusDetail(id: string, cookie: string): Promise<WeiboStatus | null> {
  const url = new URL("https://weibo.com/ajax/statuses/show");
  url.searchParams.set("id", id);
  const res = await fetch(url, { headers: browserHeaders(cookie) });
  if (!res.ok) return null;
  const json = (await res.json()) as WeiboStatus & { ok?: number; data?: WeiboStatus };
  if (json.data) return json.data;
  if (json.idstr || json.id) return json;
  return null;
}

let activeController: AbortController | null = null;

export function isCrawlRunning(): boolean {
  return activeController !== null && !activeController.signal.aborted;
}

export function stopCrawl(): boolean {
  if (!activeController) return false;
  activeController.abort();
  return true;
}

export async function runCrawl(options: CrawlOptions = {}): Promise<CrawlProgress> {
  if (isCrawlRunning()) {
    throw new Error("已有抓取任务在进行中");
  }

  getDb();

  let mode: CrawlMode = options.mode || "incremental";
  if (options.untilDate) mode = "until";

  const cookie = options.cookie || config.weiboCookie;
  const uid = options.uid || config.weiboUid;
  const delayMs = options.delayMs ?? config.crawlDelayMs;
  const maxPages =
    options.maxPages ?? (mode === "incremental" ? 50 : mode === "until" ? 2000 : 500);
  const untilCutoff = options.untilDate ? untilDateStartIso(options.untilDate) : null;

  if (!cookie.trim()) {
    throw new Error("未配置 WEIBO_COOKIE");
  }
  if (mode === "until" && !untilCutoff) {
    throw new Error("until 模式需要提供 untilDate（YYYY-MM-DD）");
  }

  const controller = new AbortController();
  activeController = controller;
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const runLabel = untilCutoff ? `until:${options.untilDate}` : mode;
  const runId = createCrawlRun(runLabel);
  const progress: CrawlProgress = {
    runId,
    mode,
    status: "running",
    page: 0,
    scanned: 0,
    matched: 0,
    inserted: 0,
    skippedDup: 0,
  };

  const emit = () => options.onProgress?.({ ...progress });

  try {
    let page = 1;
    let consecutiveExistingPages = 0;
    let reachedUntilDate = false;

    while (page <= maxPages) {
      if (controller.signal.aborted) {
        progress.status = "stopped";
        updateCrawlRun(runId, {
          status: "stopped",
          page: progress.page,
          scanned: progress.scanned,
          matched: progress.matched,
          inserted: progress.inserted,
          finished_at: new Date().toISOString(),
        });
        emit();
        return progress;
      }

      progress.page = page;
      updateCrawlRun(runId, {
        page,
        scanned: progress.scanned,
        matched: progress.matched,
        inserted: progress.inserted,
      });
      emit();

      const list = await fetchPage(uid, page, cookie);
      if (!list.length) break;

      let pageHadNewMatch = false;
      // Use newest on page to decide stop — a single sticky/old post must not end the crawl.
      let pageNewestIso: string | null = null;

      for (const item of list) {
        progress.scanned += 1;
        const weiboId = String(item.idstr || item.id || item.mid || "");
        if (!weiboId) continue;

        const itemCreated = parseWeiboDate(item.created_at);
        if (!pageNewestIso || itemCreated > pageNewestIso) pageNewestIso = itemCreated;

        // Prefer original status text for matching; skip pure retweets without own match.
        const candidates: WeiboStatus[] = [item];
        if (item.retweeted_status) candidates.push(item.retweeted_status);

        let matchedStatus: WeiboStatus | null = null;
        let parsed = null as ReturnType<typeof parseSubmitPost>;

        for (const candidate of candidates) {
          parsed = parseSubmitPost(statusText(candidate));
          if (parsed) {
            matchedStatus = candidate;
            break;
          }
        }

        if (!parsed || !matchedStatus) continue;

        const matchCreated = parseWeiboDate(matchedStatus.created_at || item.created_at);
        if (untilCutoff && matchCreated < untilCutoff) {
          // Older than cutoff — do not store; keep scanning page then stop.
          continue;
        }

        progress.matched += 1;
        const matchId = String(matchedStatus.idstr || matchedStatus.id || weiboId);

        if (postExists(matchId) || submitIdExists(parsed.submitId)) {
          progress.skippedDup += 1;
          continue;
        }

        pageHadNewMatch = true;

        let detail = matchedStatus;
        const pics = extractPicUrls(matchedStatus);
        if ((!pics.length && matchedStatus.pic_ids?.length) || matchedStatus.isLongText) {
          const fetched = await fetchStatusDetail(matchId, cookie);
          if (fetched) detail = fetched;
          await sleep(Math.min(800, delayMs), controller.signal);
        }

        const finalParsed = parseSubmitPost(statusText(detail)) || parsed;
        if (submitIdExists(finalParsed.submitId) || postExists(matchId)) {
          progress.skippedDup += 1;
          continue;
        }

        const picUrls = extractPicUrls(detail);

        const inserted = insertPost({
          weibo_id: matchId,
          region: finalParsed.region,
          submit_id: finalParsed.submitId,
          gender: finalParsed.gender,
          text: statusText(detail),
          created_at: parseWeiboDate(detail.created_at || item.created_at),
          reposts: detail.reposts_count ?? item.reposts_count ?? 0,
          comments: detail.comments_count ?? item.comments_count ?? 0,
          attitudes: detail.attitudes_count ?? item.attitudes_count ?? 0,
          raw_json: JSON.stringify(detail),
          fetched_at: new Date().toISOString(),
        });

        if (inserted) {
          progress.inserted += 1;
          for (let i = 0; i < picUrls.length; i++) {
            try {
              const localPath = await downloadImage(picUrls[i], matchId, i, cookie);
              insertImage({
                weibo_id: matchId,
                idx: i,
                url: picUrls[i],
                local_path: localPath,
              });
            } catch (err) {
              console.warn(`image download failed ${matchId}#${i}:`, err);
            }
            await sleep(200, controller.signal);
          }
        } else {
          progress.skippedDup += 1;
        }
      }

      // Timeline goes new → old. Stop only when this whole page is older than the cutoff.
      if (untilCutoff && pageNewestIso && pageNewestIso < untilCutoff) {
        reachedUntilDate = true;
        break;
      }

      if (mode === "incremental") {
        if (!pageHadNewMatch) {
          consecutiveExistingPages += 1;
          if (consecutiveExistingPages >= 2) break;
        } else {
          consecutiveExistingPages = 0;
        }
      }

      page += 1;
      await sleep(delayMs, controller.signal);
    }

    if (mode === "until" && !reachedUntilDate && page > maxPages) {
      console.warn(`untilDate 未完全触达，已到 maxPages=${maxPages}`);
    }

    progress.status = "completed";
    updateCrawlRun(runId, {
      status: "completed",
      page: progress.page,
      scanned: progress.scanned,
      matched: progress.matched,
      inserted: progress.inserted,
      finished_at: new Date().toISOString(),
    });
    emit();
    return progress;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      progress.status = "stopped";
      updateCrawlRun(runId, {
        status: "stopped",
        page: progress.page,
        scanned: progress.scanned,
        matched: progress.matched,
        inserted: progress.inserted,
        finished_at: new Date().toISOString(),
      });
      emit();
      return progress;
    }

    const message = err instanceof Error ? err.message : String(err);
    progress.status = "failed";
    progress.error = message;
    updateCrawlRun(runId, {
      status: "failed",
      page: progress.page,
      scanned: progress.scanned,
      matched: progress.matched,
      inserted: progress.inserted,
      error: message,
      finished_at: new Date().toISOString(),
    });
    emit();
    throw err;
  } finally {
    activeController = null;
  }
}
