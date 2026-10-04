import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Wallet,
  TrendingDown,
  TrendingUp,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  CalendarRange,
  Trash2,
  Printer,
  Download,
  ChevronDown,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
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

/* -------------------------------------------------------------------------- */
/*  CONFIG — adjust these if your expense RPC / column names differ            */
/* -------------------------------------------------------------------------- */

// Same signature as get_transactions is assumed for the expense RPC.
const EXPENSE_RPC = "get_expenses";
const EXPENSE_SORT_KEY = "spent_on";
// Assumed to mirror manage_transaction: rpc(name, { action: "delete", <param>: id })
const EXPENSE_MANAGE_RPC = "manage_expense";
const EXPENSE_ID_PARAM = "expense_id";

// Normalise a raw expense row into { amount, date, category }
function normalizeExpense(row) {
  return {
    amount: Number(row.amount ?? row.amount_spent ?? row.expense_amount ?? 0),
    date: new Date(row.spent_on ?? row.expense_date ?? row.paid_on ?? row.created_at),
    category: row.category ?? row.expense_type ?? row.expense_category ?? "Other",
    description: row.description ?? row.note ?? row.notes ?? row.title ?? row.details ?? "",
    id: row.expense_id ?? row.id ?? null,
    branch: row.branch ?? "",
  };
}

// Chart colours (Recharts needs real colour values, not Tailwind classes)
const COLORS = {
  revenue: "#10b981",
  expense: "#f43f5e",
  net: "#6366f1",
  axis: "#9ca3af",
  grid: "#e5e7eb",
};
const CATEGORY_COLORS = ["#6366f1", "#f43f5e", "#f59e0b", "#10b981", "#0ea5e9", "#a855f7", "#94a3b8"];

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "month", label: "This month", months: 1 },
  { key: "30d", label: "30 days" },
  { key: "6m", label: "6 months", months: 6 },
  { key: "12m", label: "12 months", months: 12 },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const fmtINR = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const fmtCompact = (n) =>
  new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function parseInputDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
const fmtDate = (d) =>
  d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

function labelFor(d, unit) {
  if (unit === "hour") return d.toLocaleTimeString("en-IN", { hour: "numeric", hour12: true }).toUpperCase();
  if (unit === "day") return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

// CSV helpers -------------------------------------------------------------
function csvCell(value) {
  if (value == null) return "";
  let str = String(value);
  // Stop spreadsheets from treating text as a formula
  if (typeof value === "string" && /^[=+\-@]/.test(str)) str = `'${str}`;
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function downloadCSV(filename, headers, rows) {
  const text = [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Fetch every page of a paginated RPC (same shape as get_transactions).
async function fetchAll(rpcName, baseParams, sortBy) {
  const size = 1000;
  let page = 1;
  let all = [];
  while (true) {
    const { data, error } = await supabase.rpc(rpcName, {
      ...baseParams,
      p_page: page,
      p_page_size: size,
      p_search: null,
      p_sort_by: sortBy,
      p_sort_dir: "desc",
    });
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    const total = data[0]?.total_count ?? all.length;
    if (data.length < size || all.length >= total) break;
    page += 1;
  }
  return all;
}

function pctChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

/* -------------------------------------------------------------------------- */
/*  Small UI pieces                                                            */
/* -------------------------------------------------------------------------- */

function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`rounded-xl border border-border bg-background p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-display text-base text-secondary">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function Delta({ value, inverse = false }) {
  if (value == null || !isFinite(value)) return <span className="text-xs text-muted">No prior data</span>;
  const up = value >= 0;
  const good = inverse ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={[
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
        good ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600",
      ].join(" ")}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, tone, delta, inverse, footnote }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-500",
    indigo: "bg-indigo-50 text-indigo-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-full ${tones[tone]}`}>
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl text-secondary">{value}</p>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted">
        {delta !== undefined && <Delta value={delta} inverse={inverse} />}
        {footnote && <span>{footnote}</span>}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  const items = (payload || []).filter((p) => p.value != null);
  if (!active || !items.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-medium text-secondary">{label}</p>}
      {items.map((p) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2 text-muted">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: p.color || p.stroke || p.fill || p.payload?.fill }}
          />
          {p.name}: <span className="font-medium text-text">{fmtINR(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ message }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted">
      {message}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-background p-5">
            <div className="h-3 w-24 animate-pulse rounded bg-border/60" />
            <div className="mt-4 h-6 w-32 animate-pulse rounded bg-border/50" />
            <div className="mt-3 h-3 w-16 animate-pulse rounded bg-border/40" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-80 animate-pulse rounded-xl border border-border bg-background" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl border border-border bg-background" />
    </div>
  );
}

function ListCard({
  title,
  subtitle,
  total,
  totalClass,
  rows,
  emptyMessage,
  step = 50,
  filters,
  activeFilter,
  onFilterChange,
  itemLabel = "item",
  onDelete,
  expanded = false,
}) {
  const [visible, setVisible] = useState(step);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const shown = expanded ? rows : rows.slice(0, visible);
  const deletable = rows.filter((r) => r.deleteId != null);
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedTotal = selectedRows.reduce((sum, r) => sum + (r.value || 0), 0);
  const allSelected = deletable.length > 0 && selectedRows.length === deletable.length;

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(deletable.map((r) => r.id)));
  }

  async function runDelete(list) {
    if (!list.length || busy) return;
    const message =
      list.length === 1
        ? `Delete this ${itemLabel}? This can't be undone.`
        : `Delete ${list.length} ${itemLabel}s? This can't be undone.`;
    if (!window.confirm(message)) return;

    setBusy(true);
    const failedIds = await onDelete(list.map((r) => r.deleteId));
    setBusy(false);
    // Keep only the ones that failed selected
    setSelected(new Set(list.filter((r) => failedIds.includes(r.deleteId)).map((r) => r.id)));
  }

  return (
    <Card
      title={title}
      subtitle={subtitle}
      className="print-flow"
      action={
        <div className="text-right">
          <p className="text-xs text-muted">Total</p>
          <p className={`font-display text-base ${totalClass}`}>{total}</p>
        </div>
      }
    >
      {filters && filters.length > 1 && (
        <div className="mb-3 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto print:hidden" role="group" aria-label="Filter by category">
          {filters.map((f) => {
            const active = f.key === activeFilter;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => onFilterChange(f.key)}
                className={[
                  "rounded-full border px-3 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  active
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-background text-muted hover:bg-primaryLight hover:text-secondary",
                ].join(" ")}
              >
                {f.label} <span className={active ? "text-white/80" : "text-muted/70"}>{f.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {deletable.length > 0 && (
        <div
          className={[
            "mb-2 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors print:hidden",
            selectedRows.length ? "bg-primaryLight" : "bg-backgroundAlt",
          ].join(" ")}
        >
          <label className="flex min-w-0 cursor-pointer items-center gap-3 text-muted">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              disabled={busy}
              className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
              aria-label={`Select all ${itemLabel}s`}
            />
            <span className="truncate">
              {selectedRows.length ? (
                <>
                  <span className="font-medium text-secondary">{selectedRows.length} selected</span>
                  {" · "}
                  {fmtINR(selectedTotal)}
                </>
              ) : (
                "Select all"
              )}
            </span>
          </label>

          {selectedRows.length > 0 && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                disabled={busy}
                className="rounded-full px-3 py-1 text-xs text-muted transition-colors hover:text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => runDelete(selectedRows)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                {busy ? "Deleting..." : "Delete"}
              </button>
            </div>
          )}
        </div>
      )}

      {rows.length ? (
        <>
          <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto pr-1 print:max-h-none print:overflow-visible">
            {shown.map((r) => {
              const canDelete = r.deleteId != null;
              const isSelected = selected.has(r.id);
              return (
                <li
                  key={r.id}
                  className={[
                    "group flex items-center gap-3 px-1 py-2.5 transition-colors print:break-inside-avoid",
                    isSelected ? "bg-primaryLight/50" : "",
                  ].join(" ")}
                >
                  {canDelete ? (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(r.id)}
                      disabled={busy}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-primary print:hidden"
                      aria-label={`Select ${r.primary}`}
                    />
                  ) : (
                    <span className="w-4 shrink-0 print:hidden" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-secondary">{r.primary}</p>
                    <p className="truncate text-xs text-muted">{r.secondary}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-medium ${r.tone}`}>{r.amount}</span>
                  {canDelete ? (
                    <button
                      type="button"
                      aria-label={`Delete ${r.primary}`}
                      title="Delete"
                      disabled={busy}
                      onClick={() => runDelete([r])}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-red-500 opacity-0 transition-all hover:bg-red-50 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-40 [@media(hover:none)]:opacity-100 print:hidden"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2} />
                    </button>
                  ) : (
                    <span className="w-7 shrink-0 print:hidden" />
                  )}
                </li>
              );
            })}
          </ul>
          {rows.length > visible && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + step)}
              className="mt-3 w-full print:hidden rounded-full border border-border py-2 text-sm text-muted transition-colors hover:bg-primaryLight hover:text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Show more ({rows.length - visible} left)
            </button>
          )}
        </>
      ) : (
        <div className="h-40">
          <EmptyChart message={emptyMessage} />
        </div>
      )}
    </Card>
  );
}

const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: COLORS.axis },
};

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function Revenue() {
  const { selectedBranch } = useBranchFilter();
  const [transactions, setTransactions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expenseWarning, setExpenseWarning] = useState("");
  const [period, setPeriod] = useState("month");
  const [expenseCategory, setExpenseCategory] = useState("all");
  const [reloadTick, setReloadTick] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);

  // Expand the lists while the print dialog is open, restore afterwards
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  useEffect(() => {
    function onDown(e) {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function handlePrint() {
    flushSync(() => setPrinting(true));
    window.print();
  }
  const silentRef = useRef(false);

  // Refetch without flashing the page skeleton
  function reload() {
    silentRef.current = true;
    setReloadTick((t) => t + 1);
  }

  // Deletes ids one RPC at a time in small batches; returns the ids that failed.
  async function deleteMany(rpcName, idParam, ids) {
    const failed = [];
    let firstError = "";
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      const results = await Promise.allSettled(
        chunk.map((id) => supabase.rpc(rpcName, { action: "delete", [idParam]: id }))
      );
      results.forEach((r, j) => {
        const err = r.status === "rejected" ? r.reason : r.value?.error;
        if (err) {
          failed.push(chunk[j]);
          if (!firstError) firstError = err.message || "Delete failed.";
        }
      });
    }
    if (failed.length) {
      alert(`${ids.length - failed.length} deleted, ${failed.length} couldn't be deleted. ${firstError}`);
    }
    reload();
    return failed;
  }
  const todayStr = dayKey(new Date());
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 29));
  });
  const [customTo, setCustomTo] = useState(() => dayKey(new Date()));

  function changeFrom(value) {
    setCustomFrom(value);
    if (value && customTo && value > customTo) setCustomTo(value);
  }
  function changeTo(value) {
    setCustomTo(value);
    if (value && customFrom && value < customFrom) setCustomFrom(value);
  }
  function applyQuickRange(kind) {
    const n = new Date();
    if (kind === "month") {
      setCustomFrom(dayKey(new Date(n.getFullYear(), n.getMonth(), 1)));
      setCustomTo(dayKey(n));
    } else if (kind === "lastMonth") {
      setCustomFrom(dayKey(new Date(n.getFullYear(), n.getMonth() - 1, 1)));
      setCustomTo(dayKey(new Date(n.getFullYear(), n.getMonth(), 0)));
    } else if (kind === "year") {
      setCustomFrom(dayKey(new Date(n.getFullYear(), 0, 1)));
      setCustomTo(dayKey(n));
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!silentRef.current) setLoading(true);
      silentRef.current = false;
      setError("");
      setExpenseWarning("");

      const [txResult, exResult] = await Promise.allSettled([
        fetchAll("get_transactions", { p_branch: selectedBranch }, "paid_on"),
        fetchAll(EXPENSE_RPC, { p_branch: selectedBranch }, EXPENSE_SORT_KEY),
      ]);

      if (cancelled) return;

      if (txResult.status === "fulfilled") {
        setTransactions(txResult.value);
      } else {
        setTransactions([]);
        setError(txResult.reason?.message || "Couldn't load transactions. Please try again.");
      }

      if (exResult.status === "fulfilled") {
        setExpenses(exResult.value.map(normalizeExpense).filter((e) => !isNaN(e.date)));
      } else {
        setExpenses([]);
        setExpenseWarning(
          exResult.reason?.message
            ? `Couldn't load expenses: ${exResult.reason.message}`
            : "Couldn't load expenses. Showing revenue only."
        );
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedBranch, reloadTick]);

  const model = useMemo(() => {
    const cfg = PERIODS.find((p) => p.key === period);
    const now = new Date();
    const DAY = 86400000;

    const txs = transactions
      .map((t) => ({ ...t, _date: new Date(t.paid_on), _amount: Number(t.amount_paid) || 0 }))
      .filter((t) => !isNaN(t._date));

    // Do the timestamps carry a real time of day? (date-only columns don't)
    const hasTime = txs.some((t) => {
      const raw = String(t.paid_on);
      return raw.length > 10 && !/T00:00:00(\.0+)?(Z|\+00:00)?$/.test(raw);
    });

    // Period window
    let start;
    let end = endOfDay(now);
    if (period === "today") {
      start = startOfDay(now);
    } else if (period === "30d") {
      start = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
    } else if (cfg.months) {
      start = new Date(now.getFullYear(), now.getMonth() - (cfg.months - 1), 1);
      // "This month" runs from the 1st to the last day of the month
      if (period === "month") end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else if (period === "custom") {
      let from = parseInputDate(customFrom) || startOfDay(new Date(now.getTime() - 29 * DAY));
      let to = parseInputDate(customTo) || startOfDay(now);
      if (from > to) [from, to] = [to, from];
      start = startOfDay(from);
      end = endOfDay(to);
    } else {
      const all = [...txs.map((t) => t._date), ...expenses.map((e) => e.date)];
      start = all.length ? startOfMonth(new Date(Math.min(...all))) : startOfMonth(now);
    }

    // Chart granularity
    const spanDays = Math.round((startOfDay(end) - start) / DAY) + 1;
    let unit;
    if (period === "today" || period === "custom") {
      unit = spanDays <= 1 ? (hasTime ? "hour" : "day") : spanDays <= 92 ? "day" : "month";
    } else {
      unit = period === "30d" || period === "month" ? "day" : "month";
    }

    // Previous window of identical length (for % change)
    let prevStart = null;
    let prevEnd = null;
    if (period !== "all") {
      prevEnd = new Date(start.getTime() - 1);
      prevStart = cfg.months
        ? new Date(start.getFullYear(), start.getMonth() - cfg.months, 1)
        : new Date(start.getTime() - spanDays * DAY);
    }

    const inRange = (d, x, y) => d >= x && d <= y;
    const curTx = txs.filter((t) => inRange(t._date, start, end));
    const curEx = expenses.filter((e) => inRange(e.date, start, end));
    const prevTx = prevStart ? txs.filter((t) => inRange(t._date, prevStart, prevEnd)) : [];
    const prevEx = prevStart ? expenses.filter((e) => inRange(e.date, prevStart, prevEnd)) : [];

    const sum = (arr, f) => arr.reduce((acc, x) => acc + f(x), 0);
    const revenue = sum(curTx, (t) => t._amount);
    const spend = sum(curEx, (e) => e.amount);
    const net = revenue - spend;
    const prevRevenue = sum(prevTx, (t) => t._amount);
    const prevSpend = sum(prevEx, (e) => e.amount);
    const prevNet = prevRevenue - prevSpend;

    // Buckets
    const keyOf =
      unit === "hour"
        ? (d) => `${dayKey(d)}-${pad(d.getHours())}`
        : unit === "day"
        ? dayKey
        : monthKey;
    const bucketEnd = end;
    const buckets = new Map();
    const cursor = unit === "month" ? startOfMonth(start) : new Date(start);
    while (cursor <= bucketEnd) {
      buckets.set(keyOf(cursor), {
        key: keyOf(cursor),
        label: labelFor(cursor, unit),
        revenue: cursor > now ? null : 0,
        expenses: cursor > now ? null : 0,
        net: 0,
      });
      if (unit === "hour") cursor.setHours(cursor.getHours() + 1);
      else if (unit === "day") cursor.setDate(cursor.getDate() + 1);
      else cursor.setMonth(cursor.getMonth() + 1, 1);
    }
    curTx.forEach((t) => {
      const b = buckets.get(keyOf(t._date));
      if (b) b.revenue = (b.revenue ?? 0) + t._amount;
    });
    curEx.forEach((e) => {
      const b = buckets.get(keyOf(e.date));
      if (b) b.expenses = (b.expenses ?? 0) + e.amount;
    });
    const series = [...buckets.values()].map((b) => ({
      ...b,
      net: b.revenue == null && b.expenses == null ? null : (b.revenue ?? 0) - (b.expenses ?? 0),
    }));

    // Expense categories
    const catMap = {};
    curEx.forEach((e) => {
      const k = toTitleCase(String(e.category)) || "Other";
      catMap[k] = (catMap[k] || 0) + e.amount;
    });
    let categories = Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    if (categories.length > 6) {
      const rest = categories.slice(6).reduce((s, c) => s + c.value, 0);
      categories = [...categories.slice(0, 6), { name: "Other", value: rest }];
    }

    // Top payees
    const payeeMap = {};
    curTx.forEach((t) => {
      const k = t.payee ? toTitleCase(t.payee) : "Unknown";
      payeeMap[k] = (payeeMap[k] || 0) + t._amount;
    });
    const payees = Object.entries(payeeMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const recent = [...curTx].sort((a, b) => b._date - a._date).slice(0, 6);

    return {
      unit,
      start,
      end,
      hasCompare: period !== "all",
      revenue,
      spend,
      net,
      count: curTx.length,
      avg: curTx.length ? revenue / curTx.length : 0,
      margin: revenue ? (net / revenue) * 100 : 0,
      deltaRevenue: pctChange(revenue, prevRevenue),
      deltaSpend: pctChange(spend, prevSpend),
      deltaNet: prevNet ? ((net - prevNet) / Math.abs(prevNet)) * 100 : null,
      prevCount: prevTx.length,
      series,
      categories,
      payees,
      recent,
      txList: [...curTx].sort((a, b) => b._date - a._date),
      exList: [...curEx].sort((a, b) => b.date - a.date),
    };
  }, [transactions, expenses, period, customFrom, customTo]);

  const periodLabel = PERIODS.find((p) => p.key === period)?.label.toLowerCase();
  const rangeText =
    period === "today"
      ? "today"
      : period === "all"
      ? "all time"
      : period === "month"
      ? "this month"
      : period === "custom"
      ? `${fmtDate(model.start)} – ${fmtDate(model.end)}`
      : `the last ${periodLabel}`;
  const hasAnyData = model.revenue > 0 || model.spend > 0;

  const txRows = model.txList.map((t, i) => ({
    id: t.transaction_id ?? `${t.receipt_no}-${i}`,
    primary: t.student_name ? toTitleCase(t.student_name) : t.payee ? toTitleCase(t.payee) : "—",
    secondary: [t.receipt_no, fmtDate(t._date), t.branch ? toTitleCase(t.branch) : null]
      .filter(Boolean)
      .join(" · "),
    value: t._amount,
    deleteId: t.transaction_id ?? null,
    amount: `+${fmtINR(t._amount)}`,
    tone: "text-emerald-600",
  }));

  const exRows = model.exList.map((e, i) => {
    const cat = toTitleCase(String(e.category)) || "Other";
    return {
      id: e.id ?? `ex-${i}`,
      category: cat,
      value: e.amount,
      deleteId: e.id ?? null,
      primary: e.description || cat,
      secondary: [e.description ? cat : null, fmtDate(e.date)].filter(Boolean).join(" · "),
      amount: `-${fmtINR(e.amount)}`,
      tone: "text-red-500",
    };
  });
  const listKey = `${period}-${customFrom}-${customTo}-${selectedBranch}`;

  // Category filter for the expenses list
  const categoryCounts = {};
  exRows.forEach((r) => {
    categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
  });
  const expenseFilters = [
    { key: "all", label: "All", count: exRows.length },
    ...Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ key: name, label: name, count })),
  ];
  const activeCategory = expenseFilters.some((f) => f.key === expenseCategory) ? expenseCategory : "all";
  const visibleExRows = activeCategory === "all" ? exRows : exRows.filter((r) => r.category === activeCategory);
  const visibleExTotal = visibleExRows.reduce((sum, r) => sum + r.value, 0);

  const summaryRows = model.series.filter((b) => b.revenue != null);

  function exportCSV(kind) {
    setExportOpen(false);
    const slug = String(selectedBranch || "all-branches").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const stem = `${slug}_${dayKey(model.start)}_to_${dayKey(model.end)}`;

    if (kind === "transactions") {
      downloadCSV(
        `transactions_${stem}.csv`,
        ["Receipt No", "Date", "Student Name", "Roll Number", "Payee", "Branch", "Amount Paid"],
        model.txList.map((t) => [
          t.receipt_no,
          dayKey(t._date),
          t.student_name,
          t.roll_number,
          t.payee,
          t.branch ? toTitleCase(t.branch) : "",
          t._amount,
        ])
      );
    } else if (kind === "expenses") {
      downloadCSV(
        `expenses_${stem}.csv`,
        ["Date", "Category", "Description", "Branch", "Amount"],
        model.exList.map((e) => [
          dayKey(e.date),
          toTitleCase(String(e.category)) || "Other",
          e.description,
          e.branch ? toTitleCase(e.branch) : "",
          e.amount,
        ])
      );
    } else {
      downloadCSV(
        `summary_${stem}.csv`,
        [model.unit === "hour" ? "Hour" : model.unit === "day" ? "Date" : "Month", "Revenue", "Expenses", "Net"],
        [
          ...summaryRows.map((b) => [b.key, b.revenue, b.expenses, b.net]),
          ["Total", model.revenue, model.spend, model.net],
        ]
      );
    }
  }

  return (
    <div className="min-h-screen bg-backgroundAlt print:min-h-0 print:bg-white">
      <style>{`@media print {
        @page { size: A4; margin: 12mm; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        section { break-inside: avoid; }
        section.print-flow { break-inside: auto; }
      }`}</style>

      <div className="print:hidden">
        <Dock />
      </div>

      <main className="px-6 pb-12 pt-24 print:p-0">
        <div className="mx-auto max-w-6xl print:max-w-none">
          {/* Header */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-2xl text-secondary">Revenue</h1>
              <p className="mt-1 text-sm text-muted">
                {loading
                  ? "Loading records..."
                  : `Earnings and expenses for ${rangeText}`}
              </p>
              <p className="mt-1 hidden text-xs text-muted print:block">
                Branch: {toTitleCase(selectedBranch) || "All branches"} · Generated{" "}
                {new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 print:hidden">
            <div className="flex flex-wrap items-center gap-1 rounded-full border border-border bg-background p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  className={[
                    "rounded-full px-3.5 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    period === p.key
                      ? "bg-primary text-white"
                      : "text-muted hover:bg-primaryLight hover:text-secondary",
                  ].join(" ")}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div ref={exportRef} className="relative">
                <button
                  type="button"
                  disabled={loading}
                  aria-haspopup="menu"
                  aria-expanded={exportOpen}
                  onClick={() => setExportOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm text-secondary transition-colors hover:bg-primaryLight focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" strokeWidth={2} />
                  Export CSV
                  <ChevronDown className={["h-4 w-4 transition-transform", exportOpen ? "rotate-180" : ""].join(" ")} />
                </button>

                {exportOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-30 mt-2 w-60 rounded-xl border border-border bg-background p-1.5 shadow-xl"
                  >
                    {[
                      { key: "transactions", label: "Transactions", count: model.txList.length },
                      { key: "expenses", label: "Expenses", count: model.exList.length },
                      { key: "summary", label: `Summary by ${model.unit}`, count: summaryRows.length },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        role="menuitem"
                        disabled={item.count === 0}
                        onClick={() => exportCSV(item.key)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-secondary transition-colors hover:bg-primaryLight disabled:pointer-events-none disabled:opacity-40"
                      >
                        <span className="font-medium">{item.label}</span>
                        <span className="text-xs text-muted">{item.count} rows</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
              >
                <Printer className="h-4 w-4" strokeWidth={2} />
                Print
              </button>
            </div>
            </div>
          </div>

          {period === "custom" && (
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 print:hidden">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primaryLight text-primary">
                <CalendarRange className="h-4 w-4" strokeWidth={2} />
              </span>
              <label className="flex items-center gap-2 text-sm text-muted">
                From
                <input
                  type="date"
                  value={customFrom}
                  max={todayStr}
                  onChange={(e) => changeFrom(e.target.value)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-sm text-text transition-colors focus:border-primary focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-muted">
                To
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={todayStr}
                  onChange={(e) => changeTo(e.target.value)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-sm text-text transition-colors focus:border-primary focus:outline-none"
                />
              </label>
              <div className="flex flex-wrap items-center gap-1 sm:ml-auto">
                {[
                  { key: "month", label: "This month" },
                  { key: "lastMonth", label: "Last month" },
                  { key: "year", label: "This year" },
                ].map((q) => (
                  <button
                    key={q.key}
                    type="button"
                    onClick={() => applyQuickRange(q.key)}
                    className="rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:bg-primaryLight hover:text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}
          {expenseWarning && (
            <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
              {expenseWarning}
            </div>
          )}

          {loading ? (
            <PageSkeleton />
          ) : (
            <div className="space-y-6">
              {/* KPIs */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
                <KpiCard
                  icon={Wallet}
                  tone="green"
                  label="Total revenue"
                  value={fmtINR(model.revenue)}
                  delta={model.hasCompare ? model.deltaRevenue : undefined}
                  footnote={model.hasCompare ? "vs previous period" : `${model.count} receipts`}
                />
                <KpiCard
                  icon={TrendingDown}
                  tone="red"
                  label="Total expenses"
                  value={fmtINR(model.spend)}
                  delta={model.hasCompare ? model.deltaSpend : undefined}
                  inverse
                  footnote={model.hasCompare ? "vs previous period" : undefined}
                />
                <KpiCard
                  icon={TrendingUp}
                  tone="indigo"
                  label="Net profit"
                  value={fmtINR(model.net)}
                  delta={model.hasCompare ? model.deltaNet : undefined}
                  footnote={`${model.margin.toFixed(1)}% margin`}
                />
                <KpiCard
                  icon={Receipt}
                  tone="amber"
                  label="Avg. transaction"
                  value={fmtINR(model.avg)}
                  footnote={`${model.count} transaction${model.count === 1 ? "" : "s"}`}
                />
              </div>

              {/* Earnings vs Expenses side by side */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 print:grid-cols-2">
                <Card title="Earnings" subtitle={`Fees collected per ${model.unit}`}>
                  <div className="h-72">
                    {hasAnyData ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={model.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="earnFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={COLORS.revenue} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={COLORS.revenue} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid vertical={false} stroke={COLORS.grid} strokeDasharray="3 3" />
                          <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={24} {...axisProps} />
                          <YAxis width={48} tickFormatter={fmtCompact} {...axisProps} />
                          <Tooltip content={<ChartTooltip />} cursor={{ stroke: COLORS.grid }} />
                          <Area
                            type="monotone"
                            dataKey="revenue"
                            name="Revenue"
                            stroke={COLORS.revenue}
                            strokeWidth={2.5}
                            fill="url(#earnFill)"
                            activeDot={{ r: 4 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart message="No earnings in this period." />
                    )}
                  </div>
                </Card>

                <Card title="Expenses" subtitle={`Money spent per ${model.unit}`}>
                  <div className="h-72">
                    {hasAnyData ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={model.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke={COLORS.grid} strokeDasharray="3 3" />
                          <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={24} {...axisProps} />
                          <YAxis width={48} tickFormatter={fmtCompact} {...axisProps} />
                          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(244,63,94,0.06)" }} />
                          <Bar
                            dataKey="expenses"
                            name="Expenses"
                            fill={COLORS.expense}
                            radius={[6, 6, 0, 0]}
                            maxBarSize={36}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart message="No expenses in this period." />
                    )}
                  </div>
                </Card>
              </div>

              {/* Overview + expense breakdown */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 print:grid-cols-3">
                <Card
                  title="Income vs expenses"
                  subtitle="Net profit shown as the line"
                  className="lg:col-span-2 print:col-span-2"
                >
                  <div className="h-72">
                    {hasAnyData ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={model.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke={COLORS.grid} strokeDasharray="3 3" />
                          <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={24} {...axisProps} />
                          <YAxis width={48} tickFormatter={fmtCompact} {...axisProps} />
                          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(99,102,241,0.05)" }} />
                          <Legend
                            iconType="circle"
                            iconSize={8}
                            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                          />
                          <Bar
                            dataKey="revenue"
                            name="Revenue"
                            fill={COLORS.revenue}
                            radius={[4, 4, 0, 0]}
                            maxBarSize={22}
                          />
                          <Bar
                            dataKey="expenses"
                            name="Expenses"
                            fill={COLORS.expense}
                            radius={[4, 4, 0, 0]}
                            maxBarSize={22}
                          />
                          <Line
                            type="monotone"
                            dataKey="net"
                            name="Net"
                            stroke={COLORS.net}
                            strokeWidth={2.5}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart message="Nothing to compare yet." />
                    )}
                  </div>
                </Card>

                <Card title="Where the money goes" subtitle="Expenses by category">
                  {model.categories.length ? (
                    <>
                      <div className="relative h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={model.categories}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={52}
                              outerRadius={78}
                              paddingAngle={2}
                              stroke="none"
                            >
                              {model.categories.map((_, i) => (
                                <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip content={<ChartTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xs text-muted">Total</span>
                          <span className="font-display text-base text-secondary">{fmtCompact(model.spend)}</span>
                        </div>
                      </div>
                      <ul className="mt-3 space-y-1.5">
                        {model.categories.map((c, i) => (
                          <li key={c.name} className="flex items-center justify-between text-sm">
                            <span className="flex min-w-0 items-center gap-2 text-text">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                              />
                              <span className="truncate">{c.name}</span>
                            </span>
                            <span className="text-muted">{fmtINR(c.value)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <div className="h-64">
                      <EmptyChart message="No expenses to break down." />
                    </div>
                  )}
                </Card>
              </div>

              {/* Top payees + recent transactions */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 print:grid-cols-2">
                <Card title="Top payees" subtitle="Who contributed the most revenue">
                  {model.payees.length ? (
                    <ul className="space-y-4">
                      {model.payees.map((p) => {
                        const pct = model.revenue ? (p.value / model.revenue) * 100 : 0;
                        return (
                          <li key={p.name}>
                            <div className="mb-1.5 flex items-center justify-between text-sm">
                              <span className="truncate text-text">{p.name}</span>
                              <span className="text-muted">
                                {fmtINR(p.value)} · {pct.toFixed(0)}%
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-backgroundAlt">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.max(pct, 2)}%`, background: COLORS.revenue }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="h-40">
                      <EmptyChart message="No payments in this period." />
                    </div>
                  )}
                </Card>

                <Card title="Latest transactions" subtitle="Most recent receipts in this period">
                  {model.recent.length ? (
                    <ul className="divide-y divide-border">
                      {model.recent.map((t, i) => (
                        <li key={t.transaction_id ?? t.receipt_no ?? i} className="flex items-center justify-between py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-secondary">
                              {t.student_name ? toTitleCase(t.student_name) : t.payee ? toTitleCase(t.payee) : "—"}
                            </p>
                            <p className="text-xs text-muted">
                              {t.receipt_no} ·{" "}
                              {t._date.toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </p>
                          </div>
                          <span className="text-sm font-medium text-emerald-600">+{fmtINR(t._amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="h-40">
                      <EmptyChart message="No transactions recorded yet." />
                    </div>
                  )}
                </Card>
              </div>

              {/* Full lists for the selected period */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ListCard
                  key={`tx-${listKey}`}
                  title="Transactions"
                  subtitle={`${txRows.length} receipt${txRows.length === 1 ? "" : "s"} in this period`}
                  total={fmtINR(model.revenue)}
                  totalClass="text-emerald-600"
                  rows={txRows}
                  emptyMessage="No transactions in this period."
                  expanded={printing}
                  itemLabel="transaction"
                  onDelete={(ids) => deleteMany("manage_transaction", "transaction_id", ids)}
                />
                <ListCard
                  key={`ex-${listKey}-${activeCategory}`}
                  title="Expenses"
                  subtitle={
                    activeCategory === "all"
                      ? `${exRows.length} expense${exRows.length === 1 ? "" : "s"} in this period`
                      : `${visibleExRows.length} in ${activeCategory} · ${exRows.length} total`
                  }
                  total={fmtINR(visibleExTotal)}
                  totalClass="text-red-500"
                  rows={visibleExRows}
                  emptyMessage="No expenses in this period."
                  expanded={printing}
                  itemLabel="expense"
                  onDelete={(ids) => deleteMany(EXPENSE_MANAGE_RPC, EXPENSE_ID_PARAM, ids)}
                  filters={expenseFilters}
                  activeFilter={activeCategory}
                  onFilterChange={setExpenseCategory}
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}