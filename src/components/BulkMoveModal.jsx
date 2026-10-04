import { useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowRightLeft } from "lucide-react";
import { TextField } from "./Input.jsx";
import Button from "./Button.jsx";
import { supabase } from "../createClient";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";

function todayLocal() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export default function BulkMoveModal({ selectedRows, unselectedRows, onClose, onSaved }) {
  useCloseOnEscape(onClose);

  const [target, setTarget] = useState("selected"); // 'selected' | 'unselected'
  const [status, setStatus] = useState("break"); // 'break' | 'discontinued'
  const [breakDate, setBreakDate] = useState(todayLocal());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rows = target === "selected" ? selectedRows : unselectedRows;

  async function handleSubmit(e) {
    e.preventDefault();

    if (rows.length === 0) {
      setError("There are no students in this group to move.");
      return;
    }
    if (!breakDate) {
      setError("Please select a date.");
      return;
    }

    setSaving(true);
    setError("");

    const results = await Promise.allSettled(
      rows.map(async (row) => {
        const { error } = await supabase.rpc("manage_break_student", {
          action: "move",
          student_id: row.id,
          payload: { status, reason, break_date: breakDate },
        });
        if (error) throw new Error(`${row.student_name}: ${error.message}`);
      })
    );

    setSaving(false);

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      alert(
        `Moved ${rows.length - failed.length} of ${rows.length}. Couldn't move:\n` +
          failed.map((r) => r.reason.message).join("\n")
      );
    }

    onSaved(rows.length - failed.length);
    onClose();
  }

  const optionClass = (active, disabled) =>
    [
      "flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm transition-colors",
      disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      active ? "border-primary bg-primaryLight text-primary font-medium" : "border-border text-text",
    ].join(" ");

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/40 backdrop-blur-sm p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent">
              <ArrowRightLeft className="h-4 w-4" />
            </span>
            <h2 className="font-display text-lg text-secondary">Transfer Students</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-primaryLight hover:text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-text">Which students do you want to move?</p>

            <label className={optionClass(target === "selected", false)}>
              <input
                type="radio"
                checked={target === "selected"}
                onChange={() => setTarget("selected")}
                className="h-4 w-4 text-primary"
              />
              Selected students ({selectedRows.length})
            </label>

            <label className={optionClass(target === "unselected", unselectedRows.length === 0)}>
              <input
                type="radio"
                checked={target === "unselected"}
                disabled={unselectedRows.length === 0}
                onChange={() => setTarget("unselected")}
                className="h-4 w-4 text-primary"
              />
              Not selected students ({unselectedRows.length})
            </label>

            {target === "unselected" && (
              <p className="text-xs text-muted">
                Only the students on this page that you didn't tick will be moved.
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                checked={status === "break"}
                onChange={() => setStatus("break")}
                className="h-4 w-4 text-primary"
              />
              On Break
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                checked={status === "discontinued"}
                onChange={() => setStatus("discontinued")}
                className="h-4 w-4 text-primary"
              />
              Discontinued
            </label>
          </div>

          <div>
            <label htmlFor="bulk-break-date" className="mb-1.5 block text-sm font-medium text-text">
              {status === "discontinued" ? "Discontinued on" : "Break start date"}
            </label>
            <input
              id="bulk-break-date"
              type="date"
              value={breakDate}
              max={todayLocal()}
              onChange={(e) => setBreakDate(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-text focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <TextField
            label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Moved to another city"
          />

          <Button
            type="submit"
            className="w-full"
            loading={saving}
            disabled={saving || rows.length === 0}
          >
            Move {rows.length} Student{rows.length === 1 ? "" : "s"}
          </Button>
        </form>
      </div>
    </div>,
    document.body
  );
}