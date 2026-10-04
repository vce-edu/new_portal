import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { TextField, Select } from "./Input.jsx";
import Button from "./Button.jsx";
import { supabase } from "../createClient";
import { useAuth } from "../context/AuthContext";
import { useBranchFilter } from "../context/BranchFilterContext";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";
import { toTitleCase } from "../utils/formatting";

// datetime-local gives "YYYY-MM-DDTHH:mm" with no timezone. new Date() reads it in the
// user's own timezone, and toISOString() turns it into a real UTC timestamp for the database.
function toUtcIso(localValue) {
  if (!localValue) return null;
  const d = new Date(localValue);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export default function AddExamModal({ onClose, onSaved }) {
  useCloseOnEscape(onClose);

  const { branch: ownBranch } = useAuth();
  const { selectedBranch } = useBranchFilter();
  const canChooseBranch = !ownBranch;

  const [examId, setExamId] = useState("");
  const [durationMins, setDurationMins] = useState("");
  const [totalScore, setTotalScore] = useState("");
  const [totalQuestions, setTotalQuestions] = useState("20");
  const [restricted, setRestricted] = useState(false);
  const [operationalTime, setOperationalTime] = useState("");
  const [branch, setBranch] = useState(selectedBranch || "");
  const [branchOptions, setBranchOptions] = useState([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (canChooseBranch) {
      supabase.rpc("get_branches").then(({ data, error }) => {
        if (!error && data) setBranchOptions(data);
      });
    }
  }, [canChooseBranch]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!examId.trim()) {
      setError("Exam ID is required.");
      return;
    }
    if (canChooseBranch && !branch) {
      setError("Please select a branch.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.rpc("manage_exam", {
      action: "insert",
      payload: {
        exam_id: examId.trim(),
        duration_mins: durationMins,
        total_score: totalScore,
        total_questions: totalQuestions,
        restricted,
        operational_time: toUtcIso(operationalTime),
        branch,
      },
    });

    setSaving(false);

    if (error) {
      setError(error.message || "Couldn't create this exam.");
      return;
    }

    onSaved();
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/40 backdrop-blur-sm p-6">
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="font-display text-lg text-secondary">Create Exam</h2>
            <p className="text-sm text-muted">Set up the exam shell — questions can be added after.</p>
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
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          <TextField
            label="Exam ID"
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
            placeholder="e.g. midterm-2026-web"
          />

          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Duration (mins)"
              type="number"
              value={durationMins}
              onChange={(e) => setDurationMins(e.target.value)}
            />
            <TextField
              label="Total Score"
              type="number"
              value={totalScore}
              onChange={(e) => setTotalScore(e.target.value)}
            />
          </div>

          <TextField
            label="Total Questions"
            type="number"
            value={totalQuestions}
            onChange={(e) => setTotalQuestions(e.target.value)}
          />

          <TextField
            label="Opens At (optional)"
            type="datetime-local"
            value={operationalTime}
            onChange={(e) => setOperationalTime(e.target.value)}
          />

          <label className="flex items-center gap-2.5 text-sm text-text cursor-pointer">
            <input
              type="checkbox"
              checked={restricted}
              onChange={(e) => setRestricted(e.target.checked)}
              className="h-4 w-4 text-primary focus:ring-primary/40"
            />
            Restricted (students need explicit access)
          </label>

          {canChooseBranch ? (
            <Select label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="" disabled>
                Select a branch
              </option>
              {branchOptions.map((opt) => (
                <option key={opt.branch} value={opt.branch}>
                  {toTitleCase(opt.branch)}
                </option>
              ))}
            </Select>
          ) : (
            <TextField label="Branch" value={toTitleCase(ownBranch)} disabled />
          )}

          <Button type="submit" className="w-full" loading={saving} disabled={saving}>
            Create exam
          </Button>
        </form>
      </div>
    </div>,
    document.body
  );
}