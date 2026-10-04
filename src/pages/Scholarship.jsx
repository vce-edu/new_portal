import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { generateAdmitCardPDF } from "../utils/generateAdmitCard";
import { generateResultPDF, hasValidScore } from "../utils/generateResultCard";
import { printPDF } from "../utils/printPDF";
import Dock from "../components/Dock";
import Table from "../components/Table";
import Button from "../components/Button";
import ApplicantModal from "../components/ApplicantModal";
import PrintChoiceModal from "../components/PrintChoiceModal";
import TransferToStudentModal from "../components/TransferToStudentModal";
import { supabase } from "../createClient";
import { useBranchFilter } from "../context/BranchFilterContext";
import { useAuth } from "../context/AuthContext";

function formatDate(d) {
  return d
    ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
}

function formatTime(t) {
  if (!t) return "—";
  const [h, m] = String(t).split(":");
  const hour = parseInt(h, 10);
  return `${String(hour % 12 || 12).padStart(2, "0")}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

function Pill({ yes, yesLabel, noLabel }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        yes ? "bg-green-50 text-green-600" : "bg-border/40 text-muted"
      }`}
    >
      {yes ? yesLabel : noLabel}
    </span>
  );
}

const baseColumns = [
  { key: "roll_number", label: "Roll Number", sortable: true },
  { key: "student_name", label: "Student Name" },
  { key: "father_name", label: "Father's Name" },
  { key: "gender", label: "Gender" },
  { key: "mobile_number", label: "Mobile" },
  { key: "exam_branch", label: "Exam Branch" },
  { key: "staff_id", label: "Staff ID", render: (row) => row.staff_id || "—" },
  { key: "exam_date", label: "Exam Date", sortable: true, render: (row) => formatDate(row.exam_date) },
  { key: "exam_time", label: "Exam Time", sortable: true, render: (row) => formatTime(row.exam_time) },
  {
    key: "exam_score",
    label: "Score",
    sortable: true,
    render: (row) => (row.exam_score != null ? Number(row.exam_score).toFixed(2) : "—"),
  },
  {
    key: "present",
    label: "Present",
    render: (row) => <Pill yes={row.present} yesLabel="Present" noLabel="Absent" />,
  },
  {
    key: "confirmed",
    label: "Confirmed",
    render: (row) => <Pill yes={row.confirmed} yesLabel="Confirmed" noLabel="Pending" />,
  },
  {
    key: "admitcard_fetched",
    label: "Admit Card",
    render: (row) => <Pill yes={row.admitcard_fetched} yesLabel="Printed" noLabel="Not printed" />,
  },
  { key: "created_at", label: "Applied On", sortable: true, render: (row) => formatDate(row.created_at) },
];

function TableSkeleton() {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-background">
      <div className="border-b border-border bg-backgroundAlt px-4 py-3">
        <div className="h-3 w-24 rounded bg-border/60 animate-pulse" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-4">
            <div className="h-3 w-16 rounded bg-border/50 animate-pulse" />
            <div className="h-3 w-32 rounded bg-border/50 animate-pulse" />
            <div className="h-3 w-24 rounded bg-border/50 animate-pulse" />
            <div className="h-3 w-20 rounded bg-border/50 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Inline score entry: saves when the cursor leaves the box (or on Enter)
function ScoreCell({ row, canEdit, onSave }) {
  const initial = row.exam_score != null ? String(row.exam_score) : "";
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => setValue(initial), [initial]);

  if (!canEdit) return row.exam_score != null ? Number(row.exam_score).toFixed(2) : "—";

  async function commit() {
    const trimmed = value.trim();
    const same =
      (trimmed === "" && initial === "") ||
      (trimmed !== "" && initial !== "" && Number(trimmed) === Number(initial));
    if (same) return;

    if (trimmed !== "" && (isNaN(Number(trimmed)) || Number(trimmed) < 0 || Number(trimmed) > 999.99)) {
      alert("Score must be a number between 0 and 999.99.");
      setValue(initial);
      return;
    }

    setSaving(true);
    const ok = await onSave(row, trimmed === "" ? null : trimmed);
    setSaving(false);
    if (!ok) setValue(initial);
  }

  return (
    <input
      type="number"
      step="0.01"
      min="0"
      value={value}
      placeholder="_____"
      disabled={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      onWheel={(e) => e.currentTarget.blur()}
      onClick={(e) => e.stopPropagation()}
      className="w-24 border-0 border-b border-muted/50 bg-transparent px-1 py-0.5 text-sm text-text placeholder:text-muted/60 focus:border-primary focus:outline-none disabled:opacity-50"
    />
  );
}

const selectCls =
  "rounded-full border border-border bg-background px-3 py-2 text-sm text-text focus:outline-none focus:border-primary transition-colors";

// "" = any, "true"/"false" = filter
const toBool = (v) => (v === "" ? null : v === "true");

// Remembers the chosen print action between visits. "" = ask every time.
const PRINT_ACTION_KEY = "scholarship_print_action";

function loadPrintAction() {
  try {
    const saved = localStorage.getItem(PRINT_ACTION_KEY);
    return saved === "admit" || saved === "result" ? saved : "";
  } catch {
    return "";
  }
}

export default function ScholarshipApplicants() {
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [printingId, setPrintingId] = useState(null);
  const [printTarget, setPrintTarget] = useState(null);
  // the applicant being copied into the students table (null = modal closed)
  const [transferTarget, setTransferTarget] = useState(null);
  // "" = show the choice modal, "admit" / "result" = print that straight away
  const [printAction, setPrintAction] = useState(loadPrintAction);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;

  const { selectedBranch } = useBranchFilter();
  const { role, roleLevel } = useAuth();
  const canManage =
    roleLevel >= 2 || (roleLevel === 1 && ["student_management", "marketing"].includes(role));

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [present, setPresent] = useState("");
  const [confirmed, setConfirmed] = useState("");
  const [admitcard, setAdmitcard] = useState(""); // "" = any, "true" = printed, "false" = not printed
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function loadApplicants() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase.rpc("get_scholarship_applicants", {
      p_branch: selectedBranch,
      p_page: page,
      p_page_size: pageSize,
      p_search: search || null,
      p_sort_by: sortKey,
      p_sort_dir: sortDir,
      p_filter_staff_id: null,
      p_filter_present: toBool(present),
      p_filter_confirmed: toBool(confirmed),
      p_filter_admitcard: toBool(admitcard),
      p_filter_exam_date:
        dateFrom && dateTo
          ? dateFrom === dateTo
            ? { mode: "exact", date: dateFrom }
            : { mode: "range", from: dateFrom, to: dateTo }
          : null,
    });

    if (error) {
      setError(error.message || "Couldn't load applicants. Please try again.");
      setApplicants([]);
      setTotalCount(0);
    } else {
      setApplicants(data || []);
      setTotalCount(data?.[0]?.total_count ?? 0);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadApplicants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch, page, search, sortKey, sortDir, present, confirmed, admitcard, dateFrom, dateTo]);

  useEffect(() => {
    setPage(1);
  }, [selectedBranch, search, sortKey, sortDir, present, confirmed, admitcard, dateFrom, dateTo]);

  function handlePrintActionChange(value) {
    setPrintAction(value);
    try {
      if (value) localStorage.setItem(PRINT_ACTION_KEY, value);
      else localStorage.removeItem(PRINT_ACTION_KEY);
    } catch {
      // storage unavailable, the choice just won't persist
    }
  }

  // Print button in the table: go straight to the chosen action,
  // or open the choice modal if none is set.
  function handlePrintClick(row) {
    if (printAction) handlePrint(row, printAction);
    else setPrintTarget(row);
  }

  function handleSortChange(key) {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // Update one row in place so the table doesn't reload (keeps scroll/focus)
  function patchApplicant(rollNumber, patch) {
    setApplicants((prev) => prev.map((a) => (a.roll_number === rollNumber ? { ...a, ...patch } : a)));
    // keep the open print chooser in sync (e.g. a score saved while it's open)
    setPrintTarget((prev) => (prev && prev.roll_number === rollNumber ? { ...prev, ...patch } : prev));
  }

  async function handleTogglePresent(row) {
    const next = !row.present;
    const { error } = await supabase.rpc("manage_scholarship_applicant", {
      action: "update",
      p_roll_number: row.roll_number,
      payload: { present: next },
    });
    if (error) {
      alert(error.message || "Couldn't update attendance.");
      return;
    }
    patchApplicant(row.roll_number, { present: next });
  }

  async function handleSaveScore(row, score) {
    const { data, error } = await supabase.rpc("manage_scholarship_applicant", {
      action: "update",
      p_roll_number: row.roll_number,
      payload: { exam_score: score },
    });
    if (error) {
      alert(error.message || "Couldn't save the score.");
      return false;
    }
    patchApplicant(row.roll_number, { exam_score: data?.exam_score ?? score });
    return true;
  }

  const columns = baseColumns.map((col) =>
    col.key === "exam_score"
      ? { ...col, render: (row) => <ScoreCell row={row} canEdit={canManage} onSave={handleSaveScore} /> }
      : col
  );

  // get_branches returns every branch for owners and only the caller's own
  // for everyone else, so match on the applicant's exam branch to get the
  // exam centre address. A failure here shouldn't block the PDF.
  async function getBranchAddress(row) {
    try {
      const { data: branches } = await supabase.rpc("get_branches");
      const key = (row.exam_branch || "").trim().toLowerCase();
      const match = (branches || []).find((b) => (b.branch || "").trim().toLowerCase() === key);
      return match?.address || "";
    } catch (err) {
      console.error("get_branches:", err);
      return "";
    }
  }

  // type: "admit" | "result". Only the admit card flags the applicant as admitcard_fetched.
  // The generators return a PDF Blob; we open the browser's print preview with it.
  async function handlePrint(row, type) {
    if (printingId) return;

    if (type === "result" && !hasValidScore(row)) {
      alert(`${row.student_name} has no score yet, so a result card can't be printed.`);
      return;
    }

    setPrintingId(row.roll_number);

    try {
      const branchAddress = await getBranchAddress(row);
      const blob =
        type === "result"
          ? await generateResultPDF(row, { branchAddress })
          : await generateAdmitCardPDF(row, { branchAddress });
      await printPDF(blob);
    } catch (err) {
      console.error(err);
      alert(`Couldn't generate the ${type === "result" ? "result" : "admit card"}. Please try again.`);
      setPrintingId(null);
      return;
    }

    if (type === "admit" && !row.admitcard_fetched) {
      const { error } = await supabase.rpc("manage_scholarship_applicant", {
        action: "update",
        p_roll_number: row.roll_number,
        payload: { admitcard_fetched: true },
      });
      if (error) {
        alert(`Admit card sent to print, but it couldn't be marked as printed: ${error.message}`);
      } else {
        patchApplicant(row.roll_number, { admitcard_fetched: true });
      }
    }

    setPrintingId(null);
    setPrintTarget(null);
  }

  async function handleDelete(row) {
    if (!window.confirm(`Delete ${row.student_name}? This can't be undone.`)) return;

    const { error } = await supabase.rpc("manage_scholarship_applicant", {
      action: "delete",
      p_roll_number: row.roll_number,
    });

    if (error) {
      alert(error.message || "Couldn't delete this applicant.");
      return;
    }
    loadApplicants();
  }

  async function handleBulkDelete(rows) {
    if (
      !window.confirm(`Delete ${rows.length} applicant${rows.length === 1 ? "" : "s"}? This can't be undone.`)
    )
      return;

    const results = await Promise.allSettled(
      rows.map(async (row) => {
        const { error } = await supabase.rpc("manage_scholarship_applicant", {
          action: "delete",
          p_roll_number: row.roll_number,
        });
        if (error) throw new Error(`${row.student_name}: ${error.message}`);
      })
    );

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      alert(
        `Deleted ${rows.length - failed.length} of ${rows.length}. Couldn't delete:\n` +
          failed.map((r) => r.reason.message).join("\n")
      );
    }

    if (failed.length === 0 && page > 1 && rows.length === applicants.length) {
      setPage(page - 1);
    } else {
      loadApplicants();
    }
  }

  return (
    <div className="min-h-screen bg-backgroundAlt">
      <Dock />

      <main className="pt-24 px-6 pb-12">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-2xl text-secondary">Scholarship Applicants</h1>
              <p className="mt-1 text-sm text-muted">
                {loading ? "Loading records..." : `${totalCount} applicant${totalCount === 1 ? "" : "s"}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search roll no, name, father or mobile"
                  className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-4 text-sm text-text placeholder:text-muted/60 focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              {canManage && <Button onClick={() => setShowAdd(true)}>Add Applicant</Button>}
            </div>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-3">
            <select className={selectCls} value={admitcard} onChange={(e) => setAdmitcard(e.target.value)}>
              <option value="">Any admit card</option>
              <option value="true">Printed</option>
              <option value="false">Not printed</option>
            </select>
            <select className={selectCls} value={present} onChange={(e) => setPresent(e.target.value)}>
              <option value="">Any attendance</option>
              <option value="true">Present</option>
              <option value="false">Absent</option>
            </select>
            <select className={selectCls} value={confirmed} onChange={(e) => setConfirmed(e.target.value)}>
              <option value="">Any status</option>
              <option value="true">Confirmed</option>
              <option value="false">Pending</option>
            </select>
            <div className="flex items-center gap-2 text-sm text-muted">
              Exam date
              <input type="date" className={selectCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              to
              <input type="date" className={selectCls} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            {canManage && (
              <div className="flex items-center gap-2 text-sm text-muted sm:ml-auto">
                Print action
                <select
                  className={selectCls}
                  value={printAction}
                  onChange={(e) => handlePrintActionChange(e.target.value)}
                >
                  <option value="">Ask every time</option>
                  <option value="admit">Admit card</option>
                  <option value="result">Result card</option>
                </select>
              </div>
            )}
            {(admitcard || present || confirmed || dateFrom || dateTo) && (
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => {
                  setAdmitcard("");
                  setPresent("");
                  setConfirmed("");
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                Clear filters
              </button>
            )}
          </div>

          {error && (
            <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          {loading ? (
            <TableSkeleton />
          ) : (
            <Table
              columns={columns}
              data={applicants}
              emptyMessage={search ? `No applicants match "${search}".` : "No applicants yet."}
              onView={(row) => setViewing(row)}
              renderRowActions={
                canManage
                  ? (row) => <ScoreCell row={row} canEdit onSave={handleSaveScore} />
                  : undefined
              }
              onTogglePresent={canManage ? handleTogglePresent : undefined}
              onPrint={canManage ? handlePrintClick : undefined}
              onTransfer={canManage ? (row) => setTransferTarget(row) : undefined}
              onDelete={canManage ? handleDelete : undefined}
              onBulkDelete={canManage ? handleBulkDelete : undefined}
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              onPageChange={setPage}
              sortKey={sortKey}
              sortDir={sortDir}
              onSortChange={handleSortChange}
            />
          )}
        </div>
      </main>

      {viewing && (
        <ApplicantModal
          applicant={viewing}
          canEdit={canManage}
          onClose={() => setViewing(null)}
          onSaved={loadApplicants}
        />
      )}

      {showAdd && <ApplicantModal onClose={() => setShowAdd(false)} onSaved={loadApplicants} />}

      {printTarget && (
        <PrintChoiceModal
          row={printTarget}
          busy={Boolean(printingId)}
          onChoose={(type) => handlePrint(printTarget, type)}
          onClose={() => setPrintTarget(null)}
        />
      )}

      {transferTarget && (
        <TransferToStudentModal
          applicant={transferTarget}
          onClose={() => setTransferTarget(null)}
          onDone={(studentRoll) =>
            alert(`${transferTarget.student_name} was added to students with roll number ${studentRoll}.`)
          }
        />
      )}
    </div>
  );
}