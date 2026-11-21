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
  ChevronDown,
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

const SUBJECT_OPTIONS = [
  "MS OFFICE 2019",
  "LIBRE OFFICE",
  "MS Word 2019",
  "MS Excel 2019",
  "MS PowerPoint 2019",
  "Photoshop",
  "CorelDRAW",
  "Tally 9",
  "Tally Prime",
  "Busy",
  "Marg",
  "Python",
  "Java",
  "C",
  "C++",
  "HTML",
  "CSS",
  "JavaScript",
  "MERN Stack",
  "MongoDB",
  "SQL",
  "Figma",
  "Canva",
  "Git and GitHub",
  "Hindi Typing",
  "English Typing",
  "LibreOffice Writer",
  "LibreOffice Calc",
  "LibreOffice Impress",
  "IOT",
  "AI",
];

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

// Type-to-filter combobox. Whatever is typed is the value, so a subject that
// isn't in SUBJECT_OPTIONS can simply be typed in. The list is rendered in a
// portal so the table's overflow-x-auto wrapper can't clip it.
function SubjectCombobox({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const text = value || "";
  const query = text.trim().toLowerCase();
  const exact = SUBJECT_OPTIONS.some((n) => n.toLowerCase() === query);
  // Show the whole list when empty or when the value is already a listed subject,
  // so the user can still switch to a different one.
  const matches =
    !query || exact
      ? SUBJECT_OPTIONS
      : SUBJECT_OPTIONS.filter((n) => n.toLowerCase().includes(query));

  function measure() {
    const r = inputRef.current?.getBoundingClientRect();
    if (!r) return;
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < 200 && r.top > spaceBelow;
    setPos({
      left: r.left,
      width: r.width,
      maxHeight: Math.max(120, Math.min(240, (up ? r.top : spaceBelow) - 12)),
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }

  useEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(name) {
    onChange(name);
    setOpen(false);
    setActive(-1);
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open) {
        e.preventDefault();
        if (active >= 0 && matches[active]) choose(matches[active]);
        else setOpen(false);
      }
    } else if (e.key === "Escape") {
      // Close just the list, not the whole modal.
      if (open) {
        e.stopPropagation();
        setOpen(false);
      }
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className={`${cellInput} pr-7`}
        value={text}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder="Type or select subject"
        aria-label="Subject name"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show subjects"
        onMouseDown={(e) => {
          e.preventDefault();
          if (open) {
            setOpen(false);
          } else {
            inputRef.current?.focus();
            setOpen(true);
          }
        }}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
      >
        <ChevronDown className="h-4 w-4" />
      </button>

      {open &&
        pos &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            // keep focus in the input while clicking or dragging the scrollbar
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: "fixed",
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: pos.maxHeight,
            }}
            className="z-[80] overflow-y-auto rounded-lg border border-border bg-background py-1 shadow-lg"
          >
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted">
                No match. “{text.trim()}” will be used as typed.
              </li>
            ) : (
              matches.map((name, i) => (
                <li
                  key={name}
                  role="option"
                  aria-selected={name === text}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(name);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={[
                    "cursor-pointer px-3 py-1.5 text-sm",
                    i === active ? "bg-primaryLight text-primary" : "text-text",
                    name === text ? "font-medium" : "",
                  ].join(" ")}
                >
                  {name}
                </li>
              ))
            )}
          </ul>,
          document.body
        )}
    </div>
  );
}

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

  const cols = "grid-cols-[1.8fr_1.6fr_0.8fr_0.9fr_32px]";

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
              <SubjectCombobox
                value={s.subject}
                onChange={(v) => update(s.id, "subject", v)}
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
  - isUpdate:   true when a diploma already exists. Skips the fee check, loads the
                details saved next to the current diploma, and overwrites it on upload.
  - onClose:    called after the exit animation
  - onUploaded: optional, called once the PDF has been stored
  - onDeleted:  optional, called once the diploma has been deleted (update mode only)
*/
export default function DiplomaModal({ student, isUpdate = false, onClose, onUploaded, onDeleted }) {
  const [step, setStep] = useState(isUpdate ? "details" : "fee");

  // Fee check
  const [feeStatus, setFeeStatus] = useState(null); // "pending" | "not-found" | "up-to-date"
  const [feeLoading, setFeeLoading] = useState(!isUpdate);

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
  const [certificateNo, setCertificateNo] = useState(generateCertificateNo);
  const [marksheetYear, setMarksheetYear] = useState(String(new Date().getFullYear()));
  const [subjects, setSubjects] = useState(() => [makeEmptySubject()]);
  const [detailsError, setDetailsError] = useState("");

  // Update mode: details saved next to the current diploma
  const [detailsLoading, setDetailsLoading] = useState(isUpdate);
  const [savedFound, setSavedFound] = useState(false);

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
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Enter / exit animation
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeTimerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const busyRef = useRef(false);
  busyRef.current = uploading || deleting;

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

  // Fee check on open (skipped when updating an existing diploma)
  useEffect(() => {
    if (isUpdate) {
      setFeeLoading(false);
      return;
    }

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

  // Update mode: load the details saved alongside the current diploma
  useEffect(() => {
    if (!isUpdate) return;
    let cancelled = false;

    (async () => {
      try {
        const path = generatePath(student.roll_number);
        const { data: blob, error } = await secSupabase.storage
          .from(BUCKET)
          .download(`${path}.json`);
        if (error) throw error;

        const saved = JSON.parse(await blob.text());
        if (cancelled) return;

        if (saved.studentName != null) setStudentName(saved.studentName);
        if (saved.fatherName != null) setFatherName(saved.fatherName);
        if (saved.motherName != null) setMotherName(saved.motherName);
        if (saved.course != null) setCourse(saved.course);
        if (saved.courseFrom != null) setCourseFrom(saved.courseFrom);
        if (saved.courseDuration != null) setCourseDuration(saved.courseDuration);
        if (saved.marksheetNo != null) setMarksheetNo(saved.marksheetNo);
        if (saved.certificateNo) setCertificateNo(saved.certificateNo);
        if (saved.marksheetYear != null) setMarksheetYear(saved.marksheetYear);
        if (Array.isArray(saved.subjects) && saved.subjects.length) {
          setSubjects(
            saved.subjects.map((s) => {
              const base = makeEmptySubject(); // fresh unique id
              return { ...base, ...s, id: base.id };
            })
          );
        }
        setSavedFound(true);
      } catch (err) {
        console.error("No saved diploma details:", err);
        if (!cancelled) setSavedFound(false);
      } finally {
        if (!cancelled) setDetailsLoading(false);
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
    setGenerateError("");
    setStep("details");
  }

  async function runGenerate() {
    setGenerating(true);
    setGenerateError("");
    setUploadError("");

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

  // Always overwrites any existing file at the same path (upsert: true).
  async function handleUpload() {
    if (!pdfBlob) return;

    setUploading(true);
    setUploadError("");

    try {
      const path = generatePath(student.roll_number);
      const file = new File([pdfBlob], `${path}.pdf`, { type: ALLOWED_MIME });

      const { error } = await secSupabase.storage.from(BUCKET).upload(path, file, {
        contentType: ALLOWED_MIME,
        upsert: true, // always overwrite the file at the same path
        cacheControl: "0", // avoid serving a stale cached copy after replacing
      });

      if (error) {
        throw new Error(error.message || "Upload failed.");
      }

      // Save the details next to the PDF so "Update Diploma" can reload them.
      // A failure here is logged but doesn't fail the upload.
      try {
        const details = {
          studentName,
          fatherName,
          motherName,
          course,
          courseFrom,
          courseDuration,
          marksheetNo,
          certificateNo,
          marksheetYear,
          subjects,
        };
        const { error: jsonError } = await secSupabase.storage
          .from(BUCKET)
          .upload(
            `${path}.json`,
            new Blob([JSON.stringify(details)], { type: "application/json" }),
            { contentType: "application/json", upsert: true, cacheControl: "0" }
          );
        if (jsonError) console.error("Couldn't save diploma details:", jsonError);
      } catch (jsonErr) {
        console.error("Couldn't save diploma details:", jsonErr);
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

  // Update mode only: removes the PDF and its saved-details JSON from the bucket.
  async function handleDelete() {
    if (deleting || uploading) return;

    const confirmed = window.confirm(
      `Delete the diploma for ${student.roll_number}? This can't be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError("");

    try {
      const path = generatePath(student.roll_number);
      const { data: removed, error } = await secSupabase.storage
        .from(BUCKET)
        .remove([path, `${path}.json`]);

      if (error) throw new Error(error.message || "Couldn't delete the diploma.");

      // Supabase returns no error when a policy blocks the delete, it just
      // returns an empty list, so check that the PDF was actually removed.
      if (!removed || !removed.some((f) => f.name === path)) {
        throw new Error(
          "The diploma wasn't deleted. Check that the bucket allows deleting, or that the file exists."
        );
      }

      await onDeleted?.();
      setStep("deleted");
    } catch (err) {
      console.error("delete diploma:", err);
      setDeleteError(err.message || "Couldn't delete the diploma. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  const show = entered && !closing;
  const fileName = `${generatePath(student.roll_number)}.pdf`;
  const actionWord = isUpdate ? "Update" : "Upload";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${actionWord} diploma`}
      className={[
        "fixed inset-0 z-[70] overflow-y-auto bg-background transition-opacity ease-out motion-reduce:transition-none",
        show ? "opacity-100 duration-300" : "opacity-0 duration-200",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={requestClose}
        disabled={uploading || deleting}
        aria-label="Close"
        className="fixed right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted transition-colors hover:bg-primaryLight hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 sm:right-5 sm:top-5"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="mx-auto w-full max-w-2xl space-y-8 px-4 pb-20 pt-14 sm:px-6">
        <header className="pr-12">
          <h2 className="font-display text-2xl text-secondary sm:text-3xl">{actionWord} diploma</h2>
          <p className="mt-1 text-muted">
            {student.student_name || "Unnamed student"} · {student.roll_number}
          </p>
        </header>

        {step !== "deleted" && <StepIndicator current={step} />}

        {/* Update mode: delete the current diploma */}
        {isUpdate && step !== "deleted" && !uploadResult && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || uploading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {deleting ? "Deleting…" : "Delete diploma"}
              </button>
            </div>
            {deleteError && <ErrorBox>{deleteError}</ErrorBox>}
          </div>
        )}

        {/* ── Deleted ── */}
        {step === "deleted" && (
          <div className="space-y-4 rounded-xl border border-green-200 bg-green-50 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Diploma deleted</p>
                <p className="mt-0.5 text-sm text-green-700">
                  The diploma for {student.roll_number} has been removed. You can upload a new one anytime.
                </p>
              </div>
            </div>
            <PrimaryButton className="w-full" onClick={requestClose}>
              Done
            </PrimaryButton>
          </div>
        )}

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

        {/* ── Details (loading saved diploma, update mode) ── */}
        {step === "details" && detailsLoading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted">Loading current diploma details…</p>
          </div>
        )}

        {/* ── Details ── */}
        {step === "details" && !detailsLoading && (
          <div className="space-y-8">
            {isUpdate && (
              <p className="rounded-lg bg-primaryLight/40 px-3 py-2 text-sm text-muted">
                {savedFound
                  ? "Loaded from the current diploma. Change what you need, then generate and upload to replace it."
                  : "No saved details were found for the current diploma, so marks need to be entered again. Uploading will replace it."}
              </p>
            )}

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
                    <p className="font-medium text-green-800">
                      {isUpdate ? "Diploma updated" : "Diploma uploaded"}
                    </p>
                    <p className="mt-0.5 text-sm text-green-700">
                      {isUpdate
                        ? `The previous diploma for ${student.roll_number} has been replaced.`
                        : `It's now stored for ${student.roll_number}.`}
                    </p>
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

                  <PrimaryButton
                    className="flex-1"
                    onClick={handleUpload}
                    disabled={!pdfBlob || generating || uploading}
                  >
                    {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {uploading
                      ? isUpdate
                        ? "Updating…"
                        : "Uploading…"
                      : isUpdate
                      ? "Update diploma"
                      : "Upload diploma"}
                  </PrimaryButton>
                </div>

                <p className="text-center text-xs text-muted">
                  Saved as{" "}
                  <code className="rounded bg-backgroundAlt px-1">
                    {BUCKET}/{generatePath(student.roll_number)}
                  </code>
                  {isUpdate && " (replaces the current diploma)"}
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