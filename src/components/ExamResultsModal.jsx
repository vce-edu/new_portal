import { useEffect, useMemo, useState } from "react";
import { X, Search } from "lucide-react";
import { supabase } from "../createClient";
import { toTitleCase } from "../utils/formatting";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";

const percent = (score, outOf) => (outOf > 0 ? Math.round((score / outOf) * 100) : null);

/**
 * Props:
 *  branch  – the branch currently selected in the branch filter (or null for all)
 *  onClose – close handler
 */
export default function ExamResultsModal({ branch = null, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [examFilter, setExamFilter] = useState(""); // "" = all exams
  const [search, setSearch] = useState("");

  useCloseOnEscape(onClose);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      const { data, error } = await supabase.rpc("get_exam_results", { p_branch: branch });
      if (cancelled) return;
      if (error) {
        setError(error.message || "Couldn't load results. Please try again.");
        setRows([]);
      } else {
        setRows(data || []);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [branch]);

  // Group rows by exam, keeping the order the database returned them in
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.exam_id)) map.set(r.exam_id, { exam_id: r.exam_id, branch: r.branch, rows: [] });
      map.get(r.exam_id).rows.push(r);
    }
    return [...map.values()];
  }, [rows]);

  const query = search.trim().toLowerCase();

  // Each visible group keeps all its rows (so exam stats stay accurate)
  // and a `matched` list of the rows that pass the search
  const visibleGroups = useMemo(() => {
    const base = examFilter ? groups.filter((g) => g.exam_id === examFilter) : groups;
    if (!query) return base.map((g) => ({ ...g, matched: g.rows }));

    return base
      .map((g) => ({
        ...g,
        matched: g.rows.filter(
          (r) =>
            String(r.roll_number ?? "").toLowerCase().includes(query) ||
            String(r.student_name ?? "").toLowerCase().includes(query) ||
            String(r.father_name ?? "").toLowerCase().includes(query)
        ),
      }))
      .filter((g) => g.matched.length > 0);
  }, [groups, examFilter, query]);

  const visibleStudents = visibleGroups.reduce((sum, g) => sum + g.matched.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-4xl rounded-xl border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-border px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-xl text-secondary">Exam results</h2>
            <p className="mt-0.5 text-sm text-muted">
              {loading
                ? "Loading results..."
                : `${visibleStudents} result${visibleStudents === 1 ? "" : "s"} across ${visibleGroups.length} exam${
                    visibleGroups.length === 1 ? "" : "s"
                  }`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search roll no, name, father's name"
                aria-label="Search results by roll number, student name or father's name"
                disabled={loading || rows.length === 0}
                className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-9 text-sm text-text placeholder:text-muted/60 transition-colors focus:border-primary focus:outline-none disabled:opacity-50"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-backgroundAlt hover:text-text"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <label htmlFor="result-exam-filter" className="sr-only">
              Filter by exam
            </label>
            <select
              id="result-exam-filter"
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
              disabled={loading || groups.length === 0}
              className="w-44 rounded-full border border-border bg-background px-4 py-2 text-sm text-text focus:border-primary focus:outline-none disabled:opacity-50"
            >
              <option value="">All exams</option>
              {groups.map((g) => (
                <option key={g.exam_id} value={g.exam_id}>
                  {g.exam_id}
                </option>
              ))}
            </select>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1.5 text-muted transition-colors hover:bg-backgroundAlt hover:text-text"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-6 px-6 py-5">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-border/40" />
              ))}
            </div>
          ) : visibleGroups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
              {query ? `No students match "${search.trim()}".` : "No results have been recorded yet."}
            </div>
          ) : (
            visibleGroups.map((g) => <ExamGroup key={g.exam_id} group={g} filtered={Boolean(query)} />)
          )}
        </div>
      </div>
    </div>
  );
}

function ExamGroup({ group, filtered }) {
  // stats always describe the whole exam, even while a search is narrowing the table
  const percents = group.rows.map((r) => percent(r.score, r.out_of)).filter((p) => p != null);
  const average = percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : null;
  const highest = group.rows.reduce((max, r) => Math.max(max, r.score), 0);

  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-backgroundAlt px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h3 className="font-display text-base text-secondary">{group.exam_id}</h3>
          <span className="text-sm text-muted">{toTitleCase(group.branch)}</span>
        </div>
        <p className="text-sm text-muted">
          {filtered
            ? `${group.matched.length} of ${group.rows.length} student${group.rows.length === 1 ? "" : "s"}`
            : `${group.rows.length} student${group.rows.length === 1 ? "" : "s"}`}
          {average != null && ` · average ${average}%`}
          {` · highest ${highest}`}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-4 py-2 font-medium">Roll number</th>
              <th className="px-4 py-2 font-medium">Student</th>
              <th className="px-4 py-2 font-medium">Father's name</th>
              <th className="px-4 py-2 text-right font-medium">Score</th>
              <th className="px-4 py-2 text-right font-medium">Percentage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {group.matched.map((r) => {
              const p = percent(r.score, r.out_of);
              return (
                <tr key={r.roll_number} className="text-text">
                  <td className="px-4 py-2.5">{r.roll_number}</td>
                  <td className="px-4 py-2.5">{toTitleCase(r.student_name) || "—"}</td>
                  <td className="px-4 py-2.5">{toTitleCase(r.father_name) || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {r.score} <span className="font-normal text-muted">/ {r.out_of}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted">{p != null ? `${p}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}