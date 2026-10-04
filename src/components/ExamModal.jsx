import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { TextField, Select } from "./Input.jsx";
import Button from "./Button.jsx";
import { supabase } from "../createClient";
import { useAuth } from "../context/AuthContext";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";
import { toTitleCase } from "../utils/formatting";

// datetime-local inputs need "YYYY-MM-DDTHH:mm" — convert both directions
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// datetime-local gives "YYYY-MM-DDTHH:mm" with no timezone. new Date() reads it in the
// user's own timezone, and toISOString() turns it into a real UTC timestamp for the database.
function toUtcIso(localValue) {
  if (!localValue) return null;
  const d = new Date(localValue);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export default function ExamModal({ mode, exam, onClose, onSaved }) {
  const isView = mode === "view";
  useCloseOnEscape(onClose);

  const { branch: ownBranch } = useAuth();
  const canChooseBranch = !ownBranch;

  const [durationMins, setDurationMins] = useState(exam.duration_mins ?? "");
  const [totalScore, setTotalScore] = useState(exam.total_score ?? "");
  const [totalQuestions, setTotalQuestions] = useState(exam.total_questions ?? "");
  const [restricted, setRestricted] = useState(Boolean(exam.restricted));
  const [operationalTime, setOperationalTime] = useState(toLocalInput(exam.operational_time));
  const [branch, setBranch] = useState(exam.branch || "");
  const [branchOptions, setBranchOptions] = useState([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isView && canChooseBranch) {
      supabase.rpc("get_branches").then(({ data, error }) => {
        if (!error && data) setBranchOptions(data);
      });
    }
  }, [isView, canChooseBranch]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const { error } = await supabase.rpc("manage_exam", {
      action: "update",
      exam_id: exam.exam_id,
      payload: {
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
      setError(error.message || "Couldn't save changes.");
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
            <h2 className="font-display text-lg text-secondary">
              {isView ? "Exam Details" : "Edit Exam"}
            </h2>
            <p className="text-sm text-muted">{exam.exam_id}</p>
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

        {isView ? (
          <div className="space-y-4 px-6 py-6">
            {[
              { label: "Exam ID", value: exam.exam_id },
              { label: "Branch", value: toTitleCase(exam.branch) },
              { label: "Duration (mins)", value: exam.duration_mins },
              { label: "Total Score", value: exam.total_score },
              { label: "Total Questions", value: exam.total_questions },
              { label: "Restricted", value: exam.restricted ? "Yes" : "No" },
              {
                label: "Opens At",
                value: exam.operational_time
                  ? new Date(exam.operational_time).toLocaleString("en-IN")
                  : "—",
              },
              { label: "Created By", value: exam.created_by_name || "—" },
              {
                label: "Created At",
                value: exam.created_at ? new Date(exam.created_at).toLocaleDateString("en-IN") : "—",
              },
            ].map((f) => (
              <div key={f.label}>
                <p className="text-sm text-muted">{f.label}</p>
                <p className="text-text">{f.value || "—"}</p>
              </div>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5 px-6 py-6">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}

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
              label="Opens At"
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
              <TextField label="Branch" value={toTitleCase(exam.branch)} disabled />
            )}

            <div className="rounded-lg bg-backgroundAlt p-4 flex justify-between text-sm">
              <span className="text-muted">Exam ID</span>
              <span className="text-text">{exam.exam_id}</span>
            </div>

            <Button type="submit" className="w-full" loading={saving} disabled={saving}>
              Save changes
            </Button>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}