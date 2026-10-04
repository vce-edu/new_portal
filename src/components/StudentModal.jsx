import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Image as ImageIcon,
  Pencil,
  Loader2,
  Receipt,
  Plus,
  Trash2,
  UploadCloud,
  Wallet,
} from "lucide-react";
import { TextField, Select } from "./Input.jsx";
import AddTransactionModal from "./AddTransactionModal.jsx";
import DiplomaModal from "./DiplomaModal.jsx";
import { supabase, secSupabase } from "../createClient";
import { useAuth } from "../context/AuthContext";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";
import {
  toTitleCase,
  formatBatchTime,
  formatRollNumber,
  combineBatchTime,
  splitBatchTime,
  feeStatusStyle,
} from "../utils/formatting";

// Bucket lives in the second ("sec") Supabase account/project, accessed via secSupabase.
const PHOTO_BUCKET = "student-photos";

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

const REQUIRED_KEYS = new Set(["roll_number", "student_name"]);

const TABS = [
  { id: "personal", label: "Personal information" },
  { id: "transactions", label: "Transaction history" },
];

const EXIT_MS = 220;

function useEntered() {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    let id2;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, []);
  return entered;
}

function Reveal({ show, delay = 0, className = "", children }) {
  return (
    <div
      className={[
        "transition-all ease-out motion-reduce:transition-none",
        show ? "duration-500 opacity-100 translate-y-0" : "duration-200 opacity-0 translate-y-4",
        className,
      ].join(" ")}
      style={{ transitionDelay: show ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

function FadeIn({ className = "", children, ...rest }) {
  const entered = useEntered();
  return (
    <div
      {...rest}
      className={[
        "transition-all duration-300 ease-out motion-reduce:transition-none",
        entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function displayValue(key, data) {
  const value = data?.[key];
  if (key === "fee_per_month" && value != null && value !== "") {
    return `₹${Number(value).toLocaleString("en-IN")}`;
  }
  if (key === "branch") return toTitleCase(value) || "—";
  return value || "—";
}

/*
  Centered label + value pair.
  - sm and up: label and value sit side by side. Label is right-aligned in a
    fixed-width column and value is left-aligned in another, so every row lines
    up on the same center axis while the whole pair stays centered.
  - Below sm (phones): the pair stacks (label above value), both centered, so
    long values like addresses have the full width to wrap.
  - Horizontal padding keeps text clear of the absolutely-positioned pencil.
*/
function FieldRow({ label, value, editable, onEdit }) {
  return (
    <div className="group relative px-10 py-4 sm:px-14">
      <div className="flex flex-col items-center gap-0.5 text-center sm:flex-row sm:items-baseline sm:justify-center sm:gap-4 sm:text-left">
        <p className="text-base text-muted sm:w-40 sm:shrink-0 sm:text-right sm:text-lg">{label}</p>
        <p className="min-w-0 break-words text-lg text-text sm:w-64 sm:text-xl">{value}</p>
      </div>

      {editable && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${label}`}
          className={[
            "absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 shrink-0 items-center justify-center rounded-full text-muted transition-all",
            "hover:bg-primaryLight hover:text-primary",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
          ].join(" ")}
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/*
  Round icon button that expands into a pill showing its full name on
  hover / keyboard focus. Touch devices can't hover, so there the label
  is always visible.
*/
function ActionButton({ icon: Icon, label, onClick, loading = false, disabled = false, danger = false }) {
  const expanded = "max-w-[9rem] opacity-100";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        "group flex h-10 items-center rounded-full border border-border bg-background px-[9px] text-muted transition-colors duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "disabled:cursor-not-allowed disabled:opacity-60",
        danger
          ? "hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:text-red-600"
          : "hover:border-primary/30 hover:bg-primaryLight hover:text-primary focus-visible:text-primary",
      ].join(" ")}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
      ) : (
        <Icon className="h-5 w-5 shrink-0" />
      )}

      <span
        className={[
          "overflow-hidden transition-all duration-300 ease-out motion-reduce:transition-none",
          loading ? expanded : "max-w-0 opacity-0",
          "group-hover:max-w-[9rem] group-hover:opacity-100",
          "group-focus-visible:max-w-[9rem] group-focus-visible:opacity-100",
          "[@media(hover:none)]:max-w-[9rem] [@media(hover:none)]:opacity-100",
        ].join(" ")}
      >
        <span className="block whitespace-nowrap pl-2 text-sm font-medium">{label}</span>
      </span>
    </button>
  );
}

export default function StudentModal({ student, onClose, onSaved }) {
  const { branch: ownBranch } = useAuth();
  const canChooseBranch = !ownBranch;

  const [data, setData] = useState(() => ({ ...student }));
  const dataRef = useRef(data);
  dataRef.current = data;

  const [tab, setTab] = useState("personal");

  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState({});
  const [rowError, setRowError] = useState("");
  const [saving, setSaving] = useState(false);

  const [branchOptions, setBranchOptions] = useState([]);

  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState("");
  const [txLoaded, setTxLoaded] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  // True from the moment "Add Transaction" is clicked until the transaction modal is closed.
  const [leavingForTx, setLeavingForTx] = useState(false);

  const [photoPreview, setPhotoPreview] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");

  const [showDiploma, setShowDiploma] = useState(false);
  // True from the moment "Upload Diploma" is clicked until the diploma modal is closed.
  const [leavingForDiploma, setLeavingForDiploma] = useState(false);

  const [deleting, setDeleting] = useState(false);

  const entered = useEntered();
  const [closing, setClosing] = useState(false);
  const show = entered && !closing && !leavingForTx && !leavingForDiploma;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeTimerRef = useRef(null);
  const closingRef = useRef(false);

  function requestClose() {
    if (closingRef.current) return;
    closingRef.current = true;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      onCloseRef.current();
      return;
    }

    setClosing(true);
    closeTimerRef.current = setTimeout(() => onCloseRef.current(), EXIT_MS);
  }

  const addTxTimerRef = useRef(null);
  const txFlowRef = useRef(false);
  txFlowRef.current = leavingForTx || showAddTx;

  const diplomaTimerRef = useRef(null);
  const diplomaFlowRef = useRef(false);
  diplomaFlowRef.current = leavingForDiploma || showDiploma;

  useEffect(
    () => () => {
      clearTimeout(closeTimerRef.current);
      clearTimeout(addTxTimerRef.current);
      clearTimeout(diplomaTimerRef.current);
    },
    []
  );

  // Fade this modal out first, then open the transaction modal on its own.
  function openAddTransaction() {
    if (txFlowRef.current) return;
    setLeavingForTx(true);

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Switch tabs while the profile is fully faded out, so the swap isn't visible.
    addTxTimerRef.current = setTimeout(
      () => {
        setTab("transactions");
        setShowAddTx(true);
      },
      reduceMotion ? 0 : EXIT_MS
    );
  }

  // Bring the profile back (on the Transaction history tab) once the transaction modal closes.
  function closeAddTransaction() {
    setShowAddTx(false);
    setLeavingForTx(false);
  }

  // Fade this modal out first, then open the diploma modal on its own.
  function openUploadDiploma() {
    if (diplomaFlowRef.current) return;
    setLeavingForDiploma(true);

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    diplomaTimerRef.current = setTimeout(
      () => setShowDiploma(true),
      reduceMotion ? 0 : EXIT_MS
    );
  }

  // Bring the profile back once the diploma modal closes.
  function closeDiploma() {
    setShowDiploma(false);
    setLeavingForDiploma(false);
  }

  async function handleDiplomaUploaded() {
    const result = await persist({
      diploma_uploaded: true,
    });

    if (!result.ok) {
      throw new Error(result.message);
    }
  }

  const editingRef = useRef(null);
  editingRef.current = editingKey;
  useCloseOnEscape(() => {
    if (txFlowRef.current || diplomaFlowRef.current) return;
    if (editingRef.current) {
      setEditingKey(null);
      setRowError("");
    } else {
      requestClose();
    }
  });

  const tabRefs = useRef({});
  const [indicator, setIndicator] = useState(null);

  useEffect(() => {
    function measure() {
      const el = tabRefs.current[tab];
      if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    }
    measure();
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure);
    return () => window.removeEventListener("resize", measure);
  }, [tab]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (canChooseBranch) {
      supabase.rpc("get_branches").then(({ data, error }) => {
        if (!error && data) setBranchOptions(data);
      });
    }
  }, [canChooseBranch]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTransactions() {
    setTxLoading(true);
    setTxError("");

    const { data: rows, error } = await supabase.rpc("get_transactions", {
      p_roll_number: data.roll_number,
      p_page: 1,
      p_page_size: 100,
      p_sort_by: "paid_on",
      p_sort_dir: "desc",
    });

    setTxLoading(false);

    if (error) {
      setTxError(error.message || "Couldn't load transactions.");
      setTransactions([]);
      return;
    }

    setTransactions(rows || []);
  }

  useEffect(() => {
    if (tab === "transactions" && !txLoaded) {
      setTxLoaded(true);
      loadTransactions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleDeleteTransaction(row) {
    const confirmed = window.confirm(`Delete receipt ${row.receipt_no}? This can't be undone.`);
    if (!confirmed) return;

    const { error } = await supabase.rpc("manage_transaction", {
      action: "delete",
      transaction_id: row.transaction_id,
    });

    if (error) {
      alert(error.message || "Couldn't delete this transaction.");
      return;
    }

    loadTransactions();
  }

  function buildPayload(source) {
    const payload = Object.fromEntries(FIELDS.map((f) => [f.key, source[f.key] ?? ""]));
    payload.photo_url = source.photo_url ?? "";
    payload.diploma_url = source.diploma_url ?? "";
    payload.diploma_uploaded = source.diploma_uploaded ?? false;
    return payload;
  }

  async function persist(changes) {
    setSaving(true);

    const payload = { ...buildPayload(dataRef.current), ...changes };
    const { error } = await supabase.rpc("manage_student", {
      action: "update",
      student_id: student.id,
      payload,
    });

    setSaving(false);

    if (error) {
      return { ok: false, message: error.message || "Couldn't save changes." };
    }

    setData((prev) => ({ ...prev, ...changes }));
    onSaved?.();
    return { ok: true };
  }

  function startEdit(key) {
    setRowError("");
    if (key === "batch_time") {
      const { from, to } = splitBatchTime(data.batch_time);
      setDraft({ from, to });
    } else {
      setDraft({ value: data[key] ?? "" });
    }
    setEditingKey(key);
  }

  function cancelEdit() {
    setEditingKey(null);
    setRowError("");
  }

  async function handleSaveField(e, field) {
    e.preventDefault();
    setRowError("");

    let changes;
    if (field.key === "batch_time") {
      changes = {
        batch_time: combineBatchTime(formatBatchTime(draft.from), formatBatchTime(draft.to)),
      };
    } else {
      let value = draft.value;
      if (field.key === "roll_number") value = formatRollNumber(value, data.branch);
      if (REQUIRED_KEYS.has(field.key) && !String(value).trim()) {
        setRowError(`${field.label} can't be empty.`);
        return;
      }
      changes = { [field.key]: value };
    }

    const result = await persist(changes);
    if (!result.ok) {
      setRowError(result.message);
      return;
    }
    setEditingKey(null);
  }

  function handlePhotoChange(file) {
    if (!file) return;

    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoUploading(true);
    setPhotoError("");

    uploadPhoto(file);
  }

  async function uploadPhoto(file) {
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await secSupabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/jpeg",
      });

    if (uploadError) {
      setPhotoUploading(false);
      setPhotoError(uploadError.message);
      return;
    }

    const { data: urlData } = secSupabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);

    const result = await persist({ photo_url: urlData.publicUrl });
    setPhotoUploading(false);

    if (!result.ok) {
      setPhotoError(result.message);
    }
  }

  async function handleDeleteRecord() {
    const name = data.student_name || "this student";
    const confirmed = window.confirm(`Delete ${name}'s record? This can't be undone.`);
    if (!confirmed) return;

    setDeleting(true);

    const { error } = await supabase.rpc("manage_student", {
      action: "delete",
      student_id: student.id,
    });

    setDeleting(false);

    if (error) {
      alert(error.message || "Couldn't delete this record.");
      return;
    }

    onSaved?.();
    requestClose();
  }

  function renderEditor(field) {
    if (field.key === "batch_time") {
      return (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <TextField
            label="From"
            value={draft.from ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            onBlur={() => setDraft((d) => ({ ...d, from: formatBatchTime(d.from) }))}
            placeholder="e.g. 9 or 5"
            autoFocus
          />
          <TextField
            label="To"
            value={draft.to ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            onBlur={() => setDraft((d) => ({ ...d, to: formatBatchTime(d.to) }))}
            placeholder="e.g. 11 or 7"
          />
        </div>
      );
    }

    if (field.key === "branch") {
      return (
        <Select
          label="Branch"
          value={draft.value ?? ""}
          onChange={(e) => setDraft({ value: e.target.value })}
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
      );
    }

    return (
      <TextField
        label={field.label}
        type={field.type || "text"}
        value={draft.value ?? ""}
        onChange={(e) => setDraft({ value: e.target.value })}
        onBlur={
          field.key === "roll_number"
            ? () => setDraft((d) => ({ value: formatRollNumber(d.value, data.branch) }))
            : undefined
        }
        autoFocus
      />
    );
  }

  const photoSrc = photoPreview || data.photo_url;

  const studentView = createPortal(
    <div
      className={[
        "fixed inset-0 z-[60] overflow-y-auto bg-background transition-opacity ease-out motion-reduce:transition-none",
        show ? "duration-300 opacity-100" : "duration-200 opacity-0",
        showAddTx || showDiploma ? "invisible pointer-events-none" : "",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={requestClose}
        aria-label="Close"
        className="fixed right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted transition-colors hover:bg-primaryLight hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:right-5 sm:top-5"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 pb-20 pt-14 sm:px-6">
        <Reveal show={show} delay={60} className="flex flex-col items-center">
          <div className="group relative">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-primaryLight/40 sm:h-36 sm:w-36">
              {photoSrc ? (
                <img
                  src={photoSrc}
                  alt={data.student_name || "Student"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon className="h-10 w-10 text-muted" />
              )}

              {photoUploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
            </div>

            <label
              className={[
                "absolute bottom-1 right-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-muted shadow-md transition-all",
                "hover:bg-primaryLight hover:text-primary focus-within:ring-2 focus-within:ring-primary/40",
                "opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100",
                photoUploading ? "pointer-events-none" : "",
              ].join(" ")}
            >
              <Pencil className="h-4 w-4" />
              <span className="sr-only">{data.photo_url ? "Replace photo" : "Upload photo"}</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={photoUploading}
                onChange={(e) => {
                  handlePhotoChange(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {photoError && <p className="mt-2 text-xs text-red-600">{photoError}</p>}
        </Reveal>

        <Reveal show={show} delay={140} className="flex max-w-full flex-col items-center">
          <h1 className="mt-5 break-words text-center font-display text-2xl text-secondary sm:text-3xl">
            {data.student_name || "Unnamed student"}
          </h1>
          <p className="mt-1 text-muted">{data.roll_number || "No roll number"}</p>
        </Reveal>

        <Reveal show={show} delay={180} className="mt-5 flex max-w-full flex-col items-center">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <ActionButton
              icon={UploadCloud}
              label={data.diploma_uploaded ? "Diploma Uploaded" : "Upload Diploma"}
              onClick={openUploadDiploma}
              disabled={data.diploma_uploaded === true}
            />
            <ActionButton icon={Wallet} label="Pay Fees" onClick={openAddTransaction} />
            <ActionButton
              icon={Trash2}
              label="Delete Record"
              danger
              loading={deleting}
              onClick={handleDeleteRecord}
            />
          </div>
        </Reveal>

        <Reveal show={show} delay={220} className="mt-8 w-full sm:mt-10">
          <div
            role="tablist"
            aria-label="Student profile"
            className="relative flex w-full flex-wrap justify-center gap-x-6 border-b border-border sm:gap-x-14"
          >
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[t.id] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={active}
                  aria-controls={`panel-${t.id}`}
                  onClick={() => setTab(t.id)}
                  className={[
                    "pb-4 font-display text-base transition-colors duration-200 focus:outline-none focus-visible:text-primary sm:text-xl",
                    active ? "text-primary" : "text-muted hover:text-secondary",
                  ].join(" ")}
                >
                  {t.label}
                </button>
              );
            })}

            {indicator && (
              <span
                aria-hidden="true"
                className="absolute -bottom-px h-0.5 rounded-full bg-primary transition-all duration-300 ease-out motion-reduce:transition-none"
                style={{ left: indicator.left, width: indicator.width }}
              />
            )}
          </div>
        </Reveal>

        <Reveal show={show} delay={300} className="w-full">
          {tab === "personal" && (
            <FadeIn key="personal" role="tabpanel" id="panel-personal" aria-labelledby="tab-personal">
              {FIELDS.map((f) => {
                if (editingKey === f.key) {
                  return (
                    <form
                      key={f.key}
                      onSubmit={(e) => handleSaveField(e, f)}
                      className="py-4"
                    >
                      <div className="mx-auto w-full max-w-md space-y-3">
                        {renderEditor(f)}

                        {rowError && (
                          <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-center text-sm text-red-600">
                            {rowError}
                          </div>
                        )}

                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                          >
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={saving}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-primaryLight hover:text-primary disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </form>
                  );
                }

                const editable = f.key !== "branch" || canChooseBranch;

                return (
                  <FieldRow
                    key={f.key}
                    label={f.label}
                    value={displayValue(f.key, data)}
                    editable={editable}
                    onEdit={() => startEdit(f.key)}
                  />
                );
              })}
            </FadeIn>
          )}

          {tab === "transactions" && (
            <FadeIn
              key="transactions"
              role="tabpanel"
              id="panel-transactions"
              aria-labelledby="tab-transactions"
            >
              {/* Fee summary. Total Course / Expected So Far / Status come from
                  get_students() (data). Total Paid / Total Remain are computed
                  live from the transactions just fetched below, so they stay
                  accurate immediately after adding or deleting a payment
                  rather than waiting on a stale server snapshot. */}
              {(() => {
                const totalCourse = data.total_course_amount;
                const totalExpected = data.total_expected_amount;
                const totalPaid = transactions.reduce(
                  (sum, t) => sum + (Number(t.amount_paid) || 0),
                  0
                );
                const totalRemain =
                  totalCourse != null ? Math.max(totalCourse - totalPaid, 0) : null;

                const money = (v) => (v != null ? `₹${Number(v).toLocaleString("en-IN")}` : "—");

                const stats = [
                  { label: "Total Course Fees", value: money(totalCourse) },
                  { label: "Expected So Far", value: money(totalExpected) },
                  { label: "Total Paid", value: money(totalPaid) },
                  { label: "Total Remain", value: money(totalRemain) },
                ];

                return (
                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 border-b border-border pb-6 sm:grid-cols-5 sm:gap-x-6">
                    {stats.map((s) => (
                      <div key={s.label} className="min-w-0">
                        <p className="text-xs text-muted">{s.label}</p>
                        <p className="mt-1 truncate text-lg font-medium text-secondary">{s.value}</p>
                      </div>
                    ))}
                    <div className="min-w-0">
                      <p className="text-xs text-muted">Fees Status</p>
                      <span
                        className={`mt-1 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${feeStatusStyle(
                          data.fees_status
                        )}`}
                      >
                        {data.fees_status || "—"}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center justify-between gap-3 py-4">
                <h3 className="font-display text-base text-secondary">Payments</h3>
                <button
                  type="button"
                  onClick={openAddTransaction}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primaryDark"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
                  Add Transaction
                </button>
              </div>

              {txError && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                  {txError}
                </div>
              )}

              {txLoading ? (
                <div className="space-y-3 py-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-lg bg-backgroundAlt" />
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primaryLight text-primary">
                    <Receipt className="h-5 w-5" />
                  </span>
                  <p className="mt-4 font-display text-lg text-secondary">No payments yet</p>
                  <p className="mt-1 text-sm text-muted">
                    Payments recorded for this student will show up here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {transactions.map((t) => (
                    <div
                      key={t.transaction_id}
                      className="group flex items-center justify-between gap-4 py-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text">{t.receipt_no}</p>
                        <p className="text-xs text-muted">
                          {t.paid_on
                            ? new Date(t.paid_on).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                          {t.payee ? ` · Paid by ${t.payee}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <p className="font-medium text-secondary">
                          {t.amount_paid != null
                            ? `₹${Number(t.amount_paid).toLocaleString("en-IN")}`
                            : "—"}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleDeleteTransaction(t)}
                          aria-label="Delete transaction"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-red-500 opacity-0 transition-all hover:bg-red-50 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </FadeIn>
          )}
        </Reveal>
      </div>

    </div>,
    document.body
  );

  return (
    <>
      {studentView}

      {showAddTx &&
        createPortal(
          <AddTransactionModal
            lockedStudent={{
              roll_number: data.roll_number,
              student_name: data.student_name,
              father_name: data.father_name,
              branch: data.branch,
              fee_per_month: data.fee_per_month,
            }}
            onClose={closeAddTransaction}
            onSaved={loadTransactions}
          />,
          document.body
        )}

      {showDiploma && (
        <DiplomaModal
          student={data}
          onClose={closeDiploma}
          onUploaded={handleDiplomaUploaded}
        />
      )}
    </>
  );
}