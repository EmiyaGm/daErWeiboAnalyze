import { config } from "../config.js";
import { getDb } from "../db/schema.js";
import { checkCookie, runCrawl, type CrawlMode } from "./weibo.js";

async function main() {
  getDb();

  const modeArg = process.argv.find((a) => a.startsWith("--mode="));
  const untilArg = process.argv.find((a) => a.startsWith("--until="));
  const untilDate = untilArg?.split("=")[1];
  const mode = (untilDate ? "until" : modeArg?.split("=")[1] || "incremental") as CrawlMode;
  const maxPagesArg = process.argv.find((a) => a.startsWith("--max-pages="));
  const maxPages = maxPagesArg ? Number(maxPagesArg.split("=")[1]) : undefined;

  const health = await checkCookie();
  console.log(`Cookie: ${health.ok ? "OK" : "FAIL"} - ${health.message}`);
  if (!health.ok) process.exit(1);

  console.log(
    `Start crawl uid=${config.weiboUid} mode=${mode}${untilDate ? ` until=${untilDate}` : ""}`,
  );
  const result = await runCrawl({
    mode,
    untilDate,
    maxPages,
    onProgress: (p) => {
      process.stdout.write(
        `\r[page ${p.page}] scanned=${p.scanned} matched=${p.matched} inserted=${p.inserted} dup=${p.skippedDup}   `,
      );
    },
  });
  console.log("\nDone:", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
