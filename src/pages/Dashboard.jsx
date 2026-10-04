import { useEffect, useMemo, useState } from "react";
import {
  Users,
  UserX,
  Wallet,
  Clock,
  AlertTriangle,
  GraduationCap,
  Percent,
  ChevronRight,
  ClipboardList,
  UserCheck,
  Printer,
  CheckCircle2,
  CalendarDays,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Dock from "../components/Dock";
import { supabase } from "../createClient";
import { useBranchFilter } from "../context/BranchFilterContext";
import { toTitleCase } from "../utils/formatting";

const C = {
  green: "#10b981",
  red: "#f43f5e",
  indigo: "#6366f1",
  amber: "#f59e0b",
  sky: "#0ea5e9",
  axis: "#9ca3af",
  grid: "#e5e7eb",
};

// Where each card leads — change these if your routes are named differently
// "fees_status" values must match the options in your Students filter (SortByFilter)
const feesFilter = (value) => ({ path: "/students", state: { filter: { type: "fees_status", value } } });
const ROUTES = {
  students: "/students",
  revenue: "/revenue",
  exams: "/exam",
  scholarship: "/scholarship", // <- change to your scholarship applicants route
  pending: feesFilter("Pending"), //        opens Students with the Pending filter applied
  overdue: feesFilter("Course-Overdue"), // opens Students with the Course-Overdue filter applied
};

// Makes a card clickable: pointer, keyboard support, and a chevron that shows on hover
function useCardLink(to, pos, action) {
  const navigate = useNavigate();
  if (!to && !action) return { cls: "", props: {}, chevron: null };
  const target = typeof to === "string" ? { path: to } : to;
  const go = action || (() => navigate(target.path, { state: target.state }));
  return {
    cls: "group relative cursor-pointer transition-colors hover:border-primary/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
    props: {
      role: "link",
      tabIndex: 0,
      onClick: go,
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      },
    },
    chevron: (
      <ChevronRight
        className={`absolute ${pos} h-5 w-5 text-primary opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100`}
        strokeWidth={2.25}
      />
    ),
  };
}

const fmtINR = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const fmtCompact = (n) =>
  new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
const fmtNum = (n) => Number(n || 0).toLocaleString("en-IN");
const axis = { tickLine: false, axisLine: false, tick: { fontSize: 11, fill: C.axis } };

const fmtDay = (d, withYear) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", ...(withYear ? { year: "numeric" } : {}) });

const rangeLabel = (from, to) =>
  from && to
    ? `${fmtDay(from)} – ${fmtDay(to, true)}`
    : from
    ? `From ${fmtDay(from, true)}`
    : to
    ? `Until ${fmtDay(to, true)}`
    : "All time";

const pctOf = (n, d, suffix) => (d > 0 ? `${Math.round((n / d) * 100)}% ${suffix}` : undefined);

// local-time YYYY-MM-DD (what <input type="date"> and the RPC expect)
const toISO = (d) => d.toLocaleDateString("en-CA");

/* ------------------------------- UI pieces -------------------------------- */

function Card({ title, subtitle, children, className = "", to }) {
  const l = useCardLink(to, "right-4 top-4");
  return (
    <section className={`rounded-xl border border-border bg-background p-5 ${l.cls} ${className}`} {...l.props}>
      {l.chevron}
      {title && (
        <div className="mb-4">
          <h2 className="font-display text-base text-secondary">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-600",
  red: "bg-red-50 text-red-500",
  indigo: "bg-indigo-50 text-indigo-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
};

function Kpi({ icon: Icon, label, value, tone, footnote, to, onClick }) {
  const l = useCardLink(to, "bottom-4 right-4", onClick);
  return (
    <div className={`rounded-xl border border-border bg-background p-5 ${l.cls}`} {...l.props}>
      {l.chevron}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-full ${TONES[tone]}`}>
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl text-secondary">{value}</p>
      {footnote && <p className="mt-2 text-xs text-muted">{footnote}</p>}
    </div>
  );
}

function Tip({ active, payload, label, money }) {
  const items = (payload || []).filter((p) => p.value != null);
  if (!active || !items.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-medium text-secondary">{label}</p>}
      {items.map((p) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2 text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill || p.payload?.fill }} />
          {p.name}:{" "}
          <span className="font-medium text-text">{money ? fmtINR(p.value) : Number(p.value).toLocaleString("en-IN")}</span>
        </div>
      ))}
    </div>
  );
}

function Empty({ message }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted">
      {message}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-background" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-80 animate-pulse rounded-xl border border-border bg-background" />
        ))}
      </div>
    </div>
  );
}

function Row({ label, value, tone = "text-secondary" }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className={`font-medium ${tone}`}>{value}</span>
    </div>
  );
}

// Custom date range. Empty = the server default (marketing: all time, other roles: this month).
// `fallback` is the range the server actually used, so the inputs always show what you're looking at.
function DateRange({ value, onChange, fallback, allTime }) {
  const today = new Date();
  const shown = { from: value.from || fallback?.from || "", to: value.to || fallback?.to || "" };
  const presets = [
    { label: "This month", from: toISO(new Date(today.getFullYear(), today.getMonth(), 1)), to: toISO(today) },
    { label: "Last 30 days", from: toISO(new Date(today.getTime() - 29 * 86400000)), to: toISO(today) },
    allTime
      ? { label: "All time", from: "", to: "" }
      : { label: "This year", from: toISO(new Date(today.getFullYear(), 0, 1)), to: toISO(today) },
  ];
  const active = (p) => p.from === shown.from && p.to === shown.to;
  const input =
    "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-muted">
        From
        <input
          type="date"
          className={input}
          value={shown.from}
          max={shown.to || undefined}
          onChange={(e) => onChange({ ...shown, from: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted">
        To
        <input
          type="date"
          className={input}
          value={shown.to}
          min={shown.from || undefined}
          onChange={(e) => onChange({ ...shown, to: e.target.value })}
        />
      </label>
      <div className="flex gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange({ from: p.from, to: p.to })}
            className={`rounded-full border px-3 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              active(p)
                ? "border-primary/40 bg-primaryLight text-secondary"
                : "border-border text-muted hover:text-secondary"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Team leaderboard: applicants brought in per staff member (you are highlighted)
function Leaderboard({ rows }) {
  const max = Math.max(...rows.map((r) => r.applicants), 1);
  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-secondary">
              {r.name}
              {r.is_me && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-600">You</span>
              )}
            </span>
            <span className="font-medium text-secondary">{fmtNum(r.applicants)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: C.grid }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.applicants / max) * 100}%`, background: r.is_me ? C.green : C.indigo }}
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            {fmtNum(r.confirmed)} confirmed · {fmtNum(r.appeared)} appeared
          </p>
        </li>
      ))}
    </ul>
  );
}

function InactiveChooser({ counts, onSelect, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const options = [
    { key: "break", label: "On break", hint: "Students taking a break", dot: "bg-accent", count: counts.onBreak },
    { key: "discontinued", label: "Discontinued", hint: "Students who have left", dot: "bg-red-500", count: counts.discontinued },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose which inactive students to view"
        className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-base text-secondary">Which inactive students?</h2>
        <p className="mt-0.5 text-xs text-muted">Pick a list to open on the Students page.</p>
        <div className="mt-4 space-y-2">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => onSelect(o.key)}
              className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primaryLight focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${o.dot}`} />
                <span>
                  <span className="block text-sm font-medium text-secondary">{o.label}</span>
                  <span className="block text-xs text-muted">{o.hint}</span>
                </span>
              </span>
              <span className="font-display text-base text-secondary">{o.count}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-full py-2 text-sm text-muted transition-colors hover:text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- Page ----------------------------------- */

export default function Dashboard() {
  const { selectedBranch } = useBranchFilter();
  const navigate = useNavigate();
  const [askInactive, setAskInactive] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState({ from: "", to: "" }); // applicant date range ("" = no limit)
  const [showRange, setShowRange] = useState(false); // roles with date-aware numbers see the picker
  const [allTimeOk, setAllTimeOk] = useState(false); // "All time" preset only makes sense for marketing

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const { data, error } = await supabase.rpc("get_dashboard_data", {
        p_branch: selectedBranch,
        p_from: range.from || null,
        p_to: range.to || null,
      });
      if (cancelled) return;
      if (error) {
        setError(error.message || "Couldn't load the dashboard. Please try again.");
        setData(null);
      } else {
        setData(data);
        setShowRange(true);
        setAllTimeOk(!!data?.marketing);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedBranch, range.from, range.to]);

  const m = useMemo(() => {
    const bs = data?.branches || [];
    const has = (k) => bs.some((b) => b[k] !== undefined);
    const sum = (f) => bs.reduce((a, b) => a + (Number(f(b)) || 0), 0);
    const withExams = bs.filter((b) => b.exams && b.exams.conducted_this_month > 0);
    const mean = (f) => (withExams.length ? withExams.reduce((a, b) => a + Number(f(b) || 0), 0) / withExams.length : 0);

    return {
      bs,
      students: has("students"),
      fees: has("fees"),
      revenue: has("revenue_this_month"),
      exams: has("exams"),
      active: sum((b) => b.students?.active),
      inactive: sum((b) => b.students?.inactive),
      onBreak: sum((b) => b.students?.on_break),
      discontinued: sum((b) => b.students?.discontinued),
      revenueTotal: sum((b) => b.revenue_this_month),
      pendingMonth: sum((b) => b.fees?.pending_this_month),
      pendingTotal: sum((b) => b.fees?.total_pending),
      overdue: sum((b) => b.fees?.course_overdue_fees),
      overdueStudents: sum((b) => b.fees?.overdue_students),
      unpaidStudents: sum((b) => b.fees?.unpaid_this_month_students),
      examCount: sum((b) => b.exams?.conducted_this_month),
      avgAppeared: mean((b) => b.exams?.avg_students_appeared),
      avgPct: mean((b) => b.exams?.avg_percentage),
      byBranch: bs.map((b) => ({
        name: toTitleCase(b.branch),
        Active: b.students?.active ?? 0,
        Inactive: b.students?.inactive ?? 0,
        Revenue: b.revenue_this_month ?? 0,
        "Pending this month": b.fees?.pending_this_month ?? 0,
        "Total pending": b.fees?.total_pending ?? 0,
        Overdue: b.fees?.course_overdue_fees ?? 0,
        "Avg %": b.exams?.avg_percentage ?? 0,
        "Avg appeared": b.exams?.avg_students_appeared ?? 0,
        Exams: b.exams?.conducted_this_month ?? 0,
      })),
      daily: (data?.revenue_daily || []).map((d) => ({
        label: new Date(d.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        Revenue: Number(d.revenue) || 0,
      })),
    };
  }, [data]);

  // Chart data for the marketing role
  const mkd = useMemo(() => {
    const k = data?.marketing;
    if (!k) return null;
    const g = k.gender || {};
    return {
      weekly: k.trend_bucket && k.trend_bucket !== "day",
      trend: (k.trend || []).map((d) => ({
        label: fmtDay(d.date),
        "All applicants": Number(d.registered) || 0,
        "My applicants": Number(d.mine) || 0,
      })),
      funnel: [
        { stage: "Registered", "All applicants": k.total_applicants, "My applicants": k.my_applicants },
        { stage: "Admit card printed", "All applicants": k.admitcard_printed, "My applicants": k.my_admitcard_printed },
        { stage: "Confirmed", "All applicants": k.confirmed, "My applicants": k.my_confirmed },
        { stage: "Appeared", "All applicants": k.appeared, "My applicants": k.my_appeared },
      ],
      exams: (k.upcoming_exams || []).map((e) => ({
        label: fmtDay(e.date),
        "All applicants": e.applicants,
        "My applicants": e.mine,
      })),
      gender: [
        { name: "Male", value: g.male || 0, color: C.sky },
        { name: "Female", value: g.female || 0, color: C.red },
        { name: "Other", value: g.other || 0, color: C.amber },
      ].filter((x) => x.value > 0),
      branches: (k.by_branch || []).map((b) => ({
        name: toTitleCase(b.branch),
        Applicants: b.applicants,
        Confirmed: b.confirmed,
        Appeared: b.appeared,
      })),
      leaderboard: k.leaderboard || [],
    };
  }, [data]);

  const pie = [
    { name: "Active", value: m.active, color: C.green },
    { name: "On break", value: m.onBreak, color: C.amber },
    { name: "Discontinued", value: m.discontinued, color: C.red },
  ].filter((p) => p.value > 0);

  const multi = m.bs.length > 1;
  const comingSoon = data?.message;
  const mk = data?.marketing || null; // marketing role: scholarship funnel
  const sch = data?.scholarship || null; // owner / student_management: applicant summary

  const periodText = mk
    ? rangeLabel(data.period?.from, data.period?.to)
    : data?.period
    ? `${fmtDay(data.period.from)} – ${fmtDay(data.period.to, true)}`
    : "";

  return (
    <div className="min-h-screen bg-backgroundAlt">
      <Dock />

      <main className="px-6 pb-12 pt-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl text-secondary">Dashboard</h1>
              <p className="mt-1 text-sm text-muted">
                {loading
                  ? "Loading..."
                  : comingSoon
                  ? ""
                  : `${data?.scope === "all" ? "All branches" : toTitleCase(data?.scope || "")} · ${periodText}`}
              </p>
            </div>
            {showRange && <DateRange value={range} onChange={setRange} fallback={mk ? null : data?.period} allTime={allTimeOk} />}
          </div>

          {error && (
            <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          {loading ? (
            <Skeleton />
          ) : comingSoon ? (
            <Card>
              <div className="h-40">
                <Empty message={comingSoon} />
              </div>
            </Card>
          ) : data ? (
            <div className="space-y-6">
              {/* Marketing: scholarship funnel */}
              {mk && mkd && (
                <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Kpi
                    icon={ClipboardList}
                    to={ROUTES.scholarship}
                    tone="indigo"
                    label="Total applicants"
                    value={fmtNum(mk.total_applicants)}
                  />
                  <Kpi
                    icon={UserCheck}
                    to={ROUTES.scholarship}
                    tone="green"
                    label="My applicants"
                    value={fmtNum(mk.my_applicants)}
                    footnote={pctOf(mk.my_applicants, mk.total_applicants, "of all applicants")}
                  />
                  <Kpi
                    icon={Printer}
                    to={ROUTES.scholarship}
                    tone="amber"
                    label="Admit cards printed"
                    value={fmtNum(mk.admitcard_printed)}
                    footnote={pctOf(mk.admitcard_printed, mk.total_applicants, "of applicants")}
                  />
                  <Kpi
                    icon={CheckCircle2}
                    to={ROUTES.scholarship}
                    tone="sky"
                    label="Confirmed"
                    value={fmtNum(mk.confirmed)}
                    footnote={pctOf(mk.confirmed, mk.total_applicants, "of applicants")}
                  />
                  <Kpi
                    icon={GraduationCap}
                    to={ROUTES.scholarship}
                    tone="green"
                    label="Appeared for exam"
                    value={fmtNum(mk.appeared)}
                    footnote={pctOf(mk.appeared, mk.total_applicants, "of applicants")}
                  />
                  <Kpi
                    icon={GraduationCap}
                    to={ROUTES.scholarship}
                    tone="indigo"
                    label="My applicants appeared"
                    value={fmtNum(mk.my_appeared)}
                    footnote={pctOf(mk.my_appeared, mk.my_applicants, "of my applicants")}
                  />
                  <Kpi
                    icon={CalendarDays}
                    to={ROUTES.scholarship}
                    tone="red"
                    label="Upcoming exam"
                    value={mk.upcoming_exam_date ? fmtDay(mk.upcoming_exam_date, true) : "None yet"}
                    footnote={mk.upcoming_exam_date ? "Nearest scheduled date" : mk.upcoming_exam_message}
                  />
                </div>

                {/* Trend + funnel */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <Card
                    title="Registrations over time"
                    subtitle={`New applicants per ${mkd.weekly ? "week" : "day"} · ${periodText}`}
                    className="lg:col-span-2"
                  >
                    <div className="h-72">
                      {mk.total_applicants > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={mkd.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="mkAll" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={C.indigo} stopOpacity={0.3} />
                                <stop offset="100%" stopColor={C.indigo} stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="mkMine" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={C.green} stopOpacity={0.3} />
                                <stop offset="100%" stopColor={C.green} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 3" />
                            <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={24} {...axis} />
                            <YAxis width={36} allowDecimals={false} {...axis} />
                            <Tooltip content={<Tip />} cursor={{ stroke: C.grid }} />
                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                            <Area type="monotone" dataKey="All applicants" stroke={C.indigo} strokeWidth={2.5} fill="url(#mkAll)" />
                            <Area type="monotone" dataKey="My applicants" stroke={C.green} strokeWidth={2.5} fill="url(#mkMine)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <Empty message="No applicants in this period." />
                      )}
                    </div>
                  </Card>

                  <Card title="Applicant funnel" subtitle="Where applicants are in the process">
                    <div className="h-72">
                      {mk.total_applicants > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={mkd.funnel} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                            <CartesianGrid horizontal={false} stroke={C.grid} strokeDasharray="3 3" />
                            <XAxis type="number" allowDecimals={false} {...axis} />
                            <YAxis type="category" dataKey="stage" width={112} {...axis} />
                            <Tooltip content={<Tip />} cursor={{ fill: "rgba(99,102,241,0.05)" }} />
                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                            <Bar dataKey="All applicants" fill={C.indigo} radius={[0, 4, 4, 0]} maxBarSize={16} />
                            <Bar dataKey="My applicants" fill={C.green} radius={[0, 4, 4, 0]} maxBarSize={16} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <Empty message="No applicants in this period." />
                      )}
                    </div>
                  </Card>
                </div>

                {/* Upcoming exams + gender */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <Card
                    title="Upcoming exam dates"
                    subtitle="Applicants scheduled on each date (not affected by the date range)"
                    className="lg:col-span-2"
                  >
                    <div className="h-72">
                      {mkd.exams.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={mkd.exams} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 3" />
                            <XAxis dataKey="label" {...axis} />
                            <YAxis width={36} allowDecimals={false} {...axis} />
                            <Tooltip content={<Tip />} cursor={{ fill: "rgba(14,165,233,0.06)" }} />
                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                            <Bar dataKey="All applicants" fill={C.sky} radius={[4, 4, 0, 0]} maxBarSize={32} />
                            <Bar dataKey="My applicants" fill={C.green} radius={[4, 4, 0, 0]} maxBarSize={32} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <Empty message="No upcoming exams scheduled yet." />
                      )}
                    </div>
                  </Card>

                  <Card title="Gender split" subtitle="Applicants in this period">
                    <div className="h-72">
                      {mkd.gender.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={mkd.gender} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} stroke="none">
                              {mkd.gender.map((p) => (
                                <Cell key={p.name} fill={p.color} />
                              ))}
                            </Pie>
                            <Tooltip content={<Tip />} />
                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <Empty message="No applicants in this period." />
                      )}
                    </div>
                  </Card>
                </div>

                {/* Branches + team */}
                {(mkd.branches.length > 1 || mkd.leaderboard.length > 0) && (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {mkd.branches.length > 1 && (
                      <Card title="Applicants by branch" subtitle="Registered, confirmed and appeared">
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={mkd.branches} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                              <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 3" />
                              <XAxis dataKey="name" {...axis} />
                              <YAxis width={36} allowDecimals={false} {...axis} />
                              <Tooltip content={<Tip />} cursor={{ fill: "rgba(99,102,241,0.05)" }} />
                              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                              <Bar dataKey="Applicants" fill={C.indigo} radius={[4, 4, 0, 0]} maxBarSize={22} />
                              <Bar dataKey="Confirmed" fill={C.sky} radius={[4, 4, 0, 0]} maxBarSize={22} />
                              <Bar dataKey="Appeared" fill={C.green} radius={[4, 4, 0, 0]} maxBarSize={22} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </Card>
                    )}

                    {mkd.leaderboard.length > 0 && (
                      <Card
                        title="Team leaderboard"
                        subtitle="Applicants brought in by each staff member"
                        className={mkd.branches.length > 1 ? "" : "lg:col-span-2"}
                      >
                        <Leaderboard rows={mkd.leaderboard} />
                      </Card>
                    )}
                  </div>
                )}
                </>
              )}

              {!mk && (
                <>
                  {/* KPI cards */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {m.students && (
                      <>
                        <Kpi icon={Users} to={ROUTES.students} tone="green" label="Active students" value={m.active.toLocaleString("en-IN")} />
                        <Kpi
                          icon={UserX} onClick={() => setAskInactive(true)}
                          tone="red"
                          label="Inactive students"
                          value={m.inactive.toLocaleString("en-IN")}
                          footnote={`${m.onBreak} on break · ${m.discontinued} discontinued`}
                        />
                      </>
                    )}
                    {m.revenue && (
                      <Kpi icon={Wallet} to={ROUTES.revenue} tone="indigo" label="Revenue" value={fmtINR(m.revenueTotal)} />
                    )}
                    {m.fees && (
                      <>
                        <Kpi
                          icon={Clock} to={ROUTES.pending}
                          tone="amber"
                          label="Pending this month"
                          value={fmtINR(m.pendingMonth)}
                          footnote={`${m.unpaidStudents} students yet to pay`}
                        />
                        <Kpi
                          icon={Clock} to={ROUTES.pending}
                          tone="amber"
                          label="Total pending fees"
                          value={fmtINR(m.pendingTotal)}
                          footnote="Until today"
                        />
                        <Kpi
                          icon={AlertTriangle} to={ROUTES.overdue}
                          tone="red"
                          label="Course overdue fees"
                          value={fmtINR(m.overdue)}
                          footnote={`${m.overdueStudents} students with completed courses`}
                        />
                      </>
                    )}
                    {m.exams && (
                      <>
                        <Kpi
                          icon={GraduationCap} to={ROUTES.exams}
                          tone="sky"
                          label="Exams conducted"
                          value={m.examCount}
                          footnote={`~${m.avgAppeared.toFixed(1)} students per exam`}
                        />
                        <Kpi icon={Percent} to={ROUTES.exams} tone="indigo" label="Avg. score" value={`${m.avgPct.toFixed(1)}%`} />
                      </>
                    )}
                  </div>

                  {/* Scholarship applicants (owner / student management) */}
                  {sch && (
                    <div>
                      <div className="mb-3">
                        <h2 className="font-display text-base text-secondary">Scholarship applicants</h2>
                        <p className="mt-0.5 text-xs text-muted">Registered {periodText}</p>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <Kpi
                          icon={ClipboardList}
                          to={ROUTES.scholarship}
                          tone="indigo"
                          label="Total applicants"
                          value={fmtNum(sch.total_applicants)}
                        />
                        <Kpi
                          icon={Printer}
                          to={ROUTES.scholarship}
                          tone="amber"
                          label="Admit cards printed"
                          value={fmtNum(sch.admitcard_printed)}
                          footnote={pctOf(sch.admitcard_printed, sch.total_applicants, "of applicants")}
                        />
                        <Kpi
                          icon={CheckCircle2}
                          to={ROUTES.scholarship}
                          tone="sky"
                          label="Confirmed"
                          value={fmtNum(sch.confirmed)}
                          footnote={pctOf(sch.confirmed, sch.total_applicants, "of applicants")}
                        />
                      </div>
                    </div>
                  )}

                  {/* Revenue graphs */}
                  {m.revenue && (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                      <Card title="Revenue trend" to={ROUTES.revenue} subtitle={`Fees collected per day · ${periodText}`} className="lg:col-span-2">
                        <div className="h-72">
                          {m.revenueTotal > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={m.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                <defs>
                                  <linearGradient id="dashRev" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={C.green} stopOpacity={0.35} />
                                    <stop offset="100%" stopColor={C.green} stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 3" />
                                <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={24} {...axis} />
                                <YAxis width={48} tickFormatter={fmtCompact} {...axis} />
                                <Tooltip content={<Tip money />} cursor={{ stroke: C.grid }} />
                                <Area type="monotone" dataKey="Revenue" stroke={C.green} strokeWidth={2.5} fill="url(#dashRev)" />
                              </AreaChart>
                            </ResponsiveContainer>
                          ) : (
                            <Empty message="No revenue recorded in this period." />
                          )}
                        </div>
                      </Card>

                      <Card title="Revenue by branch" to={ROUTES.revenue} subtitle={periodText}>
                        <div className="h-72">
                          {m.revenueTotal > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={m.byBranch} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 3" />
                                <XAxis dataKey="name" {...axis} />
                                <YAxis width={48} tickFormatter={fmtCompact} {...axis} />
                                <Tooltip content={<Tip money />} cursor={{ fill: "rgba(16,185,129,0.06)" }} />
                                <Bar dataKey="Revenue" fill={C.green} radius={[6, 6, 0, 0]} maxBarSize={40} />
                              </BarChart>
                            </ResponsiveContainer>
                          ) : (
                            <Empty message="Nothing to compare yet." />
                          )}
                        </div>
                      </Card>
                    </div>
                  )}

                  {/* Fees + students graphs */}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {m.fees && (
                      <Card title="Fees pending" to={ROUTES.pending} subtitle="This month vs total vs course-overdue, by branch">
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={m.byBranch} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                              <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 3" />
                              <XAxis dataKey="name" {...axis} />
                              <YAxis width={48} tickFormatter={fmtCompact} {...axis} />
                              <Tooltip content={<Tip money />} cursor={{ fill: "rgba(99,102,241,0.05)" }} />
                              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                              <Bar dataKey="Pending this month" fill={C.amber} radius={[4, 4, 0, 0]} maxBarSize={22} />
                              <Bar dataKey="Total pending" fill={C.indigo} radius={[4, 4, 0, 0]} maxBarSize={22} />
                              <Bar dataKey="Overdue" fill={C.red} radius={[4, 4, 0, 0]} maxBarSize={22} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </Card>
                    )}

                    {m.students && (
                      <Card title="Student status" to={ROUTES.students} subtitle="Active vs on break vs discontinued">
                        <div className="h-72">
                          {pie.length ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2} stroke="none">
                                  {pie.map((p) => (
                                    <Cell key={p.name} fill={p.color} />
                                  ))}
                                </Pie>
                                <Tooltip content={<Tip />} />
                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                              </PieChart>
                            </ResponsiveContainer>
                          ) : (
                            <Empty message="No students yet." />
                          )}
                        </div>
                      </Card>
                    )}

                    {m.students && multi && (
                      <Card title="Students by branch" to={ROUTES.students} subtitle="Active vs inactive">
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={m.byBranch} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                              <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 3" />
                              <XAxis dataKey="name" {...axis} />
                              <YAxis width={36} {...axis} />
                              <Tooltip content={<Tip />} cursor={{ fill: "rgba(99,102,241,0.05)" }} />
                              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                              <Bar dataKey="Active" stackId="s" fill={C.green} maxBarSize={40} />
                              <Bar dataKey="Inactive" stackId="s" fill={C.red} radius={[6, 6, 0, 0]} maxBarSize={40} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </Card>
                    )}

                    {m.exams && (
                      <Card title="Exam performance" to={ROUTES.exams} subtitle="Avg score % and avg students appeared, by branch">
                        <div className="h-72">
                          {m.examCount > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={m.byBranch} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 3" />
                                <XAxis dataKey="name" {...axis} />
                                <YAxis width={36} {...axis} />
                                <Tooltip content={<Tip />} cursor={{ fill: "rgba(14,165,233,0.06)" }} />
                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                                <Bar dataKey="Avg %" fill={C.indigo} radius={[4, 4, 0, 0]} maxBarSize={26} />
                                <Bar dataKey="Avg appeared" fill={C.sky} radius={[4, 4, 0, 0]} maxBarSize={26} />
                              </BarChart>
                            </ResponsiveContainer>
                          ) : (
                            <Empty message="No exams conducted in this period." />
                          )}
                        </div>
                      </Card>
                    )}
                  </div>

                  {/* Per-branch cards */}
                  {multi && (
                    <div>
                      <h2 className="mb-3 font-display text-base text-secondary">Branches</h2>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {m.bs.map((b) => (
                          <div key={b.branch} className="space-y-2 rounded-xl border border-border bg-background p-5">
                            <p className="mb-1 font-display text-base text-secondary">{toTitleCase(b.branch)}</p>
                            {b.students && (
                              <>
                                <Row label="Active" value={b.students.active} tone="text-emerald-600" />
                                <Row label="Inactive" value={b.students.inactive} tone="text-red-500" />
                              </>
                            )}
                            {b.revenue_this_month !== undefined && <Row label="Revenue" value={fmtINR(b.revenue_this_month)} />}
                            {b.fees && (
                              <>
                                <Row label="Pending (month)" value={fmtINR(b.fees.pending_this_month)} tone="text-amber-600" />
                                <Row label="Overdue" value={fmtINR(b.fees.course_overdue_fees)} tone="text-red-500" />
                              </>
                            )}
                            {b.exams && (
                              <>
                                <Row label="Exams" value={b.exams.conducted_this_month} />
                                <Row label="Avg score" value={`${Number(b.exams.avg_percentage).toFixed(1)}%`} />
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
      </main>

      {askInactive && (
        <InactiveChooser
          counts={{ onBreak: m.onBreak, discontinued: m.discontinued }}
          onClose={() => setAskInactive(false)}
          onSelect={(view) => {
            setAskInactive(false);
            navigate("/students", { state: { view } }); // Students opens on this list
          }}
        />
      )}
    </div>
  );
}