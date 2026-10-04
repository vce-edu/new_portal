import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Search } from "lucide-react";
import Dock from "../components/Dock";
import Table from "../components/Table";
import StudentModal from "../components/StudentModal";
import AddStudentModal from "../components/AddStudentModal";
import AddTransactionModal from "../components/AddTransactionModal";
import MoveToBreakModal from "../components/MoveToBreakModal";
import BulkMoveModal from "../components/BulkMoveModal";
import Button from "../components/Button";
import SortByFilter from "../components/SortByFilter";
import { supabase } from "../createClient";
import { useBranchFilter } from "../context/BranchFilterContext";
import { useAuth } from "../context/AuthContext";
import { combineBatchTime, toTitleCase } from "../utils/formatting";

function feeStatusStyle(status) {
  if (!status) return "bg-border/40 text-muted";
  if (status.startsWith("Pending")) return "bg-[#FEF3E2] text-accent";
  if (status === "Course-Overdue") return "bg-red-50 text-red-600";
  if (status === "Up-to-Date") return "bg-green-50 text-green-600";
  return "bg-border/40 text-muted";
}

function buildColumns(canSortFees) {
  return [
    { key: "roll_number", label: "Roll Number" },
    { key: "student_name", label: "Student Name" },
    { key: "father_name", label: "Father's Name" },
    { key: "course", label: "Course" },
    {
      key: "fees_status",
      label: "Fees Status",
      sortable: canSortFees,
      render: (row) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${feeStatusStyle(
            row.fees_status
          )}`}
        >
          {row.fees_status || "—"}
        </span>
      ),
    },
    { key: "duration", label: "Duration" },
    {
      key: "fee_per_month",
      label: "Fee/mon",
      render: (row) =>
        row.fee_per_month != null ? `₹${Number(row.fee_per_month).toLocaleString("en-IN")}` : "—",
    },
    { key: "batch_time", label: "Batch Time" },
    { key: "branch", label: "Branch", render: (row) => row.branch || "—" },
    { key: "phone_number", label: "Phone Number" },
    {
      key: "admission_date",
      label: "Admission Date",
      sortable: true,
      render: (row) =>
        row.admission_date
          ? new Date(row.admission_date).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "—",
    },
  ];
}

function breakStatusStyle(status) {
  if (status === "discontinued") return "bg-red-50 text-red-600";
  return "bg-[#FEF3E2] text-accent"; // break
}

function buildBreakColumns() {
  return [
    { key: "roll_number", label: "Roll Number" },
    { key: "student_name", label: "Student Name" },
    { key: "father_name", label: "Father's Name" },
    { key: "course", label: "Course" },
    { key: "branch", label: "Branch", render: (row) => toTitleCase(row.branch) || "—" },
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${breakStatusStyle(
            row.status
          )}`}
        >
          {row.status === "discontinued" ? "Discontinued" : "On Break"}
        </span>
      ),
    },
    { key: "reason", label: "Reason", render: (row) => row.reason || "—" },
    {
      key: "break_date",
      label: "Since",
      render: (row) =>
        row.break_date
          ? new Date(row.break_date).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "—",
    },
    {
      key: "days_on_break",
      label: "Days",
      render: (row) => (row.days_on_break != null ? `${row.days_on_break}d` : "—"),
    },
  ];
}

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

const VIEW_OPTIONS = [
  { key: "live", label: "Live Students", dot: "bg-green-500" },
  { key: "break", label: "On Break", dot: "bg-accent" },
  { key: "discontinued", label: "Discontinued", dot: "bg-red-500" },
];

function StatusToggle({ view, onChange }) {
  const active = VIEW_OPTIONS.find((v) => v.key === view) || VIEW_OPTIONS[0];

  return (
    <div className="group relative inline-flex items-center gap-2">
      <span className="relative flex h-2.5 w-2.5">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full ${active.dot} opacity-75`}
        />
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${active.dot}`} />
      </span>

      <div className="invisible absolute left-0 top-full z-20 mt-2 w-44 rounded-xl border border-border bg-background p-1.5 opacity-0 shadow-xl transition-all duration-150 group-hover:visible group-hover:opacity-100">
        {VIEW_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={[
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
              opt.key === view ? "bg-primaryLight text-primary font-medium" : "text-text hover:bg-backgroundAlt",
            ].join(" ")}
          >
            <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Students() {
  const location = useLocation();
  // The list to show can arrive from another page (e.g. the dashboard's Inactive card)
  const [view, setView] = useState(() =>
    ["live", "break", "discontinued"].includes(location.state?.view) ? location.state.view : "live"
  ); // 'live' | 'break' | 'discontinued'

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(null);
  const [opening, setOpening] = useState(false); // true while fetching a break student's full record
  const [payStudent, setPayStudent] = useState(null);
  const [breakStudent, setBreakStudent] = useState(null); // student being moved to break
  const [bulkMove, setBulkMove] = useState(null); // { selected: [...], unselected: [...] }
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;
  const { selectedBranch } = useBranchFilter();
  const { role, roleLevel } = useAuth();
  const canSortFees = roleLevel >= 2 || (roleLevel === 1 && role === "student_management");
  const canMove = roleLevel > 1 || (roleLevel === 1 && role === "student_management");
  const columns = view === "live" ? buildColumns(canSortFees) : buildBreakColumns();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("admission_date");
  const [sortDir, setSortDir] = useState("desc");
  // A filter can arrive from another page (e.g. the dashboard cards) via router state
  const [filter, setFilter] = useState(() => location.state?.filter ?? null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function loadLiveStudents() {
    const { data, error } = await supabase.rpc("get_students", {
      p_branch: selectedBranch,
      p_page: page,
      p_page_size: pageSize,
      p_search: search || null,
      p_sort_by: sortKey,
      p_sort_dir: sortDir,
      p_status: "live",
      p_filter_fees_status: filter?.type === "fees_status" ? filter.value : null,
      p_filter_course: filter?.type === "course" ? filter.value : null,
      p_filter_admission:
        filter?.type === "admission_date"
          ? filter.mode === "exact"
            ? { mode: "exact", date: filter.date }
            : { mode: "range", from: filter.from, to: filter.to }
          : null,
      p_filter_batch:
        filter?.type === "batch_time"
          ? filter.mode === "exact"
            ? { mode: "exact", value: combineBatchTime(filter.from, filter.to) }
            : { mode: "range", from: filter.from, to: filter.to }
          : null,
    });
    return { data, error };
  }

  async function loadBreakStudents() {
    const { data, error } = await supabase.rpc("get_break_students", {
      p_branch: selectedBranch,
      p_page: page,
      p_page_size: pageSize,
      p_search: search || null,
      p_status: view, // 'break' | 'discontinued'
      p_active_only: true,
    });
    return { data, error };
  }

  async function loadStudents() {
    setLoading(true);
    setError("");

    const { data, error } = view === "live" ? await loadLiveStudents() : await loadBreakStudents();

    if (error) {
      setError(error.message || "Couldn't load students. Please try again.");
      setStudents([]);
      setTotalCount(0);
    } else {
      setStudents(data || []);
      setTotalCount(data?.[0]?.total_count ?? 0);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch, page, search, sortKey, sortDir, filter, view]);

  useEffect(() => {
    setPage(1);
  }, [selectedBranch, search, sortKey, sortDir, filter, view]);

  function handleSortChange(key) {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // break / discontinued rows only carry break-table fields, so when one is
  // clicked we look the student up by roll number in get_students and open
  // the modal with that full record (break info is merged in as well)
  async function handleViewBreakStudent(row) {
    if (opening) return;
    setOpening(true);

    const { data, error } = await supabase.rpc("get_students", {
      p_branch: selectedBranch,
      p_page: 1,
      p_page_size: 10,
      p_search: row.roll_number,
      p_sort_by: "admission_date",
      p_sort_dir: "desc",
      p_status: view, // 'break' | 'discontinued' — see note about get_students
      p_filter_fees_status: null,
      p_filter_course: null,
      p_filter_admission: null,
      p_filter_batch: null,
    });

    setOpening(false);

    if (error) {
      alert(error.message || "Couldn't load this student's details.");
      return;
    }

    // search is fuzzy (name / father's name too), so pick the exact roll number
    const match = (data || []).find((s) => String(s.roll_number) === String(row.roll_number));

    if (!match) {
      alert(`Couldn't find details for roll number ${row.roll_number}.`);
      return;
    }

    setViewing({ ...row, ...match });
  }

  async function handleDelete(row) {
    const confirmed = window.confirm(`Delete ${row.student_name}? This can't be undone.`);
    if (!confirmed) return;

    const { error } = await supabase.rpc("manage_student", {
      action: "delete",
      student_id: row.id,
    });

    if (error) {
      alert(error.message || "Couldn't delete this student.");
      return;
    }

    loadStudents();
  }

  async function handleBulkDelete(rows) {
    const confirmed = window.confirm(
      `Delete ${rows.length} student${rows.length === 1 ? "" : "s"}? This can't be undone.`
    );
    if (!confirmed) return;

    const results = await Promise.allSettled(
      rows.map(async (row) => {
        const { error } = await supabase.rpc("manage_student", {
          action: "delete",
          student_id: row.id,
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

    if (failed.length === 0 && page > 1 && rows.length === students.length) {
      setPage(page - 1);
    } else {
      loadStudents();
    }
  }

  function handleBulkMoved(movedCount) {
    // if every row on this page moved away, step back a page
    if (page > 1 && movedCount >= students.length) {
      setPage(page - 1);
    } else {
      loadStudents();
    }
  }

  async function handleRestore(row) {
    const confirmed = window.confirm(`Restore ${row.student_name} to the live students list?`);
    if (!confirmed) return;

    const { error } = await supabase.rpc("manage_break_student", {
      action: "restore",
      break_id: row.break_id,
    });

    if (error) {
      alert(error.message || "Couldn't restore this student.");
      return;
    }

    loadStudents();
  }

  return (
    <div className="min-h-screen bg-backgroundAlt">
      <Dock />

      <main className="pt-24 px-6 pb-12">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-2xl text-secondary">Students</h1>
                <StatusToggle view={view} onChange={setView} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {loading
                  ? "Loading records..."
                  : `${totalCount} ${view === "live" ? "student" : VIEW_OPTIONS.find((v) => v.key === view).label.toLowerCase()}${totalCount === 1 ? "" : "s"}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search roll no, name, or father's name"
                  className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-4 text-sm text-text placeholder:text-muted/60 focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              {view === "live" && <SortByFilter value={filter} onChange={setFilter} canSeeFees={canSortFees} />}
              {view === "live" && <Button onClick={() => setShowAdd(true)}>Add Student</Button>}
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          {loading ? (
            <TableSkeleton />
          ) : view === "live" ? (
            <Table
              columns={columns}
              data={students}
              emptyMessage={search ? `No students match "${search}".` : "No students enrolled yet."}
              onView={(row) => setViewing(row)}
              onPay={(row) => setPayStudent(row)}
              onMoveToBreak={canMove ? (row) => setBreakStudent(row) : undefined}
              onDelete={handleDelete}
              onBulkDelete={handleBulkDelete}
              onBulkMove={canMove ? (selected, unselected) => setBulkMove({ selected, unselected }) : undefined}
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              onPageChange={setPage}
              sortKey={sortKey}
              sortDir={sortDir}
              onSortChange={handleSortChange}
            />
          ) : (
            <Table
              columns={columns}
              data={students}
              emptyMessage={search ? `No matches for "${search}".` : `No students in this list yet.`}
              onView={handleViewBreakStudent}
              onRestore={handleRestore}
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              onPageChange={setPage}
            />
          )}
        </div>
      </main>

      {viewing && (
        <StudentModal student={viewing} onClose={() => setViewing(null)} onSaved={loadStudents} />
      )}

      {payStudent && (
        <AddTransactionModal
          lockedStudent={payStudent}
          onClose={() => setPayStudent(null)}
          onSaved={loadStudents}
        />
      )}

      {breakStudent && (
        <MoveToBreakModal
          student={breakStudent}
          onClose={() => setBreakStudent(null)}
          onSaved={loadStudents}
        />
      )}

      {bulkMove && (
        <BulkMoveModal
          selectedRows={bulkMove.selected}
          unselectedRows={bulkMove.unselected}
          onClose={() => setBulkMove(null)}
          onSaved={handleBulkMoved}
        />
      )}

      {showAdd && <AddStudentModal onClose={() => setShowAdd(false)} onSaved={loadStudents} />}
    </div>
  );
}