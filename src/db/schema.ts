import fs from "node:fs";
import Database from "better-sqlite3";
import { config } from "../config.js";
import { parseGender } from "../crawler/parse.js";

let db: Database.Database | null = null;

function migratePosts(database: Database.Database): void {
  const cols = database.prepare("PRAGMA table_info(posts)").all() as Array<{ name: string }>;
  if (!cols.length) return;

  const names = new Set(cols.map((c) => c.name));
  if (!names.has("gender")) {
    database.exec(`ALTER TABLE posts ADD COLUMN gender TEXT NOT NULL DEFAULT '未知'`);
  }

  const rows = database
    .prepare(`SELECT weibo_id, text FROM posts WHERE gender = '未知' OR gender IS NULL OR gender = ''`)
    .all() as Array<{ weibo_id: string; text: string }>;
  if (!rows.length) return;

  const update = database.prepare(`UPDATE posts SET gender = ? WHERE weibo_id = ?`);
  database.transaction(() => {
    for (const row of rows) {
      const gender = parseGender(row.text);
      if (gender !== "未知") update.run(gender, row.weibo_id);
    }
  })();
}

export function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.imagesDir, { recursive: true });

  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      weibo_id TEXT PRIMARY KEY,
      region TEXT NOT NULL,
      submit_id TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT '未知',
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      reposts INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      attitudes INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT,
      fetched_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_posts_region ON posts(region);
    CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
    CREATE INDEX IF NOT EXISTS idx_posts_submit_id ON posts(submit_id);

    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      weibo_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      url TEXT NOT NULL,
      local_path TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      UNIQUE(weibo_id, idx),
      FOREIGN KEY (weibo_id) REFERENCES posts(weibo_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_images_weibo_id ON images(weibo_id);

    CREATE TABLE IF NOT EXISTS crawl_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      page INTEGER NOT NULL DEFAULT 0,
      scanned INTEGER NOT NULL DEFAULT 0,
      matched INTEGER NOT NULL DEFAULT 0,
      inserted INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );
  `);

  migratePosts(db);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_posts_gender ON posts(gender)`);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
