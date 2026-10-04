import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  LayoutDashboard,
  GraduationCap,
  Receipt,
  BarChart3,
  ClipboardCheck,
  Award,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

/* -------------------------------------------------------------------------- */
/*  Config — adjust to your routes                                             */
/* -------------------------------------------------------------------------- */

const HIDDEN_ON = ["/"]; // login page: no menu here
const GAP = 8; // space between the Dock and the menu button
const BTN = 40; // button size (matches the Dock buttons)

// The Dock has data-dock on its root element
const findDock = () => document.querySelector("[data-dock]");

// Every page that can appear in the menu, in display order
const PAGES = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/students", label: "Students", icon: GraduationCap },
  { path: "/transactions", label: "Transactions", icon: Receipt },
  { path: "/revenue", label: "Revenue", icon: BarChart3 },
  { path: "/scholarship", label: "Scholarship", icon: Award },
  { path: "/exam", label: "Exams", icon: ClipboardCheck },
];

// Owner (level 3) and manager (level 2) see every page.
// For the other roles: `except` = everything but these, `only` = just these.
const ACCESS = {
  student_management: { except: ["/exam"] },
  marketing: { only: ["/dashboard", "/scholarship"] },
  teaching_faculty: { except: ["/revenue", "/scholarship"] },
};

function canSee(path, role, roleLevel) {
  if (roleLevel === 3 || roleLevel === 2) return true;
  const rule = ACCESS[role];
  if (!rule) return path === "/dashboard"; // unknown role: dashboard only
  if (rule.only) return rule.only.includes(path);
  return !rule.except.includes(path);
}

/* -------------------------------------------------------------------------- */
/*  Component — render ONCE inside the router, next to <NavHistory />          */
/*  Sits right next to the Dock. Opens on hover (and on focus/tap).          */
/* -------------------------------------------------------------------------- */

export default function NavMenu() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { role, roleLevel } = useAuth();
  const [pos, setPos] = useState(null); // { left, top } next to the Dock
  const dockRef = useRef(null);
  const roRef = useRef(null);

  // stick to the right edge of the Dock (it widens on hover, so we follow it)
  useLayoutEffect(() => {
    let frame = 0;

    function measure() {
      frame = 0;
      // every page renders its own <Dock/>, so re-find it if it was replaced
      if (!dockRef.current || !dockRef.current.isConnected) {
        dockRef.current = findDock();
        roRef.current?.disconnect();
        if (dockRef.current && roRef.current) roRef.current.observe(dockRef.current);
      }

      const dock = dockRef.current?.getBoundingClientRect();
      const vw = window.innerWidth;
      const next = dock
        ? {
            left: Math.round(Math.min(dock.right + GAP, vw - BTN - GAP)),
            top: Math.round(dock.top + (dock.height - BTN) / 2),
          }
        : { left: vw - BTN - 16, top: 12 };

      setPos((p) => (p && p.left === next.left && p.top === next.top ? p : next));
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    roRef.current = new ResizeObserver(schedule);
    measure();

    window.addEventListener("resize", schedule);
    const mo = new MutationObserver(schedule); // Dock re-mounts on route change
    mo.observe(document.getElementById("root") || document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      mo.disconnect();
      roRef.current?.disconnect();
    };
  }, [pathname]);

  // after navigating, drop focus so the menu doesn't stay open
  useEffect(() => {
    document.activeElement?.blur?.();
  }, [pathname]);

  if (HIDDEN_ON.includes(pathname)) return null;

  const items = PAGES.filter((p) => canSee(p.path, role, roleLevel));
  if (items.length === 0) return null;

  const isActive = (path) => pathname === path || pathname.startsWith(path + "/");

  return (
    <div
      className="group fixed z-50 print:hidden"
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {/* bare icon: no border, no background */}
      <button
        type="button"
        aria-label="Open menu"
        aria-haspopup="menu"
        className="flex h-10 w-10 items-center justify-center rounded-full text-secondary transition-colors hover:bg-primaryLight group-hover:bg-primaryLight focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Menu className="h-5 w-5" strokeWidth={2} />
      </button>

      {/* pt-2 keeps the hover area unbroken between the icon and the list */}
      <div
        role="menu"
        aria-label="Pages"
        className="invisible absolute left-0 top-full origin-top-left translate-y-1 scale-95 pt-2 opacity-0 transition-all duration-200 ease-out group-hover:visible group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100"
      >
        <div className="w-56 rounded-xl border border-border bg-background p-1.5 shadow-xl">
          {items.map(({ path, label, icon: Icon }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                type="button"
                role="menuitem"
                aria-current={active ? "page" : undefined}
                onClick={() => navigate(path)}
                className={[
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  active ? "bg-primaryLight" : "hover:bg-primaryLight",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    active ? "bg-primary text-background" : "bg-primaryLight text-primary",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </span>
                <span className={["text-sm font-medium", active ? "text-primary" : "text-secondary"].join(" ")}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}