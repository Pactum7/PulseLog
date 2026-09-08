"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertCircle, Braces, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Clock3, Database, FileSearch, Filter, LoaderCircle, LogOut, Moon, Plus, RefreshCw, Search, Settings, Sun, X } from "lucide-react";
import { Area, AreaChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EnvironmentSummary, FieldInfo, LogHit } from "@/lib/types";

type SearchResult = { took: number; timedOut: boolean; total: number; relation: string; hits: LogHit[]; pitId: string; nextCursor?: unknown[]; histogram: { time: number; count: number }[] };
type Range = { label: string; ms: number };
type AbsoluteRange = { from: Date; to: Date };
type ChartPointer = { activeLabel?: string | number };
const RANGES: Range[] = [
  { label: "最近 15 分钟", ms: 15 * 60_000 }, { label: "最近 30 分钟", ms: 30 * 60_000 },
  { label: "最近 1 小时", ms: 3_600_000 }, { label: "最近 4 小时", ms: 4 * 3_600_000 },
  { label: "最近 12 小时", ms: 12 * 3_600_000 }, { label: "最近 24 小时", ms: 24 * 3_600_000 },
  { label: "最近 3 天", ms: 3 * 86_400_000 }, { label: "最近 7 天", ms: 7 * 86_400_000 },
  { label: "最近 30 天", ms: 30 * 86_400_000 },
];

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (response.status === 401) { window.location.assign(new URL("/login", window.location.origin)); throw new Error("登录已过期"); }
  if (!response.ok) throw new Error(body.details || body.error || "请求失败");
  return body as T;
}

function getPath(source: Record<string, unknown>, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, source);
}

function getHitValue(hit: LogHit, path: string): unknown {
  if (path === "_id") return hit.id;
  if (path === "_index") return hit.index;
  return getPath(hit.source, path);
}

function queryValue(value: string | number | boolean): string {
  if (typeof value !== "string") return String(value);
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

type FieldValueStat = { key: string; value: string | number | boolean; label: string; count: number; percent: number };
type FieldStats = { values: FieldValueStat[]; present: number; distinct: number; highCardinality: boolean };

function fieldStats(hits: LogHit[], field: string): FieldStats {
  const counts = new Map<string, Omit<FieldValueStat, "percent">>();
  let present = 0;
  for (const hit of hits) {
    const raw = getHitValue(hit, field);
    const values = (Array.isArray(raw) ? raw : [raw]).filter((value): value is string | number | boolean =>
      typeof value === "string" || typeof value === "number" || typeof value === "boolean");
    const unique = new Set<string>();
    for (const value of values) {
      const key = `${typeof value}:${String(value)}`;
      if (unique.has(key)) continue;
      unique.add(key);
      const current = counts.get(key);
      if (current) current.count++;
      else counts.set(key, { key, value, label: String(value), count: 1 });
    }
    if (unique.size) present++;
  }
  const highCardinality = counts.size > 20 && counts.size >= Math.max(20, present * 0.5);
  const candidates = [...counts.values()];
  const shown = highCardinality
    ? candidates.slice(0, 5)
    : candidates.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 10);
  return { present, distinct: counts.size, highCardinality, values: shown.map((item) => ({ ...item, percent: hits.length ? item.count / hits.length * 100 : 0 })) };
}

export function Discover() {
  const router = useRouter();
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [environmentId, setEnvironmentId] = useState("");
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState(RANGES[5]);
  const [absoluteRange, setAbsoluteRange] = useState<AbsoluteRange | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [fieldFilter, setFieldFilter] = useState("");
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [drawerHit, setDrawerHit] = useState<LogHit | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);

  const environment = environments.find((item) => item.id === environmentId);
  const filteredFields = useMemo(() => fields.filter((field) => field.name.toLowerCase().includes(fieldFilter.toLowerCase())), [fields, fieldFilter]);
  const allExpanded = Boolean(result?.hits.length) && result!.hits.every((hit) => expandedRows.has(`${hit.index}:${hit.id}`));
  const rangeLabel = absoluteRange
    ? `${absoluteRange.from.toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} – ${absoluteRange.to.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
    : range.label;

  useEffect(() => {
    const saved = localStorage.getItem("pulselog-theme");
    const next = saved === "light" || saved === "dark" ? saved : window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    setTheme(next); document.documentElement.dataset.theme = next;
  }, []);

  const loadEnvironments = useCallback(async () => {
    const items = await json<EnvironmentSummary[]>("/api/environments");
    setEnvironments(items);
    setEnvironmentId((current) => current || items[0]?.id || "");
  }, []);
  useEffect(() => { loadEnvironments().catch((e) => setError(e.message)); }, [loadEnvironments]);
  useEffect(() => {
    if (!environmentId) return;
    setResult(null); setFields([]); setColumns([]); setExpandedField(null);
    json<FieldInfo[]>(`/api/fields?environmentId=${encodeURIComponent(environmentId)}`)
      .then(setFields).catch((e) => setError(e.message));
  }, [environmentId]);

  const runSearch = useCallback(async (append = false, selected?: AbsoluteRange, queryOverride?: string) => {
    if (!environmentId) return;
    setLoading(true); setError("");
    try {
      const fixed = selected || absoluteRange;
      const to = fixed?.to || new Date(); const from = fixed?.from || new Date(to.getTime() - range.ms);
      const data = await json<SearchResult>("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        environmentId, query: queryOverride ?? query, from: from.toISOString(), to: to.toISOString(), size: 500,
        pitId: append ? result?.pitId : undefined, searchAfter: append ? result?.nextCursor : undefined,
      }) });
      if (!append) setExpandedRows(new Set());
      setResult((previous) => append && previous ? { ...data, hits: [...previous.hits, ...data.hits] } : data);
    } catch (e) { setError(e instanceof Error ? e.message : "查询失败"); }
    finally { setLoading(false); }
  }, [environmentId, query, range, absoluteRange, result]);

  useEffect(() => { if (environmentId && fields.length) runSearch(); }, [environmentId, fields.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(event: FormEvent) { event.preventDefault(); runSearch(); }
  function toggleColumn(name: string) { setColumns((list) => list.includes(name) ? list.filter((item) => item !== name) : [...list, name]); }
  function applyClause(clause: string) {
    const nextQuery = query.trim() ? `(${query.trim()}) AND ${clause}` : clause;
    setQuery(nextQuery);
    runSearch(false, undefined, nextQuery);
  }
  function applyFilter(field: string, value: string | number | boolean) { applyClause(`${field}:${queryValue(value)}`); }
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next); document.documentElement.dataset.theme = next; localStorage.setItem("pulselog-theme", next);
  }
  function toggleRow(hit: LogHit) {
    const key = `${hit.index}:${hit.id}`;
    setExpandedRows((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }
  function toggleAllRows() {
    if (allExpanded) setExpandedRows(new Set());
    else setExpandedRows(new Set(result?.hits.map((hit) => `${hit.index}:${hit.id}`) || []));
  }
  function chartTime(pointer?: ChartPointer): number | null {
    const value = Number(pointer?.activeLabel);
    return Number.isFinite(value) ? value : null;
  }
  function finishChartSelection(pointer?: ChartPointer) {
    const end = chartTime(pointer) ?? dragCurrent;
    if (dragStart !== null && end !== null && Math.abs(end - dragStart) > 1000) {
      const selected = { from: new Date(Math.min(dragStart, end)), to: new Date(Math.max(dragStart, end)) };
      setAbsoluteRange(selected); setRangeOpen(false); runSearch(false, selected);
    }
    setDragStart(null); setDragCurrent(null);
  }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }

  if (!environments.length && !error) return <main className="center-state"><LoaderCircle className="spin"/><p>正在载入日志环境…</p></main>;
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark small"><Activity size={18}/></span><div><strong>PulseLog</strong><small>LOG INTELLIGENCE</small></div></div>
      <div className="top-actions">
        <label className="environment-select"><span className="status-dot" style={{ background: environment?.color }}/><select value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)}>{environments.map((env) => <option key={env.id} value={env.id}>{env.name}</option>)}</select><ChevronDown size={14}/></label>
        <button className="icon-button" title={theme === "dark" ? "切换浅色主题" : "切换深色主题"} onClick={toggleTheme}>{theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}</button>
        <button className="icon-button" title="环境配置" onClick={() => setSettings(true)}><Settings size={17}/></button>
        <button className="icon-button" title="退出" onClick={logout}><LogOut size={17}/></button>
      </div>
    </header>
    <main className="workspace">
      <section className="query-zone">
        <div className="context-line"><span>{environment?.indexPattern || "未配置索引"}</span><span className="separator">/</span><span>{environment?.baseUrl.replace(/^https?:\/\//, "")}</span></div>
        <form className="query-row" onSubmit={submit}>
          <div className="query-input"><Search size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder='service:payment AND message.pattern:*timeout*' spellCheck={false}/><kbd>⌘ ↵</kbd></div>
          <div className="range-wrap"><button type="button" className="range-button" onClick={() => setRangeOpen(!rangeOpen)}><Clock3 size={16}/><span>{rangeLabel}</span><ChevronDown size={14}/></button>{rangeOpen && <div className="range-popover"><p>快速时间范围</p>{RANGES.map((item) => <button type="button" key={item.label} className={!absoluteRange && item.label === range.label ? "active" : ""} onClick={() => { const to = new Date(); const selected = { from: new Date(to.getTime() - item.ms), to }; setRange(item); setAbsoluteRange(null); setRangeOpen(false); runSearch(false, selected); }}>{item.label}<span>{!absoluteRange && item.label === range.label ? "✓" : ""}</span></button>)}</div>}</div>
          <button className="primary search-button" disabled={loading}>{loading ? <LoaderCircle size={17} className="spin"/> : <Search size={17}/>}查询</button>
        </form>
        <div className="query-hints"><span>支持</span><code>field:value</code><code>field:EXISTS</code><code>text:&quot;短语&quot;</code><code>wildcard:*包含*</code><code>AND / OR</code></div>
      </section>
      {error && <div className="error-banner"><AlertCircle size={17}/><span>{error}</span><button onClick={() => setError("")}><X size={15}/></button></div>}
      <div className="content-grid">
        <aside className="fields-panel">
          <div className="panel-title"><div><span>可用字段</span><strong>{fields.length}</strong></div><Filter size={15}/></div>
          <div className="field-search"><Search size={14}/><input value={fieldFilter} onChange={(e) => setFieldFilter(e.target.value)} placeholder="筛选字段"/></div>
          <div className="field-list">{filteredFields.map((field) => <FieldItem key={field.name} field={field} hits={result?.hits || []} expanded={expandedField === field.name} selected={columns.includes(field.name)} onToggle={() => setExpandedField((current) => current === field.name ? null : field.name)} onToggleColumn={() => toggleColumn(field.name)} onFilter={(value) => applyFilter(field.name, value)} onExists={() => applyClause(`${field.name}:EXISTS`)}/>)}</div>
        </aside>
        <section className="results-panel">
          <div className="result-summary"><div><span className="pulse-dot"/><strong>{result ? result.total.toLocaleString() : "—"}</strong><span>条日志</span>{result && <span className="took">{result.took} ms</span>}</div><div className="result-actions"><button className="ghost" onClick={toggleAllRows} disabled={!result?.hits.length}>{allExpanded ? <ChevronsDownUp size={14}/> : <ChevronsUpDown size={14}/>} {allExpanded ? "全部收起" : "全部展开"}</button><button className="ghost" onClick={() => runSearch()} disabled={loading}><RefreshCw size={14}/>刷新</button></div></div>
          <div className={`histogram ${dragStart !== null ? "selecting" : ""}`}><div className="histogram-label">日志趋势 <span>拖动选择时间范围</span></div>{result?.histogram?.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={result.histogram} onMouseDown={(pointer) => { const time = chartTime(pointer); if (time !== null) { setDragStart(time); setDragCurrent(time); } }} onMouseMove={(pointer) => { if (dragStart !== null) { const time = chartTime(pointer); if (time !== null) setDragCurrent(time); } }} onMouseUp={finishChartSelection} onMouseLeave={() => dragStart !== null && finishChartSelection()}><defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c6cff" stopOpacity={0.38}/><stop offset="100%" stopColor="#7c6cff" stopOpacity={0.02}/></linearGradient></defs><XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} axisLine={false} tickLine={false} minTickGap={60}/><YAxis width={42} axisLine={false} tickLine={false}/><Tooltip labelFormatter={(v) => new Date(Number(v)).toLocaleString()} contentStyle={{ background: "var(--chart-tooltip)", border: "1px solid var(--line)", borderRadius: 8 }}/><Area type="monotone" dataKey="count" stroke="#8b7cff" fill="url(#areaFill)" strokeWidth={2}/>{dragStart !== null && dragCurrent !== null && <ReferenceArea x1={dragStart} x2={dragCurrent} fill="#7869f8" fillOpacity={0.22} stroke="#8b7cff"/>}</AreaChart></ResponsiveContainer> : <div className="empty-chart">等待查询结果</div>}</div>
          <div className="table-wrap"><table><thead><tr><th className="expand-cell"><button className="expand-all-icon" title={allExpanded ? "全部收起" : "全部展开"} onClick={toggleAllRows}>{allExpanded ? <ChevronsDownUp size={14}/> : <ChevronsUpDown size={14}/>}</button></th><th className="time-cell">时间</th>{columns.map((column) => <th key={column}>{column}<button onClick={() => toggleColumn(column)}><X size={12}/></button></th>)}<th>日志消息</th></tr></thead><tbody>{result?.hits.map((hit) => { const key = `${hit.index}:${hit.id}`; const isExpanded = expandedRows.has(key); return <LogRows key={key} hit={hit} columns={columns} expanded={isExpanded} onToggle={() => toggleRow(hit)} onDetails={() => setDrawerHit(hit)}/>; })}</tbody></table>{result && !result.hits.length && <div className="empty-state"><FileSearch size={30}/><strong>没有找到日志</strong><span>尝试扩大时间范围或调整查询条件</span></div>}{!result && <div className="empty-state"><Database size={30}/><strong>准备查询</strong><span>选择环境并输入查询条件</span></div>}</div>
          {result?.nextCursor && <div className="load-more"><button className="ghost" onClick={() => runSearch(true)} disabled={loading}>加载更多日志</button></div>}
        </section>
      </div>
    </main>
    {drawerHit && <LogDrawer hit={drawerHit} onClose={() => setDrawerHit(null)}/>}
    {settings && <EnvironmentModal environments={environments} onClose={() => setSettings(false)} onSaved={async () => { await loadEnvironments(); setSettings(false); }}/>}
  </div>;
}

function FieldItem({ field, hits, expanded, selected, onToggle, onToggleColumn, onFilter, onExists }: { field: FieldInfo; hits: LogHit[]; expanded: boolean; selected: boolean; onToggle: () => void; onToggleColumn: () => void; onFilter: (value: string | number | boolean) => void; onExists: () => void }) {
  const stats = useMemo(() => fieldStats(hits, field.name), [hits, field.name]);
  const type = field.types[0];
  return <div className={`field-item ${expanded ? "expanded" : ""} ${selected ? "selected" : ""}`}>
    <div className="field-row">
      <button className="field-main" onClick={onToggle} title={`查看 ${field.name} 的值分布`} aria-expanded={expanded}><ChevronRight className="field-chevron" size={13}/><span className={`type-badge type-${type}`}>{type === "text" ? "T" : type === "wildcard" ? "W" : type === "date" ? "D" : "#"}</span><span className="field-name" title={field.name}>{field.name}</span></button>
      <button className="field-column" onClick={onToggleColumn} title={selected ? "从表格移除" : "添加为表格列"} aria-label={selected ? `从表格移除 ${field.name}` : `添加表格列 ${field.name}`}><Plus size={13}/></button>
    </div>
    {expanded && <div className="field-values">
      <div className="field-values-summary"><span>已加载 {hits.length} 条</span><span>{stats.distinct.toLocaleString()} 个值</span></div>
      {!hits.length && <p className="field-values-empty">查询后可查看值分布</p>}
      {Boolean(hits.length) && !stats.values.length && <p className="field-values-empty">当前日志中没有可统计值</p>}
      {stats.highCardinality && <p className="cardinality-note">高基数字段，仅展示 5 个样例值</p>}
      {stats.values.map((item) => <button className="field-value" key={item.key} onClick={() => onFilter(item.value)} title={`筛选 ${field.name}:${item.label}`}>
        <span className="field-value-label">{item.label || "(空字符串)"}</span><strong>{item.percent < 0.1 && item.percent > 0 ? "<0.1" : item.percent.toFixed(1)}%</strong><i style={{ width: `${Math.max(item.percent, 1)}%` }}/>
      </button>)}
      <button className="exists-filter" onClick={onExists}><Filter size={11}/>仅查看存在该字段的日志 <span>{hits.length ? `${(stats.present / hits.length * 100).toFixed(1)}%` : ""}</span></button>
    </div>}
  </div>;
}

function LogRows({ hit, columns, expanded, onToggle, onDetails }: { hit: LogHit; columns: string[]; expanded: boolean; onToggle: () => void; onDetails: () => void }) {
  return <>
    <tr className={expanded ? "log-row is-expanded" : "log-row"} onClick={onToggle} aria-expanded={expanded}>
      <td className="expand-cell"><button className="row-expand" aria-label={expanded ? "收起日志" : "展开日志"}><ChevronRight size={15}/></button></td>
      <td className="time-cell">{hit.timestamp ? new Date(hit.timestamp).toLocaleString(undefined, { hour12: false }) : "—"}</td>
      {columns.map((column) => <td key={column} title={String(getPath(hit.source, column) ?? "")}>{String(getPath(hit.source, column) ?? "—")}</td>)}
      <td className="message-cell"><LevelBadge source={hit.source}/><span>{hit.message}</span></td>
    </tr>
    {expanded && <tr className="expanded-log-row"><td colSpan={columns.length + 3}><div className="expanded-log-content"><div className="expanded-log-meta"><span>{hit.index}</span><span>{hit.id}</span><button onClick={(event) => { event.stopPropagation(); onDetails(); }}><Braces size={13}/>查看完整字段</button></div><pre>{hit.message}</pre></div></td></tr>}
  </>;
}

function LevelBadge({ source }: { source: Record<string, unknown> }) {
  const level = String(source.level || source.log_level || source.severity || "").toUpperCase();
  if (!level) return null;
  return <span className={`level level-${level.toLowerCase()}`}>{level}</span>;
}

function LogDrawer({ hit, onClose }: { hit: LogHit; onClose: () => void }) {
  const entries = Object.entries(hit.source).sort(([a], [b]) => a.localeCompare(b));
  return <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><aside className="drawer"><header><div><p>日志详情</p><span>{hit.index} · {hit.id}</span></div><button className="icon-button" onClick={onClose}><X size={18}/></button></header><div className="drawer-message"><span>MESSAGE</span><p>{hit.message}</p></div><div className="document-title"><Braces size={15}/>完整文档</div><dl>{entries.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}</dd></div>)}</dl></aside></div>;
}

function EnvironmentModal({ environments, onClose, onSaved }: { environments: EnvironmentSummary[]; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false); const [testing, setTesting] = useState(false); const [message, setMessage] = useState("");
  function formValue(form: HTMLFormElement) { const data = new FormData(form); return { name: data.get("name"), color: data.get("color"), baseUrl: data.get("baseUrl"), indexPattern: data.get("indexPattern"), timestampField: data.get("timestampField"), messageField: data.get("messageField"), authType: data.get("authType"), username: data.get("username") || undefined, password: data.get("password") || undefined, apiKey: data.get("apiKey") || undefined, caCert: data.get("caCert") || undefined, tlsVerify: data.get("tlsVerify") === "on" }; }
  async function act(form: HTMLFormElement, mode: "test" | "save") { setMessage(""); if (mode === "test") setTesting(true); else setSaving(true); try { const body = formValue(form); const response = await json<{ cluster?: string; version?: string; id?: string }>(mode === "test" ? "/api/environments/test" : "/api/environments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (mode === "test") setMessage(`连接成功 · ${response.cluster} · ES ${response.version}`); else onSaved(); } catch (e) { setMessage(e instanceof Error ? e.message : "操作失败"); } finally { setTesting(false); setSaving(false); } }
  return <div className="modal-backdrop"><section className="modal"><header><div><p>日志环境</p><span>配置仅保存在服务端，浏览器不会接触 ES 凭据</span></div><button className="icon-button" onClick={onClose}><X size={18}/></button></header><div className="existing-envs">{environments.map((env) => <div key={env.id}><span className="status-dot" style={{ background: env.color }}/><strong>{env.name}</strong><span>{env.indexPattern}</span><em>{env.source === "environment" ? "ENV" : "MYSQL"}</em></div>)}</div><form onSubmit={(e) => { e.preventDefault(); act(e.currentTarget, "save"); }} className="env-form"><h3>新增环境</h3><div className="form-grid"><label>环境名称<input name="name" required placeholder="Staging"/></label><label>标识色<input name="color" type="color" defaultValue="#2dd4bf"/></label><label className="span-2">Elasticsearch 地址<input name="baseUrl" type="url" required placeholder="https://es.example.com:9200"/></label><label>索引模式<input name="indexPattern" required defaultValue="logs-*"/></label><label>认证方式<select name="authType" defaultValue="basic"><option value="basic">用户名 / 密码</option><option value="apiKey">API Key</option><option value="none">无认证</option></select></label><label>用户名<input name="username" autoComplete="off"/></label><label>密码<input name="password" type="password" autoComplete="new-password"/></label><label className="span-2">API Key<input name="apiKey" type="password" autoComplete="off" placeholder="选择 API Key 认证时填写"/></label><label>时间字段<input name="timestampField" defaultValue="@timestamp" required/></label><label>消息字段<input name="messageField" defaultValue="message" required/></label><label className="span-2">CA 证书（可选）<textarea name="caCert" rows={3} placeholder="-----BEGIN CERTIFICATE-----"/></label><label className="checkbox span-2"><input name="tlsVerify" type="checkbox" defaultChecked/>校验 TLS 证书（生产环境应保持开启）</label></div>{message && <p className="modal-message">{message}</p>}<footer><button type="button" className="ghost" disabled={testing} onClick={(e) => act(e.currentTarget.form!, "test")}>{testing ? <LoaderCircle className="spin" size={15}/> : <Activity size={15}/>}测试连接</button><button className="primary" disabled={saving}>{saving ? "保存中…" : "保存环境"}</button></footer></form></section></div>;
}
