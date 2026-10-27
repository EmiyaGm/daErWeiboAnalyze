export type Gender = "男" | "女" | "未知";

export type ParsedSubmit = {
  region: string;
  submitId: string;
  gender: Gender;
};

const SUBMIT_RE = /^#(?<region>[^#]+?)求脱单#\s*投稿ID[：:]\s*(?<submitId>\S+)/u;
const GENDER_RE = /(?:^|\n)\s*(?<gender>[男女])\s*[，,、]/u;

/** Strip Weibo HTML wrappers / common noise before matching. */
export function normalizeWeiboText(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\u200b/g, "")
    .trim();
}

export function parseGender(rawText: string): Gender {
  const text = normalizeWeiboText(rawText);
  const match = GENDER_RE.exec(text);
  if (match?.groups?.gender === "男" || match?.groups?.gender === "女") {
    return match.groups.gender;
  }
  return "未知";
}

export function parseSubmitPost(rawText: string): ParsedSubmit | null {
  const text = normalizeWeiboText(rawText);
  const match = SUBMIT_RE.exec(text);
  if (!match?.groups) return null;

  const region = match.groups.region.trim();
  const submitId = match.groups.submitId.trim();
  if (!region || !submitId) return null;

  return { region, submitId, gender: parseGender(text) };
}
