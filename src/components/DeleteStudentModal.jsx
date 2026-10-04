import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, Trash2, ArrowLeft } from "lucide-react";
import { supabase } from "../createClient";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";
import { toTitleCase } from "../utils/formatting";

export default function DeleteStudentModal({ onClose, onDeleted }) {
  useCloseOnEscape(onClose);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null); // the student chosen to delete
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc("get_students", {
        p_search: trimmed,
        p_page: 1,
        p_page_size: 8,
      });
      setLoading(false);
      if (!error) setResults(data || []);
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  async function handleDelete() {
    setDeleting(true);
    setError("");

    const { error } = await supabase.rpc("manage_student", {
      action: "delete",
      student_id: selected.id,
    });

    setDeleting(false);

    if (error) {
      setError(error.message || "Couldn't delete this student.");
      return;
    }

    onDeleted();
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/40 backdrop-blur-sm p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            {selected && (
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Back"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-primaryLight hover:text-primary"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="font-display text-lg text-secondary">Delete Student</h2>
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

        <div className="px-6 py-6">
          {!selected ? (
            <>
              <div className="relative mb-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search roll no, name, or father's name"
                  className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-4 text-sm text-text placeholder:text-muted/60 focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              {loading && <p className="text-center text-sm text-muted py-4">Searching...</p>}

              {!loading && query && results.length === 0 && (
                <p className="text-center text-sm text-muted py-4">No students match "{query}".</p>
              )}

              <div className="max-h-64 space-y-1 overflow-y-auto">
                {results.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelected(s)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-red-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">{s.student_name}</p>
                      <p className="text-xs text-muted">
                        {s.roll_number} · {toTitleCase(s.branch)}
                      </p>
                    </div>
                    <Trash2 className="h-4 w-4 shrink-0 text-red-500" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-sm text-text">
                  Delete <span className="font-medium">{selected.student_name}</span> ({selected.roll_number})?
                </p>
                <p className="mt-1 text-xs text-red-600">
                  This permanently removes their record and can't be undone.
                </p>
              </div>

              {error && (
                <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-full px-4 py-2 text-sm text-muted transition-colors hover:bg-backgroundAlt"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-60"
                >
                  {deleting ? "Deleting..." : "Delete Student"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}