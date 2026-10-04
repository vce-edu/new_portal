import { useState, useEffect, useRef } from "react";
import Revenue from '../pages/Revenue.jsx';
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Minus,
  Monitor,
  Bell,
  Wallet,
  FileText,
  Eye,
  LogOut,
  ChevronDown,
  GraduationCap,
  UserCog,
  UserMinus,
  UserX,
  UserPlus,
  ClipboardList,
  ClipboardCheck,
  Receipt,
  Building2,
  BarChart3,
  CreditCard,
  TrendingDown,
  FileBarChart,
  FilePlus,
  FileMinus,
  Trash2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useBranchFilter } from "../context/BranchFilterContext";
import { supabase } from "../createClient";
import AddStudentModal from "./AddStudentModal.jsx";
import AddTransactionModal from "./AddTransactionModal.jsx";
import AddExpenseModal from "./AddExpenseModal.jsx";
import DeleteStudentModal from "./DeleteStudentModal.jsx";
import DeleteTransactionModal from "./DeleteTransactionModal.jsx";
import ApplicantModal from "./ApplicantModal.jsx";

// Route of the scholarship applicants page (change if yours differs)
const APPLICANTS_ROUTE = "/scholarship";

// Route of the exams page (change if yours differs)
const EXAMS_ROUTE = "/exam";

// Fired after an applicant is added from the dock so an open applicants page can refresh
export const APPLICANTS_CHANGED_EVENT = "applicants:changed";

function DockButton({ icon: Icon, label, dimmed = false, disabled = false, tone = "default", onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={disabled ? "Not available for your role" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={[
        "group relative flex h-10 w-10 items-center justify-center gap-0 overflow-hidden rounded-full px-0",
        disabled
          ? "cursor-not-allowed text-secondary opacity-40"
          : "transition-all duration-200 hover:w-40 hover:justify-start hover:gap-2 hover:px-4",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        disabled
          ? ""
          : tone === "danger"
          ? "text-red-500 bg-red-50 hover:bg-red-100"
          : "text-secondary hover:bg-primaryLight",
        dimmed ? "blur-[2px] opacity-40 scale-95 pointer-events-none" : "",
      ].join(" ")}
    >
      <Icon className="h-[15px] w-[18px] shrink-0" strokeWidth={2} />
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium opacity-0 transition-all duration-200 group-hover:max-w-[7rem] group-hover:opacity-100">
        {label}
      </span>
    </button>
  );
}

function Divider({ dimmed = false }) {
  return (
    <div
      className={["mx-1 h-6 w-px bg-border transition-all duration-200", dimmed ? "opacity-40" : ""].join(" ")}
      aria-hidden="true"
    />
  );
}

function DockMenu({ icon, label, dimmed, items, tone = "default", disabled = false }) {
  // Whole menu is unavailable for this role: show a greyed-out button, no dropdown
  if (disabled) {
    return <DockButton icon={icon} label={label} dimmed={dimmed} tone={tone} disabled />;
  }

  return (
    <div className="relative group">
      <DockButton icon={icon} label={label} dimmed={dimmed} tone={tone} />

      <div className="absolute top-full left-1/2 -translate-x-1/2 pt-3 opacity-0 invisible translate-y-1 scale-95 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:scale-100 transition-all duration-200 ease-out origin-top z-20">
        <div className="absolute -top-[5px] left-1/2 -translate-x-1/2 h-2.5 w-2.5 rotate-45 bg-background border-l border-t border-border" />

        <div className="w-52 rounded-xl border border-border bg-background shadow-xl p-1.5">
          {items.map(({ icon: Icon, text, onClick }) => (
            <button
              key={text}
              type="button"
              onClick={onClick}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-primaryLight"
            >
              <span
                className={[
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  tone === "danger" ? "bg-red-50 text-red-500" : "bg-primaryLight text-primary",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>
              <span className="text-sm font-medium text-secondary">{text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function toTitleCase(str) {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function BranchBadge({ onFocusChange }) {
  const { branch } = useAuth();
  const { selectedBranch, setSelectedBranch } = useBranchFilter();
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const containerRef = useRef(null);

  const isUnset = !branch;
  const canExpand = isUnset;

  useEffect(() => {
    if (branch) setSelectedBranch(branch);
  }, [branch]);

  useEffect(() => {
    if (isUnset) {
      supabase.rpc("get_branches").then(({ data, error }) => {
        if (!error && data) {
          setOptions(data);
          if (!selectedBranch && data.length > 0) {
            const mainMatch = data.find((b) => b.branch?.toLowerCase() === "main");
            setSelectedBranch(mainMatch ? mainMatch.branch : data[0].branch);
          }
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnset]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleEnter() {
    setHovered(true);
    onFocusChange(true);
  }

  function handleLeave() {
    if (!open) {
      setHovered(false);
      onFocusChange(false);
    }
  }

  const prefix = selectedBranch ? selectedBranch.charAt(0).toUpperCase() : "M";
  const fullName = toTitleCase(selectedBranch) || "Main Branch";
  const expanded = hovered;

  return (
    <div ref={containerRef} className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        type="button"
        aria-label="Branch"
        onClick={() => canExpand && setOpen((v) => !v)}
        className={[
          "relative z-10 flex items-center bg-background text-primary border-2 border-primary font-medium overflow-hidden",
          "transition-all duration-200",
          hovered ? "scale-110 shadow-lg" : "",
          expanded
            ? "h-10 w-36 rounded-full px-4 gap-2 justify-between"
            : "h-10 w-10 rounded-full justify-center",
        ].join(" ")}
      >
        {expanded ? (
          <>
            <span className="text-sm truncate">{fullName}</span>
            {canExpand && (
              <ChevronDown className={["h-4 w-4 shrink-0 transition-transform", open ? "rotate-180" : ""].join(" ")} />
            )}
          </>
        ) : (
          <span className="text-sm">{prefix}</span>
        )}
      </button>

      {open && canExpand && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-40 rounded-lg border-2 border-primary bg-background shadow-lg overflow-hidden z-20">
          {options.length === 0 && <div className="px-3 py-2 text-sm text-muted">Loading...</div>}
          {options.map((opt) => (
            <button
              key={opt.branch}
              type="button"
              onClick={() => {
                setSelectedBranch(opt.branch);
                setOpen(false);
                setHovered(false);
                onFocusChange(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-text hover:bg-primaryLight transition-colors"
            >
              {toTitleCase(opt.branch)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dock() {
  const [dimmed, setDimmed] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showAddApplicant, setShowAddApplicant] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showDeleteStudent, setShowDeleteStudent] = useState(false);
  const [showDeleteTransaction, setShowDeleteTransaction] = useState(false);
  const { logout, role, roleLevel } = useAuth();
  const { setSelectedBranch } = useBranchFilter();
  const navigate = useNavigate();

  /* ---------------------------- Role permissions ---------------------------- */
  const isOwner = roleLevel === 3;
  const isManager = roleLevel === 2;
  const isStudentMgmt = role === "student_management";
  const isFaculty = role === "teaching_faculty";
  const isMarketing = role === "marketing";

  // Same rule the applicants page uses for who can manage applicants
  const canManageApplicants = isOwner || isManager || isStudentMgmt || isMarketing;

  const can = {
    // Add
    addStudent: isOwner || isManager || isStudentMgmt,
    addApplicant: canManageApplicants,
    addExam: isOwner || isManager || isFaculty,
    addStaff: isOwner || isManager,
    // Delete
    deleteStudent: isOwner || isManager || isStudentMgmt,
    deleteTransaction: isOwner || isManager || isStudentMgmt,
    deleteApplicant: canManageApplicants,
    deleteExam: isOwner || isManager || isFaculty,
    deleteStaff: isOwner || isManager,
    // View
    viewStudents: isOwner || isManager || isStudentMgmt || isFaculty,
    viewApplicants: canManageApplicants,
    viewExams: isOwner || isManager || isFaculty,
    viewBranches: isOwner,
    viewDashboard: true,
    // Payments
    payFees: isOwner || isManager || isStudentMgmt,
    addExpense: isOwner,
    viewReport: isOwner || isManager,
  };

  // Keeps only the items this role may see
  const visible = (items) => items.filter((i) => i.show).map(({ show, ...item }) => item);

  const addItems = visible([
    { show: can.addStudent, icon: GraduationCap, text: "Add Student", onClick: () => setShowAddStudent(true) },
    { show: can.addApplicant, icon: UserPlus, text: "Add Applicant", onClick: () => setShowAddApplicant(true) },
    { show: can.addExam, icon: FilePlus, text: "Add Exam" }, // TODO: open your add-exam modal
    { show: can.addStaff, icon: UserCog, text: "Add Staff" },
  ]);

  const deleteItems = visible([
    { show: can.deleteStudent, icon: UserMinus, text: "Delete Student", onClick: () => setShowDeleteStudent(true) },
    { show: can.deleteTransaction, icon: Receipt, text: "Delete Transaction", onClick: () => setShowDeleteTransaction(true) },
    { show: can.deleteApplicant, icon: Trash2, text: "Delete Applicant" }, // TODO: open your delete-applicant modal
    { show: can.deleteExam, icon: FileMinus, text: "Delete Exam" }, // TODO: open your delete-exam modal
    { show: can.deleteStaff, icon: UserX, text: "Delete Staff" },
  ]);

  const viewItems = visible([
    { show: can.viewStudents, icon: GraduationCap, text: "View Students", onClick: () => navigate("/students") },
    { show: can.viewApplicants, icon: ClipboardList, text: "View Applicants", onClick: () => navigate(APPLICANTS_ROUTE) },
    { show: can.viewExams, icon: ClipboardCheck, text: "View Exams", onClick: () => navigate(EXAMS_ROUTE) },
    { show: can.viewBranches, icon: Building2, text: "View Branches" },
    { show: can.viewDashboard, icon: BarChart3, text: "View Dashboard", onClick: () => navigate("/dashboard") },
  ]);

  const paymentItems = visible([
    { show: can.payFees, icon: CreditCard, text: "Pay Fees", onClick: () => setShowAddTransaction(true) },
    { show: can.addExpense, icon: TrendingDown, text: "Add Expense", onClick: () => setShowAddExpense(true) },
    { show: can.viewReport, icon: FileBarChart, text: "View Report", onClick: () => navigate("/revenue") },
  ]);

  async function handleLogout() {
    await logout();
    setSelectedBranch(null);
    navigate("/");
  }

  return (
    <div data-dock className="fixed top-0 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 rounded-b-lg border border-border bg-background/80 backdrop-blur-md px-3 py-2 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_28px_-14px_rgba(17,24,39,0.25)]">
        {addItems.length > 0 && <DockMenu icon={Plus} label="Add" dimmed={dimmed} items={addItems} />}

        {deleteItems.length > 0 && (
          <DockMenu icon={Minus} label="Delete" dimmed={dimmed} tone="danger" items={deleteItems} />
        )}

        {viewItems.length > 0 && <DockMenu icon={Eye} label="View" dimmed={dimmed} items={viewItems} />}

        {/* Payments stays visible but greyed out when the role has nothing in it */}
        <DockMenu
          icon={Wallet}
          label="Payments"
          dimmed={dimmed}
          items={paymentItems}
          disabled={paymentItems.length === 0}
        />

        <Divider dimmed={dimmed} />

        <BranchBadge onFocusChange={setDimmed} />

        <Divider dimmed={dimmed} />

        <DockButton icon={Monitor} label="Devices" dimmed={dimmed} />
        <DockButton icon={FileText} label="Notes" dimmed={dimmed} />
        <DockButton icon={Bell} label="Notifications" dimmed={dimmed} />
        <DockButton icon={LogOut} label="Log out" dimmed={dimmed} tone="danger" onClick={handleLogout} />
      </div>

      {showAddStudent && (
        <AddStudentModal onClose={() => setShowAddStudent(false)} onSaved={() => {}} />
      )}

      {showAddApplicant && (
        <ApplicantModal
          onClose={() => setShowAddApplicant(false)}
          onSaved={() => window.dispatchEvent(new Event(APPLICANTS_CHANGED_EVENT))}
        />
      )}

      {showAddTransaction && (
        <AddTransactionModal onClose={() => setShowAddTransaction(false)} onSaved={() => {}} />
      )}

      {showAddExpense && (
        <AddExpenseModal onClose={() => setShowAddExpense(false)} onSaved={() => {}} />
      )}

      {showDeleteStudent && (
        <DeleteStudentModal onClose={() => setShowDeleteStudent(false)} onDeleted={() => {}} />
      )}

      {showDeleteTransaction && (
        <DeleteTransactionModal onClose={() => setShowDeleteTransaction(false)} onDeleted={() => {}} />
      )}
    </div>
  );
}