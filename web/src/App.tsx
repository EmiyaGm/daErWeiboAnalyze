import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  api,
  mediaUrl,
  plainText,
  type CrawlStatus,
  type Health,
  type PostDetail,
  type PostListItem,
  type Stats,
} from "./api";

type Tab = "gallery" | "stats" | "crawl";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}

function GalleryView() {
  const [region, setRegion] = useState("");
  const [gender, setGender] = useState("");
  const [q, setQ] = useState("");
  const [regions, setRegions] = useState<Array<{ region: string; count: number }>>([]);
  const [items, setItems] = useState<PostListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<PostDetail | null>(null);
  const limit = 40;

  const load = useCallback(async (nextOffset = 0, append = false) => {
    setLoading(true);
    try {
      const data = await api.posts({
        region: region || undefined,
        gender: gender || undefined,
        q: q || undefined,
        limit,
        offset: nextOffset,
      });
      setTotal(data.total);
      setOffset(nextOffset);
      setItems((prev) => (append ? [...prev, ...data.items] : data.items));
    } finally {
      setLoading(false);
    }
  }, [region, gender, q]);

  useEffect(() => {
    void api.regions().then(setRegions);
  }, []);

  useEffect(() => {
    void load(0, false);
  }, [load]);

  return (
    <div className="panel">
      <div className="toolbar">
        <select value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="">全部性别</option>
          <option value="女">女</option>
          <option value="男">男</option>
          <option value="未知">未知</option>
        </select>
        <select value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">全部地区</option>
          {regions.map((r) => (
            <option key={r.region} value={r.region}>
              {r.region} ({r.count})
            </option>
          ))}
        </select>
        <input
          placeholder="搜索正文 / 投稿ID / 地区"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void load(0, false);
          }}
        />
        <button className="btn secondary" onClick={() => void load(0, false)} disabled={loading}>
          筛选
        </button>
        <span className="muted">共 {total} 条</span>
      </div>

      <div className="gallery">
        {items.map((item) => {
          const cover = mediaUrl(item.cover_path);
          return (
            <article
              key={item.weibo_id}
              className="card"
              onClick={() => void api.post(item.weibo_id).then(setDetail)}
            >
              {cover ? (
                <img className="thumb" src={cover} alt={item.region} loading="lazy" />
              ) : (
                <div className="thumb" />
              )}
              <div className="meta">
                <div className="region">
                  #{item.region}求脱单# · {item.gender || "未知"}
                </div>
                <div className="sub">投稿ID：{item.submit_id}</div>
                <div className="sub">
                  {formatTime(item.created_at)} · {item.image_count} 图
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {!items.length && !loading && <p className="muted">暂无数据，请先到「抓取」页拉取微博。</p>}

      {offset + items.length < total && (
        <div className="toolbar" style={{ marginTop: 16 }}>
          <button
            className="btn secondary"
            disabled={loading}
            onClick={() => void load(offset + limit, true)}
          >
            加载更多
          </button>
        </div>
      )}

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="toolbar" style={{ justifyContent: "space-between" }}>
              <strong>
                #{detail.region}求脱单# · {detail.gender || "未知"} · 投稿ID：{detail.submit_id}
              </strong>
              <button className="btn secondary" onClick={() => setDetail(null)}>
                关闭
              </button>
            </div>
            <div className="muted">{formatTime(detail.created_at)}</div>
            <p className="pre">{plainText(detail.text)}</p>
            <div className="modal-images">
              {detail.images.map((img) => {
                const src = mediaUrl(img.local_path);
                return src ? <img key={img.id} src={src} alt="" /> : null;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatsView() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    void api.stats().then(setStats);
  }, []);

  if (!stats) return <div className="panel muted">加载统计中…</div>;

  return (
    <div className="panel">
      <div className="grid-stats">
        <div className="stat">
          <div className="label">投稿数</div>
          <div className="value">{stats.totals.posts}</div>
        </div>
        <div className="stat">
          <div className="label">图片数</div>
          <div className="value">{stats.totals.images}</div>
        </div>
        <div className="stat">
          <div className="label">地区数</div>
          <div className="value">{stats.totals.regions}</div>
        </div>
        <div className="stat">
          <div className="label">投稿ID去重</div>
          <div className="value">{stats.totals.unique_submit_ids}</div>
        </div>
      </div>

      <div className="charts">
        <div className="chart-box">
          <h3>地区 Top</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.byRegion.slice(0, 15)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4dccb" />
              <XAxis dataKey="region" tick={{ fontSize: 12 }} interval={0} angle={-30} textAnchor="end" height={70} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#0f6b5c" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-box">
          <h3>性别分布</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.byGender || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4dccb" />
              <XAxis dataKey="gender" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#3d6ea8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-box" style={{ marginTop: 16 }}>
        <h3>按月趋势</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={stats.byMonth}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4dccb" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#c47e3a" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-box" style={{ marginTop: 16 }}>
        <h3>近 60 日</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={stats.byDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4dccb" />
            <XAxis dataKey="day" hide />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#6b6358" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CrawlView({ onChanged }: { onChanged?: () => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState<CrawlStatus | null>(null);
  const [mode, setMode] = useState<"incremental" | "full" | "until">("until");
  const [untilDate, setUntilDate] = useState("2024-01-01");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [h, s] = await Promise.all([api.health(), api.crawlStatus()]);
    setHealth(h);
    setStatus(s);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  const latest = status?.latest;

  return (
    <div className="panel">
      <div className="grid-stats" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div className="stat">
          <div className="label">目标 UID</div>
          <div className="value" style={{ fontSize: "1.2rem" }}>
            {health?.uid || "—"}
          </div>
        </div>
        <div className="stat">
          <div className="label">Cookie 状态</div>
          <div className={`value ${health?.cookie.ok ? "ok" : "bad"}`} style={{ fontSize: "1.05rem" }}>
            {health ? (health.cookie.ok ? "可用" : "失效") : "检测中"}
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            {health?.cookie.message}
          </div>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 0 }}>
        已存在的微博 ID / 投稿 ID 会自动跳过，不会重复入库或重复下图。
      </p>

      <div className="toolbar">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "incremental" | "full" | "until")}
          disabled={status?.running}
        >
          <option value="until">回溯至指定日期</option>
          <option value="incremental">增量（遇到已抓页即停）</option>
          <option value="full">全量历史</option>
        </select>
        {mode === "until" && (
          <input
            type="date"
            value={untilDate}
            disabled={status?.running}
            onChange={(e) => setUntilDate(e.target.value)}
            title="保留该日及之后的投稿，更早的停止"
          />
        )}
        <button
          className="btn"
          disabled={
            busy || status?.running || !health?.cookie.ok || (mode === "until" && !untilDate)
          }
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api.startCrawl({
                mode,
                untilDate: mode === "until" ? untilDate : undefined,
              });
              onChanged?.();
              await refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          开始抓取
        </button>
        <button
          className="btn danger"
          disabled={!status?.running}
          onClick={async () => {
            await api.stopCrawl();
            await refresh();
          }}
        >
          停止
        </button>
      </div>

      {mode === "until" && (
        <p className="muted">
          将从最新往回抓，保留 <strong>{untilDate}</strong> 当天及之后的投稿；碰到更早内容即停止。重复内容自动跳过。
        </p>
      )}

      {error && <p className="bad">{error}</p>}

      {latest && (
        <div style={{ marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>当前 / 最近任务</h3>
          <p className="muted" style={{ margin: "0 0 8px" }}>
            #{latest.id} · {latest.mode} · <strong>{latest.status}</strong>
          </p>
          <p style={{ margin: 0 }}>
            页 {latest.page} · 扫描 {latest.scanned} · 匹配 {latest.matched} · 新增 {latest.inserted}
          </p>
          {latest.inserted === 0 && latest.matched > 0 && (
            <p className="muted">匹配条数里已入库的会跳过（新增为 0 正常），回溯模式应继续往后翻页。</p>
          )}
          {latest.error && <p className="bad">{latest.error}</p>}
        </div>
      )}

      <h3>历史任务</h3>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>模式</th>
            <th>状态</th>
            <th>页/扫描/匹配/新增</th>
            <th>开始时间</th>
          </tr>
        </thead>
        <tbody>
          {(status?.runs || []).map((run) => (
            <tr key={run.id}>
              <td>{run.id}</td>
              <td>{run.mode}</td>
              <td>{run.status}</td>
              <td>
                {run.page}/{run.scanned}/{run.matched}/{run.inserted}
              </td>
              <td>{formatTime(run.started_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("crawl");
  const title = useMemo(() => "拯救大龄二次元 · 求脱单投稿", []);

  return (
    <div className="app">
      <header className="hero">
        <h1>{title}</h1>
        <p>
          仅抓取以「#地区求脱单# 投稿ID：」开头的微博，本地存图并按地区 / 时间统计。Cookie 保存在本机
          `.env`，请勿提交到 Git。
        </p>
      </header>

      <nav className="nav">
        <button className={tab === "crawl" ? "active" : ""} onClick={() => setTab("crawl")}>
          抓取
        </button>
        <button className={tab === "gallery" ? "active" : ""} onClick={() => setTab("gallery")}>
          图库
        </button>
        <button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}>
          统计
        </button>
      </nav>

      {tab === "crawl" && <CrawlView />}
      {tab === "gallery" && <GalleryView />}
      {tab === "stats" && <StatsView />}
    </div>
  );
}
