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
  X,
  Check,
  History,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useBranchFilter } from "../context/BranchFilterContext";
import { supabase } from "../createClient";
import AddStudentModal from "./AddStudentModal.jsx";
import AddStaffModal from "./AddStaffModal.jsx";
import DeleteStaffModal from "./DeleteStaffModal.jsx";
import AddTransactionModal from "./AddTransactionModal.jsx";
import AddExpenseModal from "./AddExpenseModal.jsx";
import DeleteStudentModal from "./DeleteStudentModal.jsx";
import DeleteTransactionModal from "./DeleteTransactionModal.jsx";
import ApplicantModal from "./ApplicantModal.jsx";

// Route of the scholarship applicants page (change if yours differs)
const APPLICANTS_ROUTE = "/scholarship";

// Route of the exams page (change if yours differs)
const EXAMS_ROUTE = "/exam";

// Route of the branches page (change if yours differs)
const BRANCHES_ROUTE = "/branches";

// Fired after an applicant is added from the dock so an open applicants page can refresh
export const APPLICANTS_CHANGED_EVENT = "applicants:changed";

// Fired after a staff member is added from the dock so an open branches page can refresh
export const STAFF_CHANGED_EVENT = "staff:changed";

// Below this width the full dock no longer fits (including hover-expanded buttons),
// so it collapses into a single branch circle that opens a sidebar.
// Tweak this one number to change when the dock collapses.
const COMPACT_MAX_WIDTH = 767;
const COMPACT_QUERY = `(max-width: ${COMPACT_MAX_WIDTH}px)`;

/* -------------------------------------------------------------------------- */
/*                                    Hooks                                   */
/* -------------------------------------------------------------------------- */

function useIsCompact() {
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia(COMPACT_QUERY).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const onChange = (e) => setCompact(e.matches);
    setCompact(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return compact;
}

// Flips to true on the next frame so a freshly mounted element can transition in
function useEntered() {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return entered;
}

function toTitleCase(str) {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Shared branch logic used by both the full dock badge and the compact sidebar
function useBranchSelector() {
  const { branch } = useAuth();
  const { selectedBranch, setSelectedBranch } = useBranchFilter();
  const [options, setOptions] = useState([]);

  const isUnset = !branch;

  useEffect(() => {
    if (branch) setSelectedBranch(branch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return {
    selectedBranch,
    setSelectedBranch,
    options,
    canSwitch: isUnset,
    prefix: selectedBranch ? selectedBranch.charAt(0).toUpperCase() : "M",
    fullName: toTitleCase(selectedBranch) || "Main Branch",
  };
}

/* -------------------------------------------------------------------------- */
/*                               Full dock parts                              */
/* -------------------------------------------------------------------------- */

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

function BranchBadge({ onFocusChange }) {
  const { prefix, fullName, canSwitch, options, setSelectedBranch } = useBranchSelector();
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

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

  const expanded = hovered;

  return (
    <div ref={containerRef} className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        type="button"
        aria-label="Branch"
        onClick={() => canSwitch && setOpen((v) => !v)}
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
            {canSwitch && (
              <ChevronDown className={["h-4 w-4 shrink-0 transition-transform", open ? "rotate-180" : ""].join(" ")} />
            )}
          </>
        ) : (
          <span className="text-sm">{prefix}</span>
        )}
      </button>

      {open && canSwitch && (
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

function FullDock({ sections, utilityItems }) {
  const [dimmed, setDimmed] = useState(false);
  const entered = useEntered();

  return (
    <div
      data-dock
      className={[
        "fixed top-0 left-1/2 z-50 max-w-[calc(100vw-1rem)] -translate-x-1/2 transition-all duration-300 ease-out",
        entered ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 rounded-b-lg border border-border bg-background/80 backdrop-blur-md px-3 py-2 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_28px_-14px_rgba(17,24,39,0.25)]">
        {sections.map((s) => {
          const empty = s.items.length === 0;
          // Payments stays visible but greyed out when the role has nothing in it
          if (empty && !s.keepWhenEmpty) return null;
          return (
            <DockMenu
              key={s.key}
              icon={s.icon}
              label={s.label}
              dimmed={dimmed}
              tone={s.tone}
              items={s.items}
              disabled={empty}
            />
          );
        })}

        <Divider dimmed={dimmed} />

        <BranchBadge onFocusChange={setDimmed} />

        <Divider dimmed={dimmed} />

        {utilityItems.map((u) => (
          <DockButton key={u.text} icon={u.icon} label={u.text} dimmed={dimmed} tone={u.tone} onClick={u.onClick} />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                         Compact mode: circle + sidebar                      */
/* -------------------------------------------------------------------------- */

function SidebarRow({ icon: Icon, text, tone = "default", onClick }) {
  const danger = tone === "danger";
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        danger ? "hover:bg-red-50" : "hover:bg-primaryLight",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          danger ? "bg-red-50 text-red-500" : "bg-primaryLight text-primary",
        ].join(" ")}
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <span className={["text-sm font-medium", danger ? "text-red-500" : "text-secondary"].join(" ")}>{text}</span>
    </button>
  );
}

function CompactDock({ sections, utilityItems }) {
  const { prefix, fullName, canSwitch, options, selectedBranch, setSelectedBranch } = useBranchSelector();
  const [open, setOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const entered = useEntered();

  // Escape closes, and the page behind doesn't scroll while the sidebar is open
  useEffect(() => {
    if (!open) {
      setBranchOpen(false);
      return;
    }
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Close the sidebar first, then run the action (so modals open on a clean screen)
  const run = (fn) => () => {
    setOpen(false);
    fn?.();
  };

  const triggerVisible = entered && !open;

  return (
    <>
      {/* The collapsed dock: one circle showing the branch initial */}
      <button
        data-dock
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="dock-sidebar"
        onClick={() => setOpen(true)}
        style={{
          top: "max(0.75rem, env(safe-area-inset-top))",
          left: "max(0.75rem, env(safe-area-inset-left))",
        }}
        className={[
          "fixed z-50 flex h-11 w-11 items-center justify-center rounded-full",
          "border-2 border-primary bg-background/80 backdrop-blur-md text-primary text-base font-semibold",
          "shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_28px_-14px_rgba(17,24,39,0.35)]",
          "transition-all duration-300 ease-out active:scale-95",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          triggerVisible ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-75",
        ].join(" ")}
      >
        {prefix}
      </button>

      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={[
          "fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px] transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      />

      {/* Sidebar */}
      <aside
        id="dock-sidebar"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        aria-hidden={!open}
        className={[
          "fixed inset-y-0 left-0 z-[61] flex w-[min(20rem,86vw)] flex-col",
          "border-r border-border bg-background shadow-2xl",
          "transition-all duration-300 ease-out",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        ].join(" ")}
      >
        {/* Header: branch + close */}
        <div className="border-b border-border px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canSwitch}
              onClick={() => canSwitch && setBranchOpen((v) => !v)}
              aria-expanded={canSwitch ? branchOpen : undefined}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 text-left transition-colors enabled:hover:bg-primaryLight focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-primary text-base font-semibold text-primary">
                {prefix}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted">Branch</span>
                <span className="block truncate text-sm font-semibold text-text">{fullName}</span>
              </span>
              {canSwitch && (
                <ChevronDown
                  className={["h-4 w-4 shrink-0 text-secondary transition-transform", branchOpen ? "rotate-180" : ""].join(" ")}
                />
              )}
            </button>

            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-secondary transition-colors hover:bg-primaryLight focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>

          {/* Branch switcher (only for users without a fixed branch) */}
          {canSwitch && (
            <div
              className={[
                "grid transition-[grid-template-rows] duration-200 ease-out",
                branchOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              ].join(" ")}
            >
              <div className="overflow-hidden">
                <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border p-1">
                  {options.length === 0 && <div className="px-3 py-2 text-sm text-muted">Loading...</div>}
                  {options.map((opt) => {
                    const active = opt.branch === selectedBranch;
                    return (
                      <button
                        key={opt.branch}
                        type="button"
                        onClick={() => {
                          setSelectedBranch(opt.branch);
                          setBranchOpen(false);
                        }}
                        className={[
                          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-primaryLight",
                          active ? "bg-primaryLight font-semibold text-primary" : "text-text",
                        ].join(" ")}
                      >
                        {toTitleCase(opt.branch)}
                        {active && <Check className="h-4 w-4" strokeWidth={2.5} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sections */}
        <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-3" aria-label="Main">
          {sections.map((s) => {
            const empty = s.items.length === 0;
            if (empty && !s.keepWhenEmpty) return null;
            const SectionIcon = s.icon;
            return (
              <div key={s.key} className="mb-4 last:mb-0">
                <div className="mb-1 flex items-center gap-2 px-2 text-xs font-medium text-muted">
                  <SectionIcon className="h-3.5 w-3.5" strokeWidth={2} />
                  {s.label}
                </div>
                {empty ? (
                  <p className="px-2 py-2 text-sm text-muted">Not available for your role</p>
                ) : (
                  s.items.map((item) => (
                    <SidebarRow
                      key={item.text}
                      icon={item.icon}
                      text={item.text}
                      tone={s.tone}
                      onClick={run(item.onClick)}
                    />
                  ))
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer: utilities + log out */}
        <div className="border-t border-border px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <div className="grid grid-cols-3 gap-1">
            {utilityItems
              .filter((u) => u.tone !== "danger")
              .map(({ icon: Icon, text, onClick }) => (
                <button
                  key={text}
                  type="button"
                  onClick={run(onClick)}
                  className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-xs font-medium text-secondary transition-colors hover:bg-primaryLight focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                  {text}
                </button>
              ))}
          </div>
          <div className="mt-2 border-t border-border pt-2">
            {utilityItems
              .filter((u) => u.tone === "danger")
              .map(({ icon, text, onClick, tone }) => (
                <SidebarRow key={text} icon={icon} text={text} tone={tone} onClick={run(onClick)} />
              ))}
          </div>
        </div>
      </aside>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Dock                                    */
/* -------------------------------------------------------------------------- */

export default function Dock() {
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [showDeleteStaff, setShowDeleteStaff] = useState(false);
  const [showAddApplicant, setShowAddApplicant] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showDeleteStudent, setShowDeleteStudent] = useState(false);
  const [showDeleteTransaction, setShowDeleteTransaction] = useState(false);
  const { logout, role, roleLevel } = useAuth();
  const { setSelectedBranch } = useBranchFilter();
  const navigate = useNavigate();
  const compact = useIsCompact();

  /* ---------------------------- Role permissions ---------------------------- */
  const isOwner = roleLevel === 3;
  const isManager = roleLevel === 2;
  const isStudentMgmt = role === "student_management";
  const isFaculty = role === "teaching_faculty";
  const isMarketing = role === "marketing";

  // Same rule the applicants page uses for who can manage applicants
  const canManageApplicants = isOwner || isManager || isStudentMgmt || isMarketing;

  const can = {
    addStudent: isOwner || isManager || isStudentMgmt,
    addApplicant: canManageApplicants,
    addExam: isOwner || isManager || isFaculty,
    addStaff: isOwner || isManager,
    deleteStudent: isOwner || isManager || isStudentMgmt,
    deleteTransaction: isOwner || isManager || isStudentMgmt,
    deleteApplicant: canManageApplicants,
    deleteExam: isOwner || isManager || isFaculty,
    deleteStaff: isOwner || isManager,
    viewStudents: isOwner || isManager || isStudentMgmt || isFaculty,
    viewApplicants: canManageApplicants,
    viewExams: isOwner || isManager || isFaculty,
    viewBranches: isOwner,
    viewDashboard: true,
    payFees: isOwner || isManager || isStudentMgmt,
    viewTransactions: isOwner || isManager || isStudentMgmt,
    addExpense: isOwner,
    viewReport: isOwner || isManager,
  };

  // Keeps only the items this role may see
  const visible = (items) => items.filter((i) => i.show).map(({ show, ...item }) => item);

  const addItems = visible([
    { show: can.addStudent, icon: GraduationCap, text: "Add Student", onClick: () => setShowAddStudent(true) },
    { show: can.addApplicant, icon: UserPlus, text: "Add Applicant", onClick: () => setShowAddApplicant(true) },
    { show: can.addExam, icon: FilePlus, text: "Add Exam" }, // TODO: open your add-exam modal
    { show: can.addStaff, icon: UserCog, text: "Add Staff", onClick: () => setShowAddStaff(true) },
  ]);

  const deleteItems = visible([
    { show: can.deleteStudent, icon: UserMinus, text: "Delete Student", onClick: () => setShowDeleteStudent(true) },
    { show: can.deleteTransaction, icon: Receipt, text: "Delete Transaction", onClick: () => setShowDeleteTransaction(true) },
    { show: can.deleteApplicant, icon: Trash2, text: "Delete Applicant" }, // TODO: open your delete-applicant modal
    { show: can.deleteExam, icon: FileMinus, text: "Delete Exam" }, // TODO: open your delete-exam modal
    { show: can.deleteStaff, icon: UserX, text: "Delete Staff", onClick: () => setShowDeleteStaff(true) },
  ]);

  const viewItems = visible([
    { show: can.viewStudents, icon: GraduationCap, text: "View Students", onClick: () => navigate("/students") },
    { show: can.viewApplicants, icon: ClipboardList, text: "View Applicants", onClick: () => navigate(APPLICANTS_ROUTE) },
    { show: can.viewExams, icon: ClipboardCheck, text: "View Exams", onClick: () => navigate(EXAMS_ROUTE) },
    { show: can.viewBranches, icon: Building2, text: "View Branches", onClick: () => navigate(BRANCHES_ROUTE) },
    { show: can.viewDashboard, icon: BarChart3, text: "View Dashboard", onClick: () => navigate("/dashboard") },
  ]);

  const paymentItems = visible([
    { show: can.payFees, icon: CreditCard, text: "Pay Fees", onClick: () => setShowAddTransaction(true) },
    { show: can.viewTransactions, icon: History, text: "Transaction History", onClick: () => navigate("/transactions") },
    { show: can.addExpense, icon: TrendingDown, text: "Add Expense", onClick: () => setShowAddExpense(true) },
    { show: can.viewReport, icon: FileBarChart, text: "View Report", onClick: () => navigate("/revenue") },
  ]);

  async function handleLogout() {
    await logout();
    setSelectedBranch(null);
    navigate("/");
  }

  // One source of truth for both the full dock and the compact sidebar
  const sections = [
    { key: "add", label: "Add", icon: Plus, items: addItems },
    { key: "delete", label: "Delete", icon: Minus, tone: "danger", items: deleteItems },
    { key: "view", label: "View", icon: Eye, items: viewItems },
    { key: "payments", label: "Payments", icon: Wallet, items: paymentItems, keepWhenEmpty: true },
  ];

  const utilityItems = [
    { icon: Monitor, text: "Devices" },
    { icon: FileText, text: "Notes" },
    { icon: Bell, text: "Notifications" },
    { icon: LogOut, text: "Log out", tone: "danger", onClick: handleLogout },
  ];

  return (
    <>
      {compact ? (
        <CompactDock sections={sections} utilityItems={utilityItems} />
      ) : (
        <FullDock sections={sections} utilityItems={utilityItems} />
      )}

      {/* Modals live outside the dock wrapper so they're never affected by its positioning */}
      {showAddStudent && (
        <AddStudentModal onClose={() => setShowAddStudent(false)} onSaved={() => {}} />
      )}

      {showAddStaff && (
        <AddStaffModal
          onClose={() => setShowAddStaff(false)}
          onSaved={() => {
            setShowAddStaff(false);
            window.dispatchEvent(new Event(STAFF_CHANGED_EVENT));
          }}
        />
      )}

      {showDeleteStaff && (
        <DeleteStaffModal
          onClose={() => setShowDeleteStaff(false)}
          onDeleted={() => {
            setShowDeleteStaff(false);
            window.dispatchEvent(new Event(STAFF_CHANGED_EVENT));
          }}
        />
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
    </>
  );
}