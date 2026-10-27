import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeWeiboText, parseGender, parseSubmitPost } from "./parse.js";

test("parses standard format", () => {
  const parsed = parseSubmitPost("#北京求脱单# 投稿ID：A12345\n女，90年，158/45");
  assert.deepEqual(parsed, { region: "北京", submitId: "A12345", gender: "女" });
});

test("parses half-width colon", () => {
  const parsed = parseSubmitPost("#成都求脱单# 投稿ID: 99887\n男，95年");
  assert.deepEqual(parsed, { region: "成都", submitId: "99887", gender: "男" });
});

test("parses html text", () => {
  const raw = "#上海求脱单# 投稿ID：S001<br />女，简介内容";
  assert.equal(normalizeWeiboText(raw).includes("简介内容"), true);
  assert.deepEqual(parseSubmitPost(raw), { region: "上海", submitId: "S001", gender: "女" });
});

test("rejects non-matching", () => {
  assert.equal(parseSubmitPost("今天天气不错"), null);
  assert.equal(parseSubmitPost("#求脱单# 投稿ID：1"), null);
});

test("parseGender", () => {
  assert.equal(parseGender("#x#\n男，99年"), "男");
  assert.equal(parseGender("#x#\n女，98年"), "女");
  assert.equal(parseGender("没有性别"), "未知");
});
