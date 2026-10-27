import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const config = {
  rootDir,
  port: Number(process.env.PORT || 3789),
  weiboCookie: process.env.WEIBO_COOKIE || "",
  weiboUid: process.env.WEIBO_UID || "1855501681",
  crawlDelayMs: Number(process.env.CRAWL_DELAY_MS || 1500),
  dataDir: path.join(rootDir, "data"),
  dbPath: path.join(rootDir, "data", "weibo.db"),
  imagesDir: path.join(rootDir, "data", "images"),
  webDistDir: path.join(rootDir, "web", "dist"),
};
