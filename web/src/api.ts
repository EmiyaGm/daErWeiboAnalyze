export type PostListItem = {
  weibo_id: string;
  region: string;
  submit_id: string;
  gender: string;
  text: string;
  created_at: string;
  reposts: number;
  comments: number;
  attitudes: number;
  image_count: number;
  cover_path: string | null;
};

export type PostDetail = {
  weibo_id: string;
  region: string;
  submit_id: string;
  gender: string;
  text: string;
  created_at: string;
  reposts: number;
  comments: number;
  attitudes: number;
  images: Array<{
    id: number;
    idx: number;
    url: string;
    local_path: string;
  }>;
};

export type Stats = {
  totals: {
    posts: number;
    images: number;
    unique_submit_ids: number;
    regions: number;
  };
  byRegion: Array<{ region: string; count: number }>;
  byGender: Array<{ gender: string; count: number }>;
  byMonth: Array<{ month: string; count: number }>;
  byDay: Array<{ day: string; count: number }>;
};

export type CrawlRun = {
  id: number;
  mode: string;
  status: string;
  page: number;
  scanned: number;
  matched: number;
  inserted: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export type CrawlStatus = {
  running: boolean;
  latest: CrawlRun | null;
  runs: CrawlRun[];
};

export type Health = {
  ok: boolean;
  uid: string;
  crawlRunning: boolean;
  cookie: { ok: boolean; message: string };
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => json<Health>("/api/health"),
  posts: (params: {
    region?: string;
    gender?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.region) qs.set("region", params.region);
    if (params.gender) qs.set("gender", params.gender);
    if (params.q) qs.set("q", params.q);
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.offset) qs.set("offset", String(params.offset));
    return json<{ items: PostListItem[]; total: number }>(`/api/posts?${qs}`);
  },
  post: (id: string) => json<PostDetail>(`/api/posts/${id}`),
  regions: () => json<Array<{ region: string; count: number }>>("/api/regions"),
  stats: () => json<Stats>("/api/stats"),
  crawlStatus: () => json<CrawlStatus>("/api/crawl"),
  startCrawl: (opts: {
    mode: "incremental" | "full" | "until";
    untilDate?: string;
    maxPages?: number;
  }) =>
    json<{ ok: boolean }>("/api/crawl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    }),
  stopCrawl: () => json<{ ok: boolean }>("/api/crawl/stop", { method: "POST" }),
};

export function mediaUrl(localPath: string | null | undefined): string | null {
  if (!localPath) return null;
  return `/media/${localPath.replace(/\\/g, "/")}`;
}

export function plainText(htmlish: string): string {
  return htmlish
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}
