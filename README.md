# 拯救大龄二次元 · 求脱单投稿抓取与分析

本地 Node.js 工具：抓取微博账号 **拯救大龄二次元**（UID `1855501681`）中以 `#地区求脱单# 投稿ID：` 开头的投稿，下载图片，并提供图库与统计看板。

## 功能

- 按格式过滤：`#北京求脱单# 投稿ID：xxxx`
- 增量 / 全量抓取，SQLite 去重
- 图片落盘到 `data/images/`
- 本地 Web：抓取控制、图库、地区/时间统计

## 准备

1. Node.js 18+
2. 浏览器登录 [weibo.com](https://weibo.com)，打开开发者工具 → Network，复制请求 Cookie
3. 配置环境变量：

```bash
cp .env.example .env
# 编辑 .env，填入 WEIBO_COOKIE=
```

**安全提示**：Cookie 等同登录凭证。`.env` 已加入 `.gitignore`，不要提交到仓库。若 Cookie 曾泄露，请在微博端退出其他登录并换新 Cookie。

## 安装与启动

```bash
npm install
npm run dev
```

- API / 生产静态：<http://localhost:3789>
- 开发前端（Vite）：<http://localhost:5173>（已代理 `/api`、`/media`）

仅命令行抓取：

```bash
npm run crawl
npm run crawl -- --mode=full --max-pages=100
```

运行解析单测：

```bash
npm test
```

## 使用说明

1. 打开 Web → **抓取**，确认 Cookie 可用
2. 推荐选择「回溯至指定日期」，选好截止日期后开始（会一直抓到该日为止；已入库的微博/投稿 ID 自动跳过）
3. 到 **图库** 按性别 / 地区筛选；到 **统计** 查看地区、性别与时间趋势

命令行示例：

```bash
npm run crawl -- --until=2024-01-01
npm run crawl -- --mode=full --max-pages=1000
```

## 目录

```
src/crawler/   解析、抓取、下图
src/db/        SQLite
src/server/    Express API
web/           Vite + React 前端
data/          数据库与图片（本地生成，不入库）
```

## 合规

仅供个人学习与本地分析，请控制请求频率，勿对外分发抓取内容。
