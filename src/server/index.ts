import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import { config } from "../config.js";
import {
  getPost,
  getStats,
  latestCrawlRun,
  listCrawlRuns,
  listPosts,
  listRegions,
} from "../db/queries.js";
import { getDb } from "../db/schema.js";
import {
  checkCookie,
  isCrawlRunning,
  runCrawl,
  stopCrawl,
  type CrawlMode,
} from "../crawler/weibo.js";

getDb();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  const cookie = await checkCookie();
  res.json({
    ok: true,
    uid: config.weiboUid,
    crawlRunning: isCrawlRunning(),
    cookie,
  });
});

app.get("/api/posts", (req, res) => {
  const region = typeof req.query.region === "string" ? req.query.region : undefined;
  const gender = typeof req.query.gender === "string" ? req.query.gender : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const limit = Number(req.query.limit || 40);
  const offset = Number(req.query.offset || 0);
  const result = listPosts({ region, gender, q, limit, offset });
  res.json(result);
});

app.get("/api/posts/:id", (req, res) => {
  const post = getPost(req.params.id);
  if (!post) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(post);
});

app.get("/api/regions", (_req, res) => {
  res.json(listRegions());
});

app.get("/api/stats", (_req, res) => {
  res.json(getStats());
});

app.get("/api/crawl", (_req, res) => {
  res.json({
    running: isCrawlRunning(),
    latest: latestCrawlRun(),
    runs: listCrawlRuns(10),
  });
});

app.post("/api/crawl", async (req, res) => {
  if (isCrawlRunning()) {
    res.status(409).json({ error: "已有抓取任务在进行中" });
    return;
  }

  const bodyMode = req.body?.mode;
  const untilDate =
    typeof req.body?.untilDate === "string" && req.body.untilDate.trim()
      ? req.body.untilDate.trim()
      : undefined;

  let mode: CrawlMode = "incremental";
  if (untilDate || bodyMode === "until") mode = "until";
  else if (bodyMode === "full") mode = "full";

  const maxPages = req.body?.maxPages ? Number(req.body.maxPages) : undefined;

  if (mode === "until" && !untilDate) {
    res.status(400).json({ error: "until 模式需要 untilDate（YYYY-MM-DD）" });
    return;
  }

  // Fire and forget; client polls /api/crawl
  void runCrawl({ mode, maxPages, untilDate }).catch((err) => {
    console.error("crawl failed:", err);
  });

  res.status(202).json({ ok: true, message: "crawl started", mode, untilDate });
});

app.post("/api/crawl/stop", (_req, res) => {
  const stopped = stopCrawl();
  res.json({ ok: stopped });
});

app.get("/api/images/:weiboId/:file", (req, res) => {
  const filePath = path.join(config.imagesDir, req.params.weiboId, req.params.file);
  if (!filePath.startsWith(config.imagesDir) || !fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }
  res.sendFile(filePath);
});

app.use("/media", express.static(config.imagesDir));

if (fs.existsSync(config.webDistDir)) {
  app.use(express.static(config.webDistDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/media")) {
      next();
      return;
    }
    res.sendFile(path.join(config.webDistDir, "index.html"));
  });
}

app.listen(config.port, () => {
  console.log(`Server http://localhost:${config.port}`);
  console.log(`UID=${config.weiboUid} cookie=${config.weiboCookie ? "set" : "MISSING"}`);
});
