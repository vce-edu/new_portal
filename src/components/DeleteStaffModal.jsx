import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, Trash2, ArrowLeft } from "lucide-react";
import { supabase } from "../createClient";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";
import { toTitleCase } from "../utils/formatting";

const prettyRole = (r) => toTitleCase((r || "").replace(/_/g, " "));

/**
 * Props
 *  - staff:     (optional) a staff member to delete ({ id, display_name, email, role, branch, staff_id }).
 *               When given (e.g. from the Branches table) the modal opens straight on the confirmation.
 *               Without it (opened from the dock) the user searches and picks someone first.
 *  - onClose:   close without deleting
 *  - onDeleted: the staff member was deleted; the parent should refresh and close
 */
export default function DeleteStaffModal({ staff, onClose, onDeleted }) {
  const [target, setTarget] = useState(staff || null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [list, setList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useCloseOnEscape(deleting ? () => {} : onClose);

  // Debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Staff the caller is allowed to delete
  useEffect(() => {
    if (target) return;
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      const { data, error } = await supabase.rpc("get_deletable_staff", { p_search: search || null });
      if (cancelled) return;
      if (error) {
        setError(error.message || "Couldn't load staff.");
        setList([]);
      } else {
        setError("");
        setList(data || []);
      }
      setLoadingList(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [search, target]);

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    setError("");
    const { error } = await supabase.rpc("delete_staff", { p_staff_id: target.id });
    setDeleting(false);
    if (error) {
      setError(error.message || "Couldn't delete this staff member.");
      return;
    }
    onDeleted();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/40 backdrop-blur-sm p-6">
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <div className="flex items-center gap-3">
            {target && !staff && (
              <button
                type="button"
                onClick={() => {
                  setTarget(null);
                  setError("");
                }}
                disabled={deleting}
                aria-label="Back to list"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-primaryLight hover:text-primary"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h2 className="font-display text-lg text-secondary">Delete Staff</h2>
              <p className="text-sm text-muted">
                {target ? "Confirm this deletion." : "Pick the staff member to remove."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-primaryLight hover:text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{error}</div>
          )}

          {target ? (
            <>
              <div className="space-y-2 rounded-xl border border-border bg-backgroundAlt p-5 text-sm">
                <Row label="Name" value={target.display_name ? toTitleCase(target.display_name) : "—"} />
                <Row label="Staff ID" value={target.staff_id || "—"} />
                <Row label="Email" value={target.email || "—"} />
                <Row label="Role" value={prettyRole(target.role) || "—"} />
                <Row label="Branch" value={target.branch ? toTitleCase(target.branch) : "—"} />
              </div>

              <p className="text-sm text-muted">
                This removes their login and staff record permanently. They won't be able to sign in again, and this
                can't be undone.
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={deleting}
                  className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium text-secondary transition-colors hover:bg-backgroundAlt focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-red-500 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? "Deleting..." : "Delete staff"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search name, email or staff ID"
                  autoFocus
                  className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-4 text-sm text-text placeholder:text-muted/60 focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              {loadingList ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-xl border border-border bg-backgroundAlt" />
                  ))}
                </div>
              ) : list.length === 0 ? (
                <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
                  {search ? `No staff match "${search}".` : "No staff you can delete."}
                </div>
              ) : (
                <ul className="space-y-2">
                  {list.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setTarget(s)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors hover:border-red-200 hover:bg-red-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-secondary">
                            {s.display_name ? toTitleCase(s.display_name) : s.email}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {s.email} · {toTitleCase(s.branch || "")}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-primaryLight px-2.5 py-1 text-xs font-medium text-primary">
                          {prettyRole(s.role)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right text-secondary">{value}</span>
    </div>
  );
}