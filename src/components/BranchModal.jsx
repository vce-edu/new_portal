import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { TextField } from "./Input.jsx";
import Button from "./Button.jsx";
import { supabase } from "../createClient";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";
import { toTitleCase } from "../utils/formatting";

/**
 * Props
 *  - branch:  (optional) the branch row ({ branch_name, branch_address }) to edit.
 *             Without it the modal creates a new branch.
 *  - onClose: close without saving
 *  - onSaved: saved successfully; the parent should refresh and close
 */
export default function BranchModal({ branch, onClose, onSaved }) {
  const editing = !!branch;
  const [name, setName] = useState(branch?.branch_name || "");
  const [address, setAddress] = useState(branch?.branch_address || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useCloseOnEscape(saving ? () => {} : onClose);

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setError("");

    if (!name.trim()) {
      setError("Branch name is required.");
      return;
    }
    if (editing && !address.trim()) {
      setError("Address is required.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("manage_branch", {
      action: editing ? "update_address" : "create",
      p_branch: name.trim(),
      p_address: address.trim() || null,
    });
    setSaving(false);

    if (error) {
      setError(error.message || "Couldn't save this branch.");
      return;
    }
    onSaved();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/40 backdrop-blur-sm p-6">
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <div>
            <h2 className="font-display text-lg text-secondary">{editing ? "Edit Address" : "Add Branch"}</h2>
            <p className="text-sm text-muted">
              {editing ? `Update the address for ${toTitleCase(branch.branch_name)}.` : "Create a new branch."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-primaryLight hover:text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-6">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</div>
          )}

          <div className="space-y-4">
            <TextField
              label="Branch Name"
              value={editing ? toTitleCase(name) : name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lucknow"
              disabled={editing}
            />
            <TextField
              label="Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, area, city"
            />
          </div>

          <Button type="submit" className="w-full" loading={saving} disabled={saving}>
            {editing ? "Save address" : "Add branch"}
          </Button>
        </form>
      </div>
    </div>,
    document.body
  );
}