import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

function extFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) return ext;
  } catch {
    /* ignore */
  }
  return ".jpg";
}

export async function downloadImage(
  url: string,
  weiboId: string,
  idx: number,
  cookie: string,
): Promise<string> {
  const dir = path.join(config.imagesDir, weiboId);
  fs.mkdirSync(dir, { recursive: true });

  const ext = extFromUrl(url);
  const filename = `${String(idx).padStart(2, "0")}${ext}`;
  const localPath = path.join(dir, filename);
  const relativePath = path.join(weiboId, filename);

  if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
    return relativePath;
  }

  const res = await fetch(url, {
    headers: {
      Cookie: cookie,
      Referer: "https://weibo.com/",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`download image failed ${res.status}: ${url}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(localPath, buf);
  return relativePath;
}
