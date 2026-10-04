import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { TextField } from "./Input.jsx";
import Button from "./Button.jsx";
import { supabase } from "../createClient";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";
import { toTitleCase } from "../utils/formatting";

// editable fields
const EDITABLE = [
  { key: "receipt_no", label: "Receipt No" },
  { key: "payee", label: "Payee" },
  { key: "amount_paid", label: "Amount Paid", type: "number" },
  { key: "paid_on", label: "Paid On", type: "date" },
];

// read-only context shown in both view and edit mode
const CONTEXT = [
  { key: "student_name", label: "Student Name" },
  { key: "roll_number", label: "Roll Number" },
  { key: "father_name", label: "Father's Name" },
  { key: "branch", label: "Branch" },
];

export default function TransactionModal({ mode, transaction, onClose, onSaved }) {
  const isView = mode === "view";
  useCloseOnEscape(onClose);

  const [form, setForm] = useState(() =>
    Object.fromEntries(EDITABLE.map((f) => [f.key, transaction?.[f.key] ?? ""]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleChange(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const { error } = await supabase.rpc("manage_transaction", {
      action: "update",
      transaction_id: transaction.transaction_id,
      payload: form,
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
          <h2 className="font-display text-lg text-secondary">
            {isView ? "Transaction Details" : "Edit Transaction"}
          </h2>
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
            {[...EDITABLE, ...CONTEXT].map((f) => (
              <div key={f.key}>
                <p className="text-sm text-muted">{f.label}</p>
                <p className="text-text">
                  {f.key === "amount_paid" && transaction?.[f.key] != null
                    ? `₹${Number(transaction[f.key]).toLocaleString("en-IN")}`
                    : f.key === "branch"
                    ? toTitleCase(transaction?.[f.key]) || "—"
                    : f.key === "paid_on" && transaction?.[f.key]
                    ? new Date(transaction[f.key]).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : transaction?.[f.key] || "—"}
                </p>
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

            {EDITABLE.map((f) => (
              <TextField
                key={f.key}
                label={f.label}
                type={f.type || "text"}
                value={form[f.key] ?? ""}
                onChange={(e) => handleChange(f.key, e.target.value)}
              />
            ))}

            <div className="rounded-lg bg-backgroundAlt p-4 space-y-3">
              <p className="text-xs font-medium text-muted">This can't be changed here</p>
              {CONTEXT.map((f) => (
                <div key={f.key} className="flex justify-between text-sm">
                  <span className="text-muted">{f.label}</span>
                  <span className="text-text">
                    {f.key === "branch" ? toTitleCase(transaction?.[f.key]) || "—" : transaction?.[f.key] || "—"}
                  </span>
                </div>
              ))}
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