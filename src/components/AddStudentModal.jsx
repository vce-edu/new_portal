import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Trash2, Image as ImageIcon } from "lucide-react";
import { TextField, Select } from "./Input.jsx";
import Button from "./Button.jsx";
import { supabase } from "../createClient";
import { useAuth } from "../context/AuthContext";
import { useBranchFilter } from "../context/BranchFilterContext";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";
import { toTitleCase, formatBatchTime, formatRollNumber, combineBatchTime, splitBatchTime } from "../utils/formatting";
import { uploadStudentPhoto } from "../utils/studentPhoto";

const FIELDS = [
  { key: "roll_number", label: "Roll Number" },
  { key: "student_name", label: "Student Name" },
  { key: "father_name", label: "Father's Name" },
  { key: "mother_name", label: "Mother's Name" },
  { key: "course", label: "Course" },
  { key: "duration", label: "Duration" },
  { key: "fee_per_month", label: "Fee/mon", type: "number" },
  { key: "batch_time", label: "Batch Time" },
  { key: "branch", label: "Branch" },
  { key: "phone_number", label: "Phone Number" },
  { key: "address", label: "Address" },
  { key: "admission_date", label: "Admission Date", type: "date" },
];

// Text fields that are forced to upper case as the user types
const UPPER_KEYS = new Set(["student_name", "father_name", "mother_name", "course", "address"]);

// "6" / "6 months" / "6m" -> "6 Months"; anything else is left as typed
function formatDuration(value) {
  const m = String(value || "").trim().match(/^(\d+)\s*(months?|mon|m)?$/i);
  if (!m) return String(value || "").trim();
  const n = Number(m[1]);
  return `${n} ${n === 1 ? "Month" : "Months"}`;
}

function todayISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyRow(defaultBranch) {
  const row = Object.fromEntries(FIELDS.map((f) => [f.key, ""]));
  row.branch = defaultBranch || "";
  row.batch_time_from = "";
  row.batch_time_to = "";
  row.admission_date = todayISO(); // default to today; user can still change it
  // The photo file is held here and uploaded on submit, once roll number and
  // name are final, so it can be stored as "<roll>_<name>.<ext>".
  row.photo_file = null;
  row.photo_preview = "";
  return row;
}

export default function AddStudentModal({ onClose, onSaved }) {
  const { branch: ownBranch } = useAuth();
  const { selectedBranch } = useBranchFilter();
  const canChooseBranch = !ownBranch; // only owners (no fixed branch) can pick

  const [branchOptions, setBranchOptions] = useState([]);
  const [rows, setRows] = useState([emptyRow(selectedBranch)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useCloseOnEscape(onClose);

  useEffect(() => {
    if (canChooseBranch) {
      supabase.rpc("get_branches").then(({ data, error }) => {
        if (!error && data) setBranchOptions(data);
      });
    }
  }, [canChooseBranch]);

  // Revoke any outstanding local preview URLs when the modal unmounts.
  useEffect(() => {
    return () => {
      rows.forEach((row) => {
        if (row.photo_preview) URL.revokeObjectURL(row.photo_preview);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateRow(index, key, value) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  // Upper-cases as you type without the cursor jumping to the end
  function handleUpperChange(index, key, e) {
    const el = e.target;
    const pos = el.selectionStart;
    updateRow(index, key, el.value.toUpperCase());
    requestAnimationFrame(() => {
      try {
        el.setSelectionRange(pos, pos);
      } catch {}
    });
  }

  function handleRollNumberBlur(index) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, roll_number: formatRollNumber(row.roll_number, row.branch) } : row
      )
    );
  }

  function handleDurationBlur(index) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, duration: formatDuration(row.duration) } : row))
    );
  }

  function handleBatchTimeBlur(index, part) {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const formatted = formatBatchTime(row[part]);
        const next = { ...row, [part]: formatted };
        next.batch_time = combineBatchTime(next.batch_time_from, next.batch_time_to);
        return next;
      })
    );
  }

  // Only keeps the file and a local preview; the upload happens on submit.
  function handlePhotoChange(index, file) {
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);

    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        if (row.photo_preview) URL.revokeObjectURL(row.photo_preview);
        return { ...row, photo_file: file, photo_preview: previewUrl };
      })
    );
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(selectedBranch)]);
  }

  function removeRow(index) {
    setRows((prev) => {
      const row = prev[index];
      if (row?.photo_preview) URL.revokeObjectURL(row.photo_preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  // Let Enter submit the form from any single-line field, without hijacking
  // Enter inside a <select> (native dropdowns use Enter to confirm an option)
  // or inside a multi-line <textarea>.
  function handleFormKeyDown(e) {
    if (e.key !== "Enter") return;
    const tag = e.target.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.target.type === "submit" || e.target.type === "button") return;

    e.preventDefault();
    handleSubmit(e);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setError("");

    const invalid = rows.some((r) => !r.roll_number || !r.student_name || !r.branch);
    if (invalid) {
      setError("Roll number, student name, and branch are required for every row.");
      return;
    }

    const payloads = rows.map((row) => {
      const { photo_file, photo_preview, batch_time_from, batch_time_to, ...rest } = row;
      return {
        ...rest,
        photo_url: "", // photos live in the bucket, looked up by roll number
        duration: formatDuration(rest.duration), // covers Enter-to-submit without leaving the field
        batch_time: combineBatchTime(formatBatchTime(batch_time_from), formatBatchTime(batch_time_to)),
      };
    });

    setSaving(true);

    const results = await Promise.all(
      payloads.map((payload) => supabase.rpc("manage_student", { action: "insert", payload }))
    );

    // Upload photos only for students that were actually saved.
    const photoFailures = [];

    await Promise.all(
      rows.map(async (row, i) => {
        if (results[i].error || !row.photo_file) return;
        try {
          await uploadStudentPhoto(
            row.photo_file,
            payloads[i].roll_number,
            payloads[i].student_name
          );
        } catch (err) {
          console.error("Photo upload failed:", err);
          photoFailures.push(`${payloads[i].student_name} (${payloads[i].roll_number})`);
        }
      })
    );

    setSaving(false);

    const failed = results.filter((r) => r.error);
    if (failed.length > 0) {
      setError(`${failed.length} of ${rows.length} row(s) failed to save: ${failed[0].error.message}`);
      return;
    }

    onSaved();

    if (photoFailures.length > 0) {
      alert(
        `Students were saved, but the photo couldn't be uploaded for:\n${photoFailures.join(
          "\n"
        )}\n\nYou can upload it from the student's profile.`
      );
    }

    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/40 backdrop-blur-sm p-6">
      <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <div>
            <h2 className="font-display text-lg text-secondary">Add Students</h2>
            <p className="text-sm text-muted">Add one student, or several at once.</p>
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

        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="space-y-6 px-6 py-6">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          {rows.map((row, index) => (
            <div key={index} className="relative rounded-xl border border-border p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-secondary">Student {index + 1}</p>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    aria-label="Remove this student"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-red-500 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="mb-4 flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-primaryLight/40">
                  {row.photo_preview ? (
                    <img
                      src={row.photo_preview}
                      alt="Student"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted" />
                  )}
                </div>
                <div>
                  <label className="cursor-pointer text-sm font-medium text-primary transition-colors hover:text-primaryDark">
                    {row.photo_preview ? "Replace photo" : "Upload photo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={saving}
                      onChange={(e) => {
                        handlePhotoChange(index, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {FIELDS.map((f) => {
                  if (f.key === "branch") {
                    return canChooseBranch ? (
                      <Select
                        key={f.key}
                        label="Branch"
                        value={row.branch}
                        onChange={(e) => updateRow(index, "branch", e.target.value)}
                      >
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
                      <TextField key={f.key} label="Branch" value={toTitleCase(row.branch)} disabled />
                    );
                  }

                  if (f.key === "roll_number") {
                    return (
                      <TextField
                        key={f.key}
                        label={f.label}
                        value={row.roll_number}
                        onChange={(e) => updateRow(index, "roll_number", e.target.value)}
                        onBlur={() => handleRollNumberBlur(index)}
                        placeholder="1234"
                      />
                    );
                  }

                  if (f.key === "batch_time") {
                    return (
                      <div key={f.key} className="sm:col-span-2">
                        <p className="mb-1.5 text-sm text-muted">Batch Time</p>
                        <div className="grid grid-cols-2 gap-4">
                          <TextField
                            label="From"
                            value={row.batch_time_from}
                            onChange={(e) => updateRow(index, "batch_time_from", e.target.value)}
                            onBlur={() => handleBatchTimeBlur(index, "batch_time_from")}
                            placeholder="e.g. 9 or 5"
                          />
                          <TextField
                            label="To"
                            value={row.batch_time_to}
                            onChange={(e) => updateRow(index, "batch_time_to", e.target.value)}
                            onBlur={() => handleBatchTimeBlur(index, "batch_time_to")}
                            placeholder="e.g. 11 or 7"
                          />
                        </div>
                      </div>
                    );
                  }

                  return (
                    <TextField
                      key={f.key}
                      label={f.label}
                      type={f.type || "text"}
                      value={row[f.key]}
                      placeholder={f.key === "duration" ? "e.g. 6" : undefined}
                      onChange={(e) =>
                        UPPER_KEYS.has(f.key)
                          ? handleUpperChange(index, f.key, e)
                          : updateRow(index, f.key, e.target.value)
                      }
                      onBlur={f.key === "duration" ? () => handleDurationBlur(index) : undefined}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primaryDark"
          >
            <Plus className="h-4 w-4" />
            Add another student
          </button>

          <Button
            type="submit"
            className="w-full"
            loading={saving}
            disabled={saving}
          >
            {rows.length > 1 ? `Add ${rows.length} students` : "Add student"}
          </Button>
        </form>
      </div>
    </div>,
    document.body
  );
}