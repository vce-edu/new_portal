import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Image as ImageIcon, Search } from "lucide-react";
import { TextField, Select } from "./Input.jsx";
import Button from "./Button.jsx";
import { supabase, secSupabase } from "../createClient";
import { useAuth } from "../context/AuthContext";
import { useBranchFilter } from "../context/BranchFilterContext";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";
import { toTitleCase } from "../utils/formatting";

// Same bucket (in the second Supabase project) that student photos use.
const PHOTO_BUCKET = "student-photos";

// Text fields that are always stored in UPPERCASE.
const UPPER_FIELDS = ["student_name", "father_name", "mother_name", "address"];

const EMPTY = {
  student_name: "",
  father_name: "",
  mother_name: "",
  gender: "Male",
  address: "",
  mobile_number: "",
  exam_branch: "",
  staff_id: "",
  exam_date: "",
  exam_time: "",
  exam_score: "",
  admitcard_fetched: false,
  present: false,
  confirmed: false,
  photo_url: "",
};

// Postgres returns time as "09:00:00"; <input type="time"> wants "09:00"
const toTimeInput = (t) => (t ? String(t).slice(0, 5) : "");

const MAX_STAFF_RESULTS = 8;

/**
 * Search-and-select for marketing staff. The user types a name or a staff ID,
 * picks one from the list, and that staff's ID becomes the value. Free-typed
 * text is never saved, only a selected staff member.
 *
 * staff: [{ display_name, staff_id }] from the get_marketing_staff RPC.
 */
function StaffPicker({ value, onChange, staff, loading, error, disabled }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = value ? staff.find((s) => String(s.staff_id) === String(value)) : null;

  const q = query.trim().toLowerCase();
  const matches = (
    q
      ? staff.filter(
          (s) =>
            String(s.display_name || "").toLowerCase().includes(q) ||
            String(s.staff_id || "").toLowerCase().includes(q)
        )
      : staff
  ).slice(0, MAX_STAFF_RESULTS);

  // close the list when clicking outside of it
  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => setActive(0), [query]);

  function choose(s) {
    onChange(String(s.staff_id));
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange("");
    setQuery("");
    // let the chip unmount, then focus the search box again
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // never submit the whole form from this box
      e.preventDefault();
      if (open && matches[active]) choose(matches[active]);
    }
  }

  const labelCls = "mb-1 block text-sm font-medium text-text";
  const boxCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text focus:outline-none focus:border-primary transition-colors";

  // A staff member is bound: show who it is
  if (value) {
    return (
      <div>
        <label className={labelCls}>Staff</label>
        <div
          className={`flex items-center justify-between gap-2 ${boxCls} ${
            disabled ? "bg-primaryLight/30" : ""
          }`}
        >
          <span className="truncate">
            {selected ? (
              <>
                {selected.display_name} <span className="text-muted">· {selected.staff_id}</span>
              </>
            ) : (
              // staff_id saved on the applicant but not in the marketing list
              <>
                <span className="text-muted">Staff ID</span> {value}
              </>
            )}
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={clear}
              aria-label="Remove staff"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-primaryLight hover:text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (disabled) {
    return (
      <div>
        <label className={labelCls}>Staff</label>
        <div className={`${boxCls} bg-primaryLight/30 text-muted`}>—</div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <label className={labelCls}>Staff</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={loading ? "Loading staff..." : "Search by name or staff ID"}
          autoComplete="off"
          className={`${boxCls} pl-9`}
        />
      </div>

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {open && !loading && !error && (
        <ul className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-background py-1 shadow-lg">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">No staff found.</li>
          ) : (
            matches.map((s, i) => (
              <li key={s.staff_id}>
                <button
                  type="button"
                  // mousedown (not click) so the choice lands before any blur
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(s);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                    i === active ? "bg-primaryLight text-primary" : "text-text"
                  }`}
                >
                  <span className="truncate">{s.display_name}</span>
                  <span className="shrink-0 text-xs text-muted">{s.staff_id}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Add (applicant = null) or view/edit (applicant = row) a scholarship applicant.
 * canEdit=false renders everything read-only.
 */
export default function ApplicantModal({ applicant = null, canEdit = true, onClose, onSaved }) {
  const isEdit = !!applicant;
  const { branch: ownBranch } = useAuth();
  const { selectedBranch } = useBranchFilter();
  const canChooseBranch = !ownBranch; // only owners (no fixed branch) can pick

  const originalTime = toTimeInput(applicant?.exam_time);

  const [form, setForm] = useState(() => {
    if (!applicant) return { ...EMPTY, exam_branch: ownBranch || selectedBranch || "" };
    return {
      ...EMPTY,
      ...applicant,
      // show existing records in uppercase too
      student_name: (applicant.student_name ?? "").toUpperCase(),
      father_name: (applicant.father_name ?? "").toUpperCase(),
      mother_name: (applicant.mother_name ?? "").toUpperCase(),
      address: (applicant.address ?? "").toUpperCase(),
      staff_id: applicant.staff_id ?? "",
      exam_date: applicant.exam_date ?? "",
      exam_time: originalTime,
      exam_score: applicant.exam_score ?? "",
      photo_url: applicant.photo_url ?? "",
    };
  });
  const [branchOptions, setBranchOptions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [timeTouched, setTimeTouched] = useState(false); // user typed their own time
  const [slotLoading, setSlotLoading] = useState(false);
  const [slotFull, setSlotFull] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [staff, setStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState("");

  useCloseOnEscape(onClose);

  useEffect(() => {
    if (canChooseBranch) {
      supabase.rpc("get_branches").then(({ data, error }) => {
        if (!error && data) setBranchOptions(data);
      });
    }
  }, [canChooseBranch]);

  // Marketing staff for the picker (display name + staff id)
  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_marketing_staff").then(({ data, error }) => {
      if (cancelled) return;
      if (error) setStaffError(error.message || "Couldn't load staff.");
      else setStaff(data || []);
      setStaffLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-fill the exam time once branch + date are known. The user can still
  // overwrite it; once they do, we stop auto-filling until they clear the field.
  useEffect(() => {
    if (!canEdit || timeTouched) return;

    if (!form.exam_date) {
      setSlotFull(false);
      setForm((f) => (f.exam_time ? { ...f, exam_time: "" } : f));
      return;
    }
    if (!form.exam_branch) return;

    // editing an existing applicant whose date/branch are unchanged: keep the stored slot
    if (
      isEdit &&
      originalTime &&
      form.exam_date === (applicant.exam_date ?? "") &&
      form.exam_branch === applicant.exam_branch
    ) {
      return;
    }

    let cancelled = false;
    setSlotLoading(true);
    supabase
      .rpc("preview_exam_slot", {
        p_branch: form.exam_branch,
        p_date: form.exam_date,
        p_exclude_roll: isEdit ? applicant.roll_number : null,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        setSlotLoading(false);
        if (error) return; // leave the field as-is; the server still assigns on save
        setSlotFull(data == null);
        setForm((f) => ({ ...f, exam_time: toTimeInput(data) }));
      });

    return () => {
      cancelled = true;
      setSlotLoading(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.exam_branch, form.exam_date, timeTouched]);

  // Revoke the local preview URL when it is replaced or the modal closes.
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  async function handlePhotoChange(file) {
    if (!file) return;

    setPhotoPreview(URL.createObjectURL(file));
    setPhotoUploading(true);
    setPhotoError("");

    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await secSupabase.storage.from(PHOTO_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

    if (uploadError) {
      setPhotoUploading(false);
      setPhotoPreview("");
      setPhotoError(uploadError.message);
      return;
    }

    const { data } = secSupabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    setForm((f) => ({ ...f, photo_url: data.publicUrl }));
    setPhotoUploading(false);
  }

  // Generic change handler. Name/address fields are converted to UPPERCASE as the user types.
  const set = (key) => (e) => {
    let value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    if (UPPER_FIELDS.includes(key) && typeof value === "string") {
      value = value.toUpperCase();
    }
    setForm((f) => ({ ...f, [key]: value }));
  };

  async function handleSave(e) {
    e.preventDefault();
    setError("");

    if (!form.student_name.trim() || !form.father_name.trim() || !form.mother_name.trim() || !form.address.trim()) {
      setError("Student name, parents' names and address are required.");
      return;
    }
    if (photoUploading) {
      setError("Please wait for the photo upload to finish before saving.");
      return;
    }
    if (!form.exam_branch) {
      setError("Please select an exam branch.");
      return;
    }
    if (!/^[0-9]{10}$/.test(form.mobile_number)) {
      setError("Mobile number must be exactly 10 digits.");
      return;
    }

    // If the date or branch changed but the time was left alone, send no time
    // so the server assigns a fresh slot instead of keeping a stale one.
    const slotInputsChanged =
      isEdit &&
      (form.exam_date !== (applicant.exam_date ?? "") || form.exam_branch !== applicant.exam_branch);
    const sendTime = slotInputsChanged && form.exam_time === originalTime ? null : form.exam_time || null;

    setSaving(true);
    const payload = {
      // uppercase + trimmed again at save time as a safety net
      student_name: form.student_name.trim().toUpperCase(),
      father_name: form.father_name.trim().toUpperCase(),
      mother_name: form.mother_name.trim().toUpperCase(),
      gender: form.gender,
      address: form.address.trim().toUpperCase(),
      mobile_number: form.mobile_number,
      exam_branch: form.exam_branch,
      staff_id: form.staff_id || null,
      exam_date: form.exam_date || null,
      exam_time: sendTime,
      exam_score: form.exam_score === "" ? null : form.exam_score,
      admitcard_fetched: form.admitcard_fetched,
      present: form.present,
      confirmed: form.confirmed,
      photo_url: form.photo_url || null,
    };

    const { error } = await supabase.rpc("manage_scholarship_applicant", {
      action: isEdit ? "update" : "insert",
      p_roll_number: isEdit ? applicant.roll_number : null,
      payload,
    });
    setSaving(false);

    if (error) {
      setError(error.message || "Couldn't save this applicant.");
      return;
    }
    onSaved?.();
    onClose();
  }

  const ro = !canEdit;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/40 backdrop-blur-sm p-6">
      <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <div>
            <h2 className="font-display text-lg text-secondary">
              {isEdit ? `Applicant #${applicant.roll_number}` : "Add Applicant"}
            </h2>
            <p className="text-sm text-muted">
              {isEdit ? "View or update this applicant's details." : "Register a scholarship applicant."}
            </p>
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

        <form onSubmit={handleSave} className="space-y-6 px-6 py-6">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-primaryLight/40">
              {photoPreview || form.photo_url ? (
                <img src={photoPreview || form.photo_url} alt="Applicant" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-6 w-6 text-muted" />
              )}
            </div>
            {!ro && (
              <div>
                <label className="cursor-pointer text-sm font-medium text-primary transition-colors hover:text-primaryDark">
                  {photoUploading ? "Uploading..." : form.photo_url ? "Replace photo" : "Upload photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={photoUploading}
                    onChange={(e) => handlePhotoChange(e.target.files?.[0])}
                  />
                </label>
                {photoError && <p className="mt-1 text-xs text-red-600">{photoError}</p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Student Name" value={form.student_name} onChange={set("student_name")} disabled={ro} />
            <Select label="Gender" value={form.gender} onChange={set("gender")} disabled={ro}>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </Select>
            <TextField label="Father's Name" value={form.father_name} onChange={set("father_name")} disabled={ro} />
            <TextField label="Mother's Name" value={form.mother_name} onChange={set("mother_name")} disabled={ro} />
            <TextField
              label="Mobile Number"
              value={form.mobile_number}
              onChange={set("mobile_number")}
              inputMode="numeric"
              maxLength={10}
              disabled={ro}
            />

            {canChooseBranch ? (
              <Select label="Exam Branch" value={form.exam_branch} onChange={set("exam_branch")} disabled={ro}>
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
              <TextField label="Exam Branch" value={toTitleCase(form.exam_branch)} disabled />
            )}

            <div className="sm:col-span-2">
              <TextField label="Address" value={form.address} onChange={set("address")} disabled={ro} />
            </div>

            <TextField label="Exam Date" type="date" value={form.exam_date} onChange={set("exam_date")} disabled={ro} />
            <TextField
              label="Exam Time"
              type="time"
              value={form.exam_time}
              onChange={(e) => {
                setTimeTouched(e.target.value !== "");
                setForm((f) => ({ ...f, exam_time: e.target.value }));
              }}
              disabled={ro}
            />
            {!ro && (
              <p className="-mt-2 text-xs text-muted sm:col-span-2">
                {slotLoading
                  ? "Checking available slot..."
                  : slotFull
                  ? "All slots are full for this branch and date. Pick a time manually."
                  : "Auto-filled from availability (9 AM first, next hour after 100 applicants). You can change it."}
              </p>
            )}

            <TextField
              label="Exam Score"
              type="number"
              step="0.01"
              min="0"
              value={form.exam_score}
              onChange={set("exam_score")}
              disabled={ro}
            />

            <StaffPicker
              value={form.staff_id}
              onChange={(id) => setForm((f) => ({ ...f, staff_id: id }))}
              staff={staff}
              loading={staffLoading}
              error={staffError}
              disabled={ro}
            />
          </div>

          <div className="flex flex-wrap gap-5">
            {[
              ["admitcard_fetched", "Admit card fetched"],
              ["present", "Present"],
              ["confirmed", "Confirmed"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={set(key)}
                  disabled={ro}
                  className="h-4 w-4 accent-primary"
                />
                {label}
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              {ro ? "Close" : "Cancel"}
            </Button>
            {!ro && (
              <Button type="submit" loading={saving} disabled={saving || photoUploading}>
                {isEdit ? "Save changes" : "Add applicant"}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}