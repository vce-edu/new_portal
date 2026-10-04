import { FileText, Award } from "lucide-react";
import { hasValidScore } from "../utils/generateResultCard";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";


export default function PrintChoiceModal({ row, busy, onChoose, onClose }) {
  const canPrintResult = hasValidScore(row);
    useCloseOnEscape(onClose);

  const optionCls = (disabled) =>
    `flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
      disabled
        ? "cursor-not-allowed border-border bg-border/20 opacity-50"
        : "border-border bg-background hover:border-primary hover:bg-primaryLight"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg text-secondary">What would you like to print?</h2>
        <p className="mt-1 text-sm text-muted">{row.student_name}</p>

        <div className="mt-5 space-y-3">
          <button type="button" disabled={busy} onClick={() => onChoose("admit")} className={optionCls(busy)}>
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium text-text">Admit Card</div>
              <div className="text-xs text-muted">Exam date, time and centre</div>
            </div>
          </button>

          <button
            type="button"
            disabled={busy || !canPrintResult}
            onClick={() => onChoose("result")}
            className={optionCls(busy || !canPrintResult)}
          >
            <Award className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium text-text">Result</div>
              <div className="text-xs text-muted">
                {canPrintResult ? "Score and scholarship awarded" : "Not available - no score entered yet"}
              </div>
            </div>
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs text-muted">{busy ? "Generating PDF..." : ""}</span>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="text-sm text-muted hover:text-primary disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}