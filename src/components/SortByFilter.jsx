import { useEffect, useRef, useState } from "react";
import { ArrowDownWideNarrow, ChevronDown, X } from "lucide-react";
import { formatBatchTime, combineBatchTime } from "../utils/formatting";

const TYPES = [
  { key: "fees_status", label: "Fees Status" },
  { key: "admission_date", label: "Admission Date" },
  { key: "course", label: "Course" },
  { key: "batch_time", label: "Batch Time" },
];

const FEE_OPTIONS = ["Up-to-Date", "Course-Overdue", "Pending"];

function summarize(filter) {
  if (!filter) return null;
  if (filter.type === "fees_status") return `Fees: ${filter.value}`;
  if (filter.type === "course") return `Course: ${filter.value}`;
  if (filter.type === "admission_date") {
    return filter.mode === "exact"
      ? `Admitted: ${filter.date}`
      : `Admitted: ${filter.from} – ${filter.to}`;
  }
  if (filter.type === "batch_time") {
    return `Batch: ${filter.from} – ${filter.to}`;
  }
  return null;
}

export default function SortByFilter({ value, onChange, canSeeFees }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(value?.type || null);
  const [draft, setDraft] = useState(value || {});
  const containerRef = useRef(null);

  const types = canSeeFees ? TYPES : TYPES.filter((t) => t.key !== "fees_status");

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function openPanel() {
    setType(value?.type || null);
    setDraft(value || {});
    setOpen(true);
  }

  function selectType(key) {
    setType(key);
    setDraft({ type: key, mode: key === "admission_date" || key === "batch_time" ? "exact" : undefined });
  }

  function apply() {
    onChange(draft.type ? draft : null);
    setOpen(false);
  }

  function clearAll() {
    onChange(null);
    setType(null);
    setDraft({});
    setOpen(false);
  }

  const canApply =
    (type === "fees_status" && draft.value) ||
    (type === "course" && draft.value?.trim()) ||
    (type === "admission_date" &&
      (draft.mode === "exact" ? draft.date : draft.from && draft.to)) ||
    (type === "batch_time" && draft.from?.trim() && draft.to?.trim());

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openPanel}
          className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm text-secondary transition-colors hover:bg-primaryLight"
        >
          <ArrowDownWideNarrow className="h-4 w-4" strokeWidth={2} />
          Sort By
          <ChevronDown className="h-3.5 w-3.5 text-muted" strokeWidth={2} />
        </button>

        {value && (
          <span className="flex items-center gap-1.5 rounded-full bg-primaryLight px-3 py-1.5 text-xs font-medium text-primary">
            {summarize(value)}
            <button type="button" onClick={clearAll} aria-label="Clear filter">
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-border bg-background p-4 shadow-xl">
          {/* step 1: choose which field */}
          <div className="mb-4 flex flex-wrap gap-2">
            {types.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => selectType(t.key)}
                className={[
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  type === t.key
                    ? "bg-primary text-white"
                    : "bg-backgroundAlt text-muted hover:bg-primaryLight hover:text-primary",
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* step 2: field-specific sub-form */}
          {type === "fees_status" && (
            <div className="space-y-2">
              {FEE_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-2.5 text-sm text-text cursor-pointer">
                  <input
                    type="radio"
                    name="fees_status"
                    checked={draft.value === opt}
                    onChange={() => setDraft({ type: "fees_status", value: opt })}
                    className="h-4 w-4 text-primary focus:ring-primary/40"
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}

          {type === "course" && (
            <input
              type="text"
              value={draft.value || ""}
              onChange={(e) => setDraft({ type: "course", value: e.target.value })}
              placeholder="e.g. Python Programming"
              className="w-full border-0 border-b-2 border-border bg-transparent pb-2 text-sm text-text placeholder:text-muted/60 focus:outline-none focus:border-primary"
            />
          )}

          {type === "admission_date" && (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={draft.mode === "exact"}
                    onChange={() => setDraft({ type: "admission_date", mode: "exact" })}
                    className="h-4 w-4 text-primary"
                  />
                  Exact Date
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={draft.mode === "range"}
                    onChange={() => setDraft({ type: "admission_date", mode: "range" })}
                    className="h-4 w-4 text-primary"
                  />
                  Range
                </label>
              </div>

              {draft.mode === "exact" && (
                <input
                  type="date"
                  value={draft.date || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                  className="w-full border-0 border-b-2 border-border bg-transparent pb-2 text-sm text-text focus:outline-none focus:border-primary"
                />
              )}

              {draft.mode === "range" && (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={draft.from || ""}
                    onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                    className="w-full border-0 border-b-2 border-border bg-transparent pb-2 text-sm text-text focus:outline-none focus:border-primary"
                  />
                  <input
                    type="date"
                    value={draft.to || ""}
                    onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                    className="w-full border-0 border-b-2 border-border bg-transparent pb-2 text-sm text-text focus:outline-none focus:border-primary"
                  />
                </div>
              )}
            </div>
          )}

          {type === "batch_time" && (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={draft.mode === "exact"}
                    onChange={() => setDraft((d) => ({ ...d, type: "batch_time", mode: "exact" }))}
                    className="h-4 w-4 text-primary"
                  />
                  Exact
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={draft.mode === "range"}
                    onChange={() => setDraft((d) => ({ ...d, type: "batch_time", mode: "range" }))}
                    className="h-4 w-4 text-primary"
                  />
                  Range
                </label>
              </div>

              <p className="text-xs text-muted">
                {draft.mode === "exact"
                  ? "Matches students in exactly this batch slot."
                  : "Matches students whose batch starts within this window."}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm text-muted">From</label>
                  <input
                    type="text"
                    value={draft.from || ""}
                    onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                    onBlur={(e) => setDraft((d) => ({ ...d, from: formatBatchTime(e.target.value) }))}
                    placeholder="e.g. 9 or 5"
                    className="w-full border-0 border-b-2 border-border bg-transparent pb-2 text-sm text-text placeholder:text-muted/60 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-muted">To</label>
                  <input
                    type="text"
                    value={draft.to || ""}
                    onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                    onBlur={(e) => setDraft((d) => ({ ...d, to: formatBatchTime(e.target.value) }))}
                    placeholder="e.g. 11 or 7"
                    className="w-full border-0 border-b-2 border-border bg-transparent pb-2 text-sm text-text placeholder:text-muted/60 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          )}

          {type && (
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-3.5 py-1.5 text-sm text-muted transition-colors hover:bg-backgroundAlt"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={!canApply}
                className="rounded-full bg-primary px-4 py-1.5 text-sm text-white transition-colors hover:bg-primaryDark disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}