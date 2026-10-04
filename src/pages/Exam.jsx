import { useEffect, useRef, useState } from "react";
import { Search, ChevronDown } from "lucide-react";
import Dock from "../components/Dock";
import Table from "../components/Table";
import ExamModal from "../components/ExamModal";
import AddExamModal from "../components/AddExamModal";
import ExamQuestionsModal from "../components/ExamQuestionsModal";
import ExamResultsModal from "../components/ExamResultsModal";
import Button from "../components/Button";
import { supabase } from "../createClient";
import { useBranchFilter } from "../context/BranchFilterContext";
import { useAuth } from "../context/AuthContext";
import { toTitleCase } from "../utils/formatting";

const columns = [
  { key: "exam_id", label: "Exam ID" },
  { key: "branch", label: "Branch", render: (row) => toTitleCase(row.branch) || "—" },
  { key: "duration_mins", label: "Duration", render: (row) => (row.duration_mins != null ? `${row.duration_mins} min` : "—") },
  { key: "total_score", label: "Total Score" },
  { key: "total_questions", label: "Questions" },
  {
    key: "restricted",
    label: "Restricted",
    render: (row) => (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
          row.restricted ? "bg-[#FEF3E2] text-accent" : "bg-green-50 text-green-600"
        }`}
      >
        {row.restricted ? "Restricted" : "Open"}
      </span>
    ),
  },
  {
    key: "operational_time",
    label: "Opens At",
    render: (row) =>
      row.operational_time
        ? new Date(row.operational_time).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—",
  },
  { key: "created_by_name", label: "Created By", render: (row) => row.created_by_name || "—" },
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
            <div className="h-3 w-24 rounded bg-border/50 animate-pulse" />
            <div className="h-3 w-20 rounded bg-border/50 animate-pulse" />
            <div className="h-3 w-16 rounded bg-border/50 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoMenu({ onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-sm text-muted transition-colors hover:border-primary hover:text-primary"
      >
        Info
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-lg border border-border bg-background py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSelect("results");
            }}
            className="block w-full px-4 py-2 text-left text-sm text-text transition-colors hover:bg-backgroundAlt"
          >
            See results
          </button>
        </div>
      )}
    </div>
  );
}

export default function Exams() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { mode: 'view' | 'edit', exam }
  const [showAdd, setShowAdd] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [questionsExam, setQuestionsExam] = useState(null); // exam whose questions are being managed
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;
  const { selectedBranch } = useBranchFilter();
  const { role } = useAuth();
  const canCreate = role !== "marketing";
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function loadExams() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase.rpc("get_exams", {
      p_branch: selectedBranch,
      p_page: page,
      p_page_size: pageSize,
      p_search: search || null,
    });

    if (error) {
      setError(error.message || "Couldn't load exams. Please try again.");
      setExams([]);
      setTotalCount(0);
    } else {
      setExams(data || []);
      setTotalCount(data?.[0]?.total_count ?? 0);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadExams();
  }, [selectedBranch, page, search]);

  useEffect(() => {
    setPage(1);
  }, [selectedBranch, search]);

  async function handleDelete(row) {
    const confirmed = window.confirm(`Delete exam "${row.exam_id}"? This can't be undone.`);
    if (!confirmed) return;

    const { error } = await supabase.rpc("manage_exam", {
      action: "delete",
      exam_id: row.exam_id,
    });

    if (error) {
      alert(error.message || "Couldn't delete this exam.");
      return;
    }

    loadExams();
  }

  return (
    <div className="min-h-screen bg-backgroundAlt">
      <Dock />

      <main className="pt-24 px-6 pb-12">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-2xl text-secondary">Exams</h1>
                <InfoMenu onSelect={(item) => item === "results" && setShowResults(true)} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {loading ? "Loading records..." : `${totalCount} exam${totalCount === 1 ? "" : "s"}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search exam ID"
                  className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-4 text-sm text-text placeholder:text-muted/60 focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              {canCreate && <Button onClick={() => setShowAdd(true)}>Create Exam</Button>}
            </div>
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
              data={exams}
              emptyMessage={search ? `No exams match "${search}".` : "No exams created yet."}
              onView={(row) => setQuestionsExam(row)}
              onEdit={canCreate ? (row) => setModal({ mode: "edit", exam: row }) : undefined}
              onDelete={canCreate ? handleDelete : undefined}
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              onPageChange={setPage}
            />
          )}
        </div>
      </main>

      {modal && (
        <ExamModal mode={modal.mode} exam={modal.exam} onClose={() => setModal(null)} onSaved={loadExams} />
      )}

      {showAdd && <AddExamModal onClose={() => setShowAdd(false)} onSaved={loadExams} />}

      {showResults && <ExamResultsModal branch={selectedBranch} onClose={() => setShowResults(false)} />}

      {questionsExam && (
        <ExamQuestionsModal
          exam={questionsExam}
          readOnly={!canCreate}
          onClose={() => setQuestionsExam(null)}
          onChanged={loadExams}
        />
      )}
    </div>
  );
}