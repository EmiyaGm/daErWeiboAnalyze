import { getDb } from "./schema.js";

export type PostRow = {
  weibo_id: string;
  region: string;
  submit_id: string;
  gender: string;
  text: string;
  created_at: string;
  reposts: number;
  comments: number;
  attitudes: number;
  raw_json: string | null;
  fetched_at: string;
};

export type ImageRow = {
  id: number;
  weibo_id: string;
  idx: number;
  url: string;
  local_path: string;
  width: number | null;
  height: number | null;
};

export type CrawlRunRow = {
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

export type InsertPostInput = {
  weibo_id: string;
  region: string;
  submit_id: string;
  gender: string;
  text: string;
  created_at: string;
  reposts: number;
  comments: number;
  attitudes: number;
  raw_json: string;
  fetched_at: string;
};

export type InsertImageInput = {
  weibo_id: string;
  idx: number;
  url: string;
  local_path: string;
  width?: number | null;
  height?: number | null;
};

export function postExists(weiboId: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 AS ok FROM posts WHERE weibo_id = ?")
    .get(weiboId) as { ok: number } | undefined;
  return Boolean(row);
}

export function submitIdExists(submitId: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 AS ok FROM posts WHERE submit_id = ?")
    .get(submitId) as { ok: number } | undefined;
  return Boolean(row);
}

export function insertPost(post: InsertPostInput): boolean {
  const result = getDb()
    .prepare(
      `INSERT OR IGNORE INTO posts
       (weibo_id, region, submit_id, gender, text, created_at, reposts, comments, attitudes, raw_json, fetched_at)
       VALUES (@weibo_id, @region, @submit_id, @gender, @text, @created_at, @reposts, @comments, @attitudes, @raw_json, @fetched_at)`,
    )
    .run(post);
  return result.changes > 0;
}

export function updatePostEngagement(
  weiboId: string,
  data: { reposts: number; comments: number; attitudes: number },
): void {
  getDb()
    .prepare(
      `UPDATE posts
       SET reposts = @reposts, comments = @comments, attitudes = @attitudes, fetched_at = @fetched_at
       WHERE weibo_id = @weibo_id`,
    )
    .run({
      weibo_id: weiboId,
      reposts: data.reposts,
      comments: data.comments,
      attitudes: data.attitudes,
      fetched_at: new Date().toISOString(),
    });
}

export function findWeiboIdBySubmitId(submitId: string): string | null {
  const row = getDb()
    .prepare("SELECT weibo_id FROM posts WHERE submit_id = ? LIMIT 1")
    .get(submitId) as { weibo_id: string } | undefined;
  return row?.weibo_id ?? null;
}

export function insertImage(image: InsertImageInput): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO images (weibo_id, idx, url, local_path, width, height)
       VALUES (@weibo_id, @idx, @url, @local_path, @width, @height)`,
    )
    .run({
      ...image,
      width: image.width ?? null,
      height: image.height ?? null,
    });
}

export function listPosts(opts: {
  region?: string;
  gender?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): { items: Array<PostRow & { image_count: number; cover_path: string | null }>; total: number } {
  const where: string[] = [];
  const params: Record<string, string | number> = {};

  if (opts.region) {
    where.push("p.region = @region");
    params.region = opts.region;
  }
  if (opts.gender) {
    where.push("p.gender = @gender");
    params.gender = opts.gender;
  }
  if (opts.q) {
    where.push("(p.text LIKE @q OR p.submit_id LIKE @q OR p.region LIKE @q)");
    params.q = `%${opts.q}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = opts.limit ?? 40;
  const offset = opts.offset ?? 0;
  params.limit = limit;
  params.offset = offset;

  const total = (
    getDb()
      .prepare(`SELECT COUNT(*) AS c FROM posts p ${whereSql}`)
      .get(params) as { c: number }
  ).c;

  const items = getDb()
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM images i WHERE i.weibo_id = p.weibo_id) AS image_count,
              (SELECT local_path FROM images i WHERE i.weibo_id = p.weibo_id ORDER BY idx ASC LIMIT 1) AS cover_path
       FROM posts p
       ${whereSql}
       ORDER BY p.created_at DESC
       LIMIT @limit OFFSET @offset`,
    )
    .all(params) as Array<PostRow & { image_count: number; cover_path: string | null }>;

  return { items, total };
}

export function getPost(weiboId: string): (PostRow & { images: ImageRow[] }) | null {
  const post = getDb()
    .prepare("SELECT * FROM posts WHERE weibo_id = ?")
    .get(weiboId) as PostRow | undefined;
  if (!post) return null;

  const images = getDb()
    .prepare("SELECT * FROM images WHERE weibo_id = ? ORDER BY idx ASC")
    .all(weiboId) as ImageRow[];

  return { ...post, images };
}

export function listRegions(): Array<{ region: string; count: number }> {
  return getDb()
    .prepare(
      `SELECT region, COUNT(*) AS count
       FROM posts
       GROUP BY region
       ORDER BY count DESC, region ASC`,
    )
    .all() as Array<{ region: string; count: number }>;
}

export function getStats() {
  const db = getDb();
  const totals = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM posts) AS posts,
         (SELECT COUNT(*) FROM images) AS images,
         (SELECT COUNT(DISTINCT submit_id) FROM posts) AS unique_submit_ids,
         (SELECT COUNT(DISTINCT region) FROM posts) AS regions`,
    )
    .get() as {
    posts: number;
    images: number;
    unique_submit_ids: number;
    regions: number;
  };

  const byRegion = db
    .prepare(
      `SELECT region, COUNT(*) AS count
       FROM posts
       GROUP BY region
       ORDER BY count DESC
       LIMIT 30`,
    )
    .all() as Array<{ region: string; count: number }>;

  const byGender = db
    .prepare(
      `SELECT gender, COUNT(*) AS count
       FROM posts
       GROUP BY gender
       ORDER BY count DESC`,
    )
    .all() as Array<{ gender: string; count: number }>;

  const byMonth = db
    .prepare(
      `SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS count
       FROM posts
       GROUP BY month
       ORDER BY month ASC`,
    )
    .all() as Array<{ month: string; count: number }>;

  const byDay = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
       FROM posts
       GROUP BY day
       ORDER BY day DESC
       LIMIT 60`,
    )
    .all() as Array<{ day: string; count: number }>;

  return { totals, byRegion, byGender, byMonth, byDay: byDay.reverse() };
}

export function createCrawlRun(mode: string): number {
  const result = getDb()
    .prepare(
      `INSERT INTO crawl_runs (mode, status, page, scanned, matched, inserted, started_at)
       VALUES (?, 'running', 0, 0, 0, 0, ?)`,
    )
    .run(mode, new Date().toISOString());
  return Number(result.lastInsertRowid);
}

export function updateCrawlRun(
  id: number,
  patch: Partial<
    Pick<CrawlRunRow, "status" | "page" | "scanned" | "matched" | "inserted" | "error" | "finished_at">
  >,
): void {
  const fields: string[] = [];
  const values: Array<string | number | null> = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (!fields.length) return;
  values.push(id);
  getDb()
    .prepare(`UPDATE crawl_runs SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values);
}

export function getCrawlRun(id: number): CrawlRunRow | null {
  return (
    (getDb().prepare("SELECT * FROM crawl_runs WHERE id = ?").get(id) as CrawlRunRow | undefined) ??
    null
  );
}

export function latestCrawlRun(): CrawlRunRow | null {
  return (
    (getDb()
      .prepare("SELECT * FROM crawl_runs ORDER BY id DESC LIMIT 1")
      .get() as CrawlRunRow | undefined) ?? null
  );
}

export function listCrawlRuns(limit = 20): CrawlRunRow[] {
  return getDb()
    .prepare("SELECT * FROM crawl_runs ORDER BY id DESC LIMIT ?")
    .all(limit) as CrawlRunRow[];
}
