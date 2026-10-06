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

// Password template: @#_ + first 3 letters of the name + $ + first word of the role + $
// e.g. "Ravi Kumar" + student_management -> @#_Rav$student$
function makePassword(name, role) {
  const letters = (name || "").replace(/[^A-Za-z]/g, "").slice(0, 3);
  const short = (role || "").split("_")[0];
  return letters && short ? `@#_${letters}$${short}$` : "";
}

const prettyRole = (r) => toTitleCase((r || "").replace(/_/g, " "));

/**
 * Props
 *  - branch:   (optional) the branch row ({ branch_name, ... }) whose "Add staff" button was clicked.
 *              Without it (e.g. opened from the dock) the branch defaults to the selected/own branch.
 *  - branches: (optional) branch rows for the Assigned branch dropdown. Without it, the list
 *              is fetched with get_branches.
 *  - onClose:  close without any change
 *  - onSaved:  a staff member was created; the parent should refresh and close
 */
export default function AddStaffModal({ branch, branches, onClose, onSaved }) {
  const { roleLevel, branch: ownBranch } = useAuth();
  const { selectedBranch } = useBranchFilter();
  const canChooseBranch = roleLevel >= 3; // level 2 is locked to their own branch

  const [roles, setRoles] = useState([]);
  const [branchNames, setBranchNames] = useState(() => (branches || []).map((b) => b.branch_name));
  const [form, setForm] = useState({
    display_name: "",
    email: "",
    role: "",
    branch: branch?.branch_name || ownBranch || selectedBranch || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null); // { email, password } after a successful save
  const [copied, setCopied] = useState(false);

  const password = makePassword(form.display_name, form.role);

  // Once the account exists, closing in any way should still refresh the parent
  const handleClose = () => (created ? onSaved() : onClose());
  useCloseOnEscape(handleClose);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_assignable_roles");
      if (error) setError(error.message || "Couldn't load roles.");
      else setRoles(data || []);
    })();
  }, []);

  // Opened without a branch list (from the dock): fetch it
  useEffect(() => {
    if (branches?.length) return;
    supabase.rpc("get_branches").then(({ data }) => {
      if (data) setBranchNames(data.map((b) => b.branch));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setError("");

    if (!form.display_name.trim() || !form.email.trim() || !form.role || !form.branch) {
      setError("Name, email, role and branch are required.");
      return;
    }
    if (!password) {
      setError("The name needs at least one letter to generate a password.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("add_staff", {
      p_email: form.email.trim(),
      p_password: password,
      p_display_name: form.display_name.trim(),
      p_role: form.role,
      p_branch: form.branch,
    });
    setSaving(false);

    if (error) {
      setError(error.message || "Couldn't add this staff member.");
      return;
    }
    setCreated({ email: form.email.trim(), password });
  }

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(`Email: ${created.email}\nPassword: ${created.password}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/40 backdrop-blur-sm p-6">
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <div>
            <h2 className="font-display text-lg text-secondary">
              {created ? "Staff member added" : "Add Staff"}
            </h2>
            <p className="text-sm text-muted">
              {created
                ? "Share these login details with them."
                : `Add a new staff member to ${toTitleCase(form.branch)}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-primaryLight hover:text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {created ? (
          <div className="space-y-6 px-6 py-6">
            <div className="space-y-2 rounded-xl border border-border bg-backgroundAlt p-5 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted">Email</span>
                <span className="text-secondary">{created.email}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">Password</span>
                <span className="font-mono text-secondary">{created.password}</span>
              </div>
            </div>
            <p className="text-xs text-muted">The password won't be shown again once you close this window.</p>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" className="flex-1" onClick={copyDetails}>
                {copied ? "Copied" : "Copy details"}
              </Button>
              <Button type="button" className="flex-1" onClick={onSaved}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 px-6 py-6">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Full Name"
                value={form.display_name}
                onChange={set("display_name")}
                placeholder="e.g. Ravi Kumar"
              />
              <TextField
                label="Email"
                type="email"
                value={form.email}
                onChange={set("email")}
                placeholder="name@example.com"
              />

              {canChooseBranch ? (
                <Select label="Assigned Branch" value={form.branch} onChange={set("branch")}>
                  {branchNames.map((name) => (
                    <option key={name} value={name}>
                      {toTitleCase(name)}
                    </option>
                  ))}
                </Select>
              ) : (
                <TextField label="Assigned Branch" value={toTitleCase(form.branch)} disabled />
              )}

              <Select label="Role" value={form.role} onChange={set("role")}>
                <option value="" disabled>
                  Select a role
                </option>
                {roles.map((r) => (
                  <option key={r.name} value={r.name}>
                    {prettyRole(r.name)}
                  </option>
                ))}
              </Select>

              <div className="sm:col-span-2">
                <TextField
                  label="Password (auto-generated)"
                  value={password || "Fill in the name and role to generate"}
                  disabled
                />
              </div>
            </div>

            <Button type="submit" className="w-full" loading={saving} disabled={saving || !password}>
              Add staff
            </Button>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}