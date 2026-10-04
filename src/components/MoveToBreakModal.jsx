import { useState } from "react";
import { createPortal } from "react-dom";
import { X, PauseCircle } from "lucide-react";
import { TextField } from "./Input.jsx";
import Button from "./Button.jsx";
import { supabase } from "../createClient";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";

// today's date as YYYY-MM-DD in the user's local timezone
// (toISOString() would use UTC and can show yesterday early in the morning in India)
function todayLocal() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export default function MoveToBreakModal({ student, onClose, onSaved }) {
  useCloseOnEscape(onClose);

  const [status, setStatus] = useState("break"); // 'break' | 'discontinued'
  const [breakDate, setBreakDate] = useState(todayLocal());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();

    if (!breakDate) {
      setError("Please select a date.");
      return;
    }

    setSaving(true);
    setError("");

    const { error } = await supabase.rpc("manage_break_student", {
      action: "move",
      student_id: student.id,
      payload: { status, reason, break_date: breakDate },
    });

    setSaving(false);

    if (error) {
      setError(error.message || "Couldn't move this student.");
      return;
    }

    onSaved();
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/40 backdrop-blur-sm p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent">
              <PauseCircle className="h-4 w-4" />
            </span>
            <h2 className="font-display text-lg text-secondary">Move to Break</h2>
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
          <p className="text-sm text-muted">
            <span className="font-medium text-text">{student.student_name}</span> ({student.roll_number}) will be
            moved out of the active students list. Their record and payment history are kept — this can be undone
            later from the Break Students view.
          </p>

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
            <label htmlFor="break-date" className="mb-1.5 block text-sm font-medium text-text">
              {status === "discontinued" ? "Discontinued on" : "Break start date"}
            </label>
            <input
              id="break-date"
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

          <Button type="submit" className="w-full" loading={saving} disabled={saving}>
            Move Student
          </Button>
        </form>
      </div>
    </div>,
    document.body
  );
}