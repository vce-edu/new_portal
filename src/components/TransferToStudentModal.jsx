import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { TextField } from "./Input.jsx";
import Button from "./Button.jsx";
import { supabase } from "../createClient";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";
import { toTitleCase } from "../utils/formatting";

// First letter of the branch + "_" + scholarship roll number, e.g. "m_123"
function studentRollNumber(branch, rollNumber) {
  const initial = String(branch || "").trim().charAt(0).toLowerCase();
  return `${initial}_${rollNumber}`;
}

// "6" / "6 months" / "6m" -> "6 Months"; anything else is left as typed
// (same rule AddStudentModal uses)
function formatDuration(value) {
  const m = String(value || "").trim().match(/^(\d+)\s*(months?|mon|m)?$/i);
  if (!m) return String(value || "").trim();
  const n = Number(m[1]);
  return `${n} ${n === 1 ? "Month" : "Months"}`;
}

// AddStudentModal stores these fields in upper case, so do the same here
const upper = (v) => String(v || "").trim().toUpperCase();

// Local date as YYYY-MM-DD (toISOString would use UTC and can be a day behind in India)
const todayLocal = () => new Date().toLocaleDateString("en-CA");

function Info({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="truncate text-sm text-text">{value || "—"}</p>
    </div>
  );
}

/**
 * Copies a scholarship applicant into the students table.
 * Everything the applicant record already has is copied automatically;
 * course, duration, fee, batch time and admission date are asked for here.
 *
 * The students table can't be written to directly, so this goes through the
 * same manage_student RPC that AddStudentModal uses.
 *
 * applicant: a row from get_scholarship_applicants
 * After a successful copy the applicant is also marked confirmed (via the
 * manage_scholarship_applicant RPC).
 *
 * onDone(studentRollNumber, { confirmed, confirmError }): called after a successful copy
 */
export default function TransferToStudentModal({ applicant, onClose, onDone }) {
  const rollNumber = studentRollNumber(applicant.exam_branch, applicant.roll_number);

  const [form, setForm] = useState({
    course: "",
    duration: "",
    fee_per_month: "",
    batch_time: "",
    admission_date: todayLocal(),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Set when the RPC reports a duplicate roll number
  const [alreadyExists, setAlreadyExists] = useState(false);

  useCloseOnEscape(onClose);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const course = upper(form.course);
    const duration = formatDuration(form.duration);
    const batchTime = form.batch_time.trim();
    const fee = Number(form.fee_per_month);

    if (!course || !duration || !batchTime || form.fee_per_month === "") {
      setError("Course, duration, fee per month and batch time are required.");
      return;
    }
    if (isNaN(fee) || fee < 0) {
      setError("Fee per month must be a valid amount.");
      return;
    }
    if (!form.admission_date) {
      setError("Please choose an admission date.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc("manage_student", {
      action: "insert",
      payload: {
        roll_number: rollNumber,
        student_name: upper(applicant.student_name),
        father_name: upper(applicant.father_name),
        mother_name: upper(applicant.mother_name),
        address: upper(applicant.address),
        phone_number: applicant.mobile_number,
        branch: applicant.exam_branch,
        photo_url: applicant.photo_url || "",
        course,
        duration,
        fee_per_month: fee,
        batch_time: batchTime,
        admission_date: form.admission_date,
      },
    });
    setSaving(false);

    if (error) {
      const isDuplicate =
        error.code === "23505" || /duplicate|already exists/i.test(error.message || "");
      if (isDuplicate) {
        setAlreadyExists(true);
        setError(
          `A student with roll number ${rollNumber} already exists. This applicant may already be transferred.`
        );
      } else {
        setError(error.message || "Couldn't copy this applicant to the students table.");
      }
      return;
    }

    // The student now exists, so mark the applicant as confirmed. If this step
    // fails the transfer itself still succeeded, so report it instead of erroring.
    let confirmed = true;
    let confirmError = "";
    if (!applicant.confirmed) {
      const { error: confirmErr } = await supabase.rpc("manage_scholarship_applicant", {
        action: "update",
        p_roll_number: applicant.roll_number,
        payload: { confirmed: true },
      });
      if (confirmErr) {
        confirmed = false;
        confirmError = confirmErr.message || "Couldn't mark the applicant as confirmed.";
      }
    }

    onDone?.(rollNumber, { confirmed, confirmError });
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/40 backdrop-blur-sm p-6">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <div>
            <h2 className="font-display text-lg text-secondary">Transfer to Students</h2>
            <p className="text-sm text-muted">
              Copy {applicant.student_name} (#{applicant.roll_number}) into the students table.
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

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-6">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          <div>
            <p className="mb-3 text-sm font-medium text-text">Copied from the applicant</p>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-border bg-primaryLight/30 p-4 sm:grid-cols-2">
              <Info label="New roll number" value={rollNumber} />
              <Info label="Branch" value={toTitleCase(applicant.exam_branch)} />
              <Info label="Student name" value={applicant.student_name} />
              <Info label="Phone number" value={applicant.mobile_number} />
              <Info label="Father's name" value={applicant.father_name} />
              <Info label="Mother's name" value={applicant.mother_name} />
              <div className="sm:col-span-2">
                <Info label="Address" value={applicant.address} />
              </div>
              <Info label="Photo" value={applicant.photo_url ? "Will be copied" : "No photo"} />
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm font-medium text-text">Fill in the remaining details</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Course" value={form.course} onChange={set("course")} />
              <TextField
                label="Duration"
                value={form.duration}
                onChange={set("duration")}
                placeholder="e.g. 6"
              />
              <TextField
                label="Fee per Month"
                type="number"
                step="0.01"
                min="0"
                value={form.fee_per_month}
                onChange={set("fee_per_month")}
              />
              <TextField
                label="Batch Time"
                value={form.batch_time}
                onChange={set("batch_time")}
                placeholder="e.g. 10:00 AM - 11:00 AM"
              />
              <TextField
                label="Admission Date"
                type="date"
                value={form.admission_date}
                onChange={set("admission_date")}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={saving || alreadyExists}>
              Transfer student
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}