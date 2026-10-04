import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Download,
  RefreshCw,
  ArrowLeft,
  Image as ImageIcon,
} from "lucide-react";
import { TextField } from "./Input.jsx";
import { supabase, secSupabase } from "../createClient";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";
import {
  generateDiplomaPDF,
  computeTotals,
  makeEmptySubject,
  formatAdmissionDate,
  generatePath,
  generateCertificateNo,
  ALLOWED_MIME,
  BUCKET,
} from "../utils/diplomaPdf";

const PHOTO_BUCKET = "student-photos";
const EXIT_MS = 220;

const STEPS = [
  { id: "fee", label: "Fee check" },
  { id: "details", label: "Details" },
  { id: "generate", label: "Generate & upload" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Tries the photo saved on the profile first, then falls back to the bucket lookup by roll number.
async function fetchStudentPhoto(student) {
  if (student.photo_url) {
    try {
      const res = await fetch(student.photo_url);
      if (res.ok) return await blobToBase64(await res.blob());
    } catch (err) {
      console.error("photo_url fetch failed, trying bucket lookup:", err);
    }
  }

  try {
    const roll = student.roll_number;
    if (!roll) return null;

    const { data: files, error } = await secSupabase.storage
      .from(PHOTO_BUCKET)
      .list("", { search: roll });
    if (error) throw error;

    const file = files?.find((f) => f.name.startsWith(`${roll}_`));
    if (!file) return null;

    const { data: urlData, error: signedError } = await secSupabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(file.name, 60 * 60);
    if (signedError) throw signedError;

    const res = await fetch(urlData.signedUrl);
    return await blobToBase64(await res.blob());
  } catch (err) {
    console.error("Error loading student photo:", err);
    return null;
  }
}

// ─── Small UI pieces ──────────────────────────────────────────────────────────
function StepIndicator({ current }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);

  return (
    <ol className="flex w-full items-center">
      {STEPS.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={s.id} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={[
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors duration-300",
                  active
                    ? "bg-primary text-white"
                    : done
                    ? "bg-primaryLight text-primary"
                    : "border border-border text-muted",
                ].join(" ")}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={[
                  "hidden text-sm sm:inline",
                  active ? "font-medium text-secondary" : "text-muted",
                ].join(" ")}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={[
                  "mx-3 h-px flex-1 transition-colors duration-500",
                  done ? "bg-primary/40" : "bg-border",
                ].join(" ")}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Field({ missing, hint, className = "", ...props }) {
  return (
    <div className={className}>
      <TextField {...props} />
      {missing && (
        <p className="mt-1 text-xs text-amber-600">
          {hint || "Not in the student's record. Please fill this in."}
        </p>
      )}
    </div>
  );
}

function Section({ title, note, children }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-display text-base text-secondary">{title}</h3>
        {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function PrimaryButton({ className = "", children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function GhostButton({ className = "", children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-primaryLight hover:text-primary disabled:cursor-not-allowed disabled:opacity-60",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ErrorBox({ children }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
      {children}
    </div>
  );
}

const cellInput =
  "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40";

function SubjectsTable({ subjects, onChange, onAdd, onRemove }) {
  const update = (id, field, value) => {
    onChange(
      subjects.map((s) =>
        s.id === id
          ? { ...s, [field]: value, ...(field === "minMarks" ? { obtainedMarks: value } : {}) }
          : s
      )
    );
  };

  const cols = "grid-cols-[1.4fr_2fr_0.8fr_0.9fr_32px]";

  return (
    <Section title="Subjects and marks">
      <div className="overflow-x-auto rounded-xl border border-border">
        <div className="min-w-[560px]">
          <div className={`grid ${cols} gap-2 bg-backgroundAlt px-3 py-2 text-xs text-muted`}>
            <span>Subject</span>
            <span>Exam type</span>
            <span>Max</span>
            <span>Scored</span>
            <span />
          </div>

          {subjects.map((s) => (
            <div key={s.id} className={`grid ${cols} items-center gap-2 border-t border-border px-3 py-2`}>
              <input
                className={cellInput}
                value={s.subject}
                onChange={(e) => update(s.id, "subject", e.target.value)}
                placeholder="e.g. MS Excel"
                aria-label="Subject name"
              />
              <input
                className={cellInput}
                value={s.examType}
                onChange={(e) => update(s.id, "examType", e.target.value)}
                placeholder="Practical"
                aria-label="Exam type"
              />
              <input
                className={cellInput}
                type="number"
                value={s.maxMarks}
                onChange={(e) => update(s.id, "maxMarks", e.target.value)}
                placeholder="100"
                aria-label="Maximum marks"
              />
              <input
                className={cellInput}
                type="number"
                value={s.minMarks}
                onChange={(e) => update(s.id, "minMarks", e.target.value)}
                placeholder="80"
                aria-label="Marks scored"
              />
              <button
                type="button"
                onClick={() => onRemove(s.id)}
                disabled={subjects.length === 1}
                aria-label="Remove subject"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primaryLight"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
        Add subject
      </button>
    </Section>
  );
}

function TotalsSummary({ totals }) {
  const items = [
    { label: "Total", value: `${totals.totalObtained} / ${totals.totalMax}` },
    { label: "Percentage", value: totals.hasMarks ? `${totals.percentage.toFixed(2)}%` : "—" },
    { label: "Division", value: totals.division },
    { label: "Grade", value: totals.grade },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl bg-primaryLight/40 p-4 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <p className="text-xs text-muted">{it.label}</p>
          <p className="mt-0.5 truncate text-base font-medium text-secondary">{it.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
/*
  Props
  - student:    the student object shown in the profile (same shape as StudentModal's `data`)
  - onClose:    called after the exit animation
  - onUploaded: optional, called once the PDF has been stored
*/
export default function DiplomaModal({ student, onClose, onUploaded }) {
  const [step, setStep] = useState("fee");

  // Fee check
  const [feeStatus, setFeeStatus] = useState(null); // "pending" | "not-found" | "up-to-date"
  const [feeLoading, setFeeLoading] = useState(true);

  // Details — pre-filled from the profile, anything empty gets flagged
  const [studentName, setStudentName] = useState(student.student_name || "");
  const [fatherName, setFatherName] = useState(student.father_name || "");
  const [motherName, setMotherName] = useState(student.mother_name || "");
  const [course, setCourse] = useState(student.course || "");
  const [courseFrom, setCourseFrom] = useState(
    formatAdmissionDate(student.admission_date || student.addmission_date)
  );
  const [courseDuration, setCourseDuration] = useState(student.duration || "");
  const [marksheetNo, setMarksheetNo] = useState("");
  const [certificateNo] = useState(generateCertificateNo);
  const [marksheetYear, setMarksheetYear] = useState(String(new Date().getFullYear()));
  const [subjects, setSubjects] = useState(() => [makeEmptySubject()]);
  const [detailsError, setDetailsError] = useState("");

  // Institute address for this student's branch — same lookup AddTransactionModal
  // uses for the printed fee receipt.
  const [branchAddress, setBranchAddress] = useState("");

  // Photo
  const [photoBase64, setPhotoBase64] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(true);

  // Generate + upload
  const [pdfBlob, setPdfBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [canOverwrite, setCanOverwrite] = useState(false);

  // Enter / exit animation
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeTimerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const busyRef = useRef(false);
  busyRef.current = uploading;

  const previewUrlRef = useRef(null);
  previewUrlRef.current = previewUrl;

  const totals = computeTotals(subjects);

  useEffect(() => {
    let id2;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
      clearTimeout(closeTimerRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function requestClose() {
    if (closingRef.current || busyRef.current) return;
    closingRef.current = true;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      onCloseRef.current();
      return;
    }
    setClosing(true);
    closeTimerRef.current = setTimeout(() => onCloseRef.current(), EXIT_MS);
  }

  useCloseOnEscape(() => requestClose());

  // Fee check on open
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_student_fee_status", {
          p_branch: student.branch || "main",
          p_search: student.roll_number,
          p_limit: 5,
          p_offset: 0,
          p_only_pending: false,
        });
        if (error) throw error;
        if (cancelled) return;

        const rows = data || [];
        const row = rows.find((r) => r.roll_number === student.roll_number) ?? rows[0];

        if (!row) {
          setFeeStatus("not-found");
        } else if (row.status?.toLowerCase().includes("up")) {
          setFeeStatus("up-to-date");
          setStep("details");
        } else {
          setFeeStatus("pending");
        }
      } catch (err) {
        console.error("feeCheck:", err);
        if (!cancelled) setFeeStatus("not-found");
      } finally {
        if (!cancelled) setFeeLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the student's photo on open
  useEffect(() => {
    let cancelled = false;
    fetchStudentPhoto(student).then((b64) => {
      if (cancelled) return;
      setPhotoBase64((prev) => prev ?? b64);
      setPhotoLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Look up the branch address for the diploma header — same get_branches lookup
  // AddTransactionModal uses to pick the printed address for a receipt.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: branches, error } = await supabase.rpc("get_branches");
        if (error) throw error;

        const studentBranch = (student.branch || "").trim().toLowerCase();
        const branchRow = (branches || []).find(
          (b) => (b.branch || "").trim().toLowerCase() === studentBranch
        );
        if (!cancelled) setBranchAddress(branchRow?.address || "");
      } catch (err) {
        console.error("get_branches:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoFile(file);
    blobToBase64(file).then(setPhotoBase64);
  }

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPdfBlob(null);
    setPreviewUrl(null);
  }

  function handleProceedToGenerate() {
    if (!studentName.trim() || !fatherName.trim() || !course.trim()) {
      setDetailsError("Student name, father's name and course are required.");
      return;
    }
    if (!photoBase64) {
      setDetailsError("A student photo is required for the diploma. Please upload one.");
      return;
    }
    setDetailsError("");
    setStep("generate");
  }

  function handleBackToDetails() {
    clearPreview();
    setUploadError("");
    setCanOverwrite(false);
    setGenerateError("");
    setStep("details");
  }

  async function runGenerate() {
    setGenerating(true);
    setGenerateError("");
    setUploadError("");
    setCanOverwrite(false);

    try {
      const t = computeTotals(subjects);
      const blob = await generateDiplomaPDF({
        studentName,
        fatherName,
        motherName,
        rollNumber: student.roll_number,
        branchAddress,
        course,
        courseFrom,
        courseDuration,
        marksheetNo,
        certificateNo,
        marksheetYear,
        subjects,
        totalMax: t.totalMax,
        totalObtained: t.totalObtained,
        percentage: t.percentage,
        division: t.division,
        grade: t.grade,
        hasMarks: t.hasMarks,
        studentPhotoBase64: photoBase64,
      });
      const url = URL.createObjectURL(blob);
      setPdfBlob(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      console.error("generateDiplomaPDF:", err);
      setGenerateError("Couldn't generate the diploma PDF. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  // Generate as soon as the generate step opens
  useEffect(() => {
    if (step === "generate" && !pdfBlob && !generating) runGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function handleUpload(overwrite = false) {
    if (!pdfBlob) return;

    setUploading(true);
    setUploadError("");
    setCanOverwrite(false);

    try {
      const path = generatePath(student.roll_number);
      const file = new File([pdfBlob], `${path}.pdf`, { type: ALLOWED_MIME });

      const { error } = await secSupabase.storage.from(BUCKET).upload(path, file, {
        contentType: ALLOWED_MIME,
        upsert: overwrite,
        cacheControl: "3600",
      });

      if (error) {
        const exists =
          /already exists|duplicate/i.test(error.message || "") || String(error.statusCode) === "409";
        setCanOverwrite(exists);
        throw new Error(
          exists ? "A diploma for this roll number is already uploaded." : error.message || "Upload failed."
        );
      }

      setUploadResult({ path });
      onUploaded?.();
    } catch (err) {
      console.error("upload:", err);
      setUploadError(err.message || "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  const show = entered && !closing;
  const fileName = `${generatePath(student.roll_number)}.pdf`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upload diploma"
      className={[
        "fixed inset-0 z-[70] overflow-y-auto bg-background transition-opacity ease-out motion-reduce:transition-none",
        show ? "opacity-100 duration-300" : "opacity-0 duration-200",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={requestClose}
        disabled={uploading}
        aria-label="Close"
        className="fixed right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted transition-colors hover:bg-primaryLight hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 sm:right-5 sm:top-5"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="mx-auto w-full max-w-2xl space-y-8 px-4 pb-20 pt-14 sm:px-6">
        <header className="pr-12">
          <h2 className="font-display text-2xl text-secondary sm:text-3xl">Upload diploma</h2>
          <p className="mt-1 text-muted">
            {student.student_name || "Unnamed student"} · {student.roll_number}
          </p>
        </header>

        <StepIndicator current={step} />

        {/* ── Fee check ── */}
        {step === "fee" && (
          <div className="space-y-5">
            {feeLoading && (
              <div className="flex flex-col items-center gap-3 py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted">Checking fee records…</p>
              </div>
            )}

            {!feeLoading && (feeStatus === "pending" || feeStatus === "not-found") && (
              <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-800">
                      {feeStatus === "pending" ? "Fees are pending" : "Fee status couldn't be verified"}
                    </p>
                    <p className="mt-0.5 text-sm text-amber-700">
                      {feeStatus === "pending"
                        ? "This student has pending fee dues. Do you still want to create the diploma?"
                        : "No fee records were found for this student. Do you still want to create the diploma?"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <PrimaryButton className="flex-1" onClick={() => setStep("details")}>
                    Continue anyway
                  </PrimaryButton>
                  <GhostButton className="flex-1" onClick={requestClose}>
                    Cancel
                  </GhostButton>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Details ── */}
        {step === "details" && (
          <div className="space-y-8">
            <Section title="Student" note="Filled in from the student's record. Edit anything that's wrong.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label="Student name"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="Full name"
                  missing={!studentName.trim()}
                />
                <Field
                  label="Father's name"
                  value={fatherName}
                  onChange={(e) => setFatherName(e.target.value)}
                  placeholder="Father's name"
                  missing={!fatherName.trim()}
                />
                <Field
                  label="Mother's name"
                  value={motherName}
                  onChange={(e) => setMotherName(e.target.value)}
                  placeholder="Mother's name"
                  missing={!motherName.trim()}
                  hint="Not in the student's record. Leave blank to print a dash."
                />
                <div className="pointer-events-none opacity-60">
                  <TextField label="Roll number" value={student.roll_number || ""} onChange={() => {}} readOnly />
                </div>
              </div>

              {/* Photo */}
              <div className="flex items-center gap-4 rounded-xl border border-border p-4">
                <div className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-primaryLight/40">
                  {photoLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : photoBase64 ? (
                    <img src={photoBase64} alt="Student" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-secondary">Student photo</p>
                  <p className={`mt-0.5 text-xs ${!photoLoading && !photoBase64 ? "text-red-600" : "text-muted"}`}>
                    {photoLoading
                      ? "Looking for the photo on the profile…"
                      : photoFile
                      ? `Using ${photoFile.name}`
                      : photoBase64
                      ? "Loaded from the student's profile."
                      : "No photo on file. Upload one to continue."}
                  </p>

                  <label className="mt-2 inline-flex cursor-pointer items-center rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors focus-within:ring-2 focus-within:ring-primary/40 hover:bg-primaryLight hover:text-primary">
                    {photoBase64 ? "Replace photo" : "Upload photo"}
                    <input type="file" accept="image/*" className="sr-only" onChange={handlePhotoChange} />
                  </label>
                </div>
              </div>
            </Section>

            <Section title="Course">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  className="sm:col-span-2"
                  label="Course name"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  placeholder="e.g. DCA"
                  missing={!course.trim()}
                />
                <Field
                  label="Course from (admission date)"
                  value={courseFrom}
                  onChange={(e) => setCourseFrom(e.target.value)}
                  placeholder="e.g. January 15, 2025"
                  missing={!courseFrom.trim()}
                  hint="No admission date on record. Enter it as it should print."
                />
                <Field
                  label="Course duration"
                  value={courseDuration}
                  onChange={(e) => setCourseDuration(e.target.value)}
                  placeholder="e.g. 6 Months"
                  missing={!courseDuration.trim()}
                />
              </div>
            </Section>

            <Section
              title="Certificate"
              note="Marksheet no. and issued year aren't stored on the student, so enter them here. Certificate no. is generated automatically."
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TextField
                  label="Marksheet no."
                  value={marksheetNo}
                  onChange={(e) => setMarksheetNo(e.target.value)}
                  placeholder="e.g. 1042"
                />
                <div className="pointer-events-none opacity-60">
                  <TextField label="Certificate no." value={certificateNo} onChange={() => {}} readOnly />
                </div>
                <TextField
                  label="Marksheet issued year"
                  value={marksheetYear}
                  onChange={(e) => setMarksheetYear(e.target.value)}
                  placeholder="2026"
                />
              </div>
            </Section>

            <SubjectsTable
              subjects={subjects}
              onChange={setSubjects}
              onAdd={() => setSubjects((prev) => [...prev, makeEmptySubject()])}
              onRemove={(id) => setSubjects((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev))}
            />

            <TotalsSummary totals={totals} />

            {detailsError && <ErrorBox>{detailsError}</ErrorBox>}

            <PrimaryButton className="w-full" onClick={handleProceedToGenerate}>
              Generate diploma
            </PrimaryButton>
          </div>
        )}

        {/* ── Generate + upload ── */}
        {step === "generate" && (
          <div className="space-y-5">
            {uploadResult ? (
              <div className="space-y-4 rounded-xl border border-green-200 bg-green-50 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800">Diploma uploaded</p>
                    <p className="mt-0.5 text-sm text-green-700">It's now stored for {student.roll_number}.</p>
                  </div>
                </div>

                <p className="break-all rounded-lg bg-white/70 px-3 py-2 font-mono text-xs text-text">
                  {BUCKET}/{uploadResult.path}
                </p>

                <div className="flex flex-col gap-2 sm:flex-row">
                  {previewUrl && (
                    <a href={previewUrl} download={fileName} className="flex-1">
                      <GhostButton className="w-full">
                        <Download className="h-4 w-4" />
                        Download PDF
                      </GhostButton>
                    </a>
                  )}
                  <PrimaryButton className="flex-1" onClick={requestClose}>
                    Done
                  </PrimaryButton>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleBackToDetails}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-primary disabled:opacity-60"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Edit details
                  </button>

                  {!generating && previewUrl && (
                    <button
                      type="button"
                      onClick={runGenerate}
                      disabled={uploading}
                      className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-primary disabled:opacity-60"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Regenerate
                    </button>
                  )}
                </div>

                <div className="overflow-hidden rounded-xl border border-border bg-backgroundAlt">
                  {generating || !previewUrl ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-24">
                      {generateError ? (
                        <p className="px-4 text-center text-sm text-red-600">{generateError}</p>
                      ) : (
                        <>
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          <p className="text-sm text-muted">Generating diploma…</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <iframe title="Diploma preview" src={previewUrl} className="h-[520px] w-full bg-white" />
                  )}
                </div>

                {generateError && !generating && (
                  <GhostButton onClick={runGenerate} className="w-full">
                    Try again
                  </GhostButton>
                )}

                {previewUrl && !generating && (
                  <a href={previewUrl} download={fileName} className="block">
                    <GhostButton className="w-full">
                      <Download className="h-4 w-4" />
                      Download PDF
                    </GhostButton>
                  </a>
                )}

                {uploadError && <ErrorBox>{uploadError}</ErrorBox>}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <GhostButton className="flex-1" onClick={requestClose} disabled={uploading}>
                    Cancel
                  </GhostButton>

                  {canOverwrite ? (
                    <PrimaryButton className="flex-1" onClick={() => handleUpload(true)} disabled={uploading}>
                      {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {uploading ? "Replacing…" : "Replace existing diploma"}
                    </PrimaryButton>
                  ) : (
                    <PrimaryButton
                      className="flex-1"
                      onClick={() => handleUpload(false)}
                      disabled={!pdfBlob || generating || uploading}
                    >
                      {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {uploading ? "Uploading…" : "Upload diploma"}
                    </PrimaryButton>
                  )}
                </div>

                <p className="text-center text-xs text-muted">
                  Saved as{" "}
                  <code className="rounded bg-backgroundAlt px-1">
                    {BUCKET}/{generatePath(student.roll_number)}
                  </code>
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}