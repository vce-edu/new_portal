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

function getTodayDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AddExpenseModal({ onClose, onSaved }) {
  useCloseOnEscape(onClose);

  const { branch: ownBranch } = useAuth();
  const { selectedBranch } = useBranchFilter();
  const canChooseBranch = !ownBranch; // only owners (no fixed branch) can pick

  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidTo, setPaidTo] = useState("");
  const [expenseDate, setExpenseDate] = useState(getTodayDate);
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

  function handleKeyDown(e) {
    if (e.key === "Enter" && e.target.tagName === "INPUT") {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!category.trim() || !amount) {
      setError("Category and amount are required.");
      return;
    }
    if (canChooseBranch && !branch) {
      setError("Please select a branch.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.rpc("manage_expense", {
      action: "insert",
      payload: {
        category,
        description,
        amount,
        paid_to: paidTo,
        expense_date: expenseDate,
        branch,
      },
    });

    setSaving(false);

    if (error) {
      setError(error.message || "Couldn't save this expense.");
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
            <h2 className="font-display text-lg text-secondary">Add Expense</h2>
            <p className="text-sm text-muted">Record a branch expense.</p>
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

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-5 px-6 py-6">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          <TextField
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Rent, Utilities, Salary"
          />

          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional details"
          />

          <TextField
            label="Amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

          <TextField
            label="Paid To"
            value={paidTo}
            onChange={(e) => setPaidTo(e.target.value)}
            placeholder="Vendor or person"
          />

          <TextField
            label="Expense Date"
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
          />

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
            Add expense
          </Button>
        </form>
      </div>
    </div>,
    document.body
  );
}