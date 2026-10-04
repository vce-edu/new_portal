import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronRight, Home, X } from "lucide-react";
import { toTitleCase } from "../utils/formatting";

/* -------------------------------------------------------------------------- */
/*  Config — adjust to your routes                                             */
/* -------------------------------------------------------------------------- */

const LABELS = {
  "/": "Login",
  "/dashboard": "Dashboard",
  "/students": "Students",
  "/transactions": "Transactions",
  "/revenue": "Revenue",
  "/exam": "Exams",
};
const HOME = "/dashboard"; // where the Home button goes
const HIDDEN_ON = ["/"]; // login page: no history bar here
const MAX_STACK = 50; // how many visited pages we remember
const STORAGE_KEY = "nav-history-v1";

// Layout maths (px)
const EDGE = 16;   // min distance from screen edges (small screens)
const INSET = 14;  // how far the tab is narrower than the Dock on each side
const BAR_H = 40;  // tab height
const CHROME = 168; // home + arrow + clear buttons + paddings + gaps
const ITEM_PAD = 20; // horizontal padding of one trail item
const SEP = 18; //    chevron between trail items
const DOTS = 22; //   the "…" marker

const labelFor = (pathname) =>
  LABELS[pathname] ||
  toTitleCase((pathname.split("/").filter(Boolean).pop() || "Home").replace(/[-_]/g, " "));

function load() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    if (raw && Array.isArray(raw.stack) && Number.isInteger(raw.index)) return raw;
  } catch {
    /* ignore */
  }
  return { stack: [], index: -1 };
}

/* -------------------------------------------------------------------------- */
/*  Finding the Dock                                                           */
/*  Best: add data-dock to the Dock's root element. Otherwise we look for a    */
/*  fixed-position element near the top of the page (a few levels deep).       */
/* -------------------------------------------------------------------------- */

function findDock(self) {
  const tagged = document.querySelector("[data-dock]");
  if (tagged) return tagged;

  let level = [...(document.getElementById("root") || document.body).children];
  for (let depth = 0; depth < 4 && level.length; depth++) {
    const next = [];
    for (const el of level) {
      if (el === self || self?.contains(el) || el.tagName === "STYLE" || el.tagName === "SCRIPT") continue;
      if (getComputedStyle(el).position === "fixed") {
        const r = el.getBoundingClientRect();
        if (r.top < 120 && r.width > 0 && r.height > 0 && r.height < 220) return el;
      }
      next.push(...el.children);
    }
    level = next;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Component — render ONCE inside the router, next to your <Routes>           */
/* -------------------------------------------------------------------------- */

export default function NavHistory() {
  const { pathname, search, key } = useLocation();
  const type = useNavigationType(); // "PUSH" | "POP" | "REPLACE"
  const navigate = useNavigate();
  const [nav, setNav] = useState(load);
  const [layout, setLayout] = useState(null); // { avail, top }

  const barRef = useRef(null);
  const dockRef = useRef(null);
  const roRef = useRef(null);
  const canvasRef = useRef(null);
  const restW = useRef(Infinity);

  /* ---- record every move the user makes ---- */
  useEffect(() => {
    setNav((prev) => {
      // on the login page (e.g. after logging out) the history starts fresh
      if (HIDDEN_ON.includes(pathname)) return { stack: [], index: -1 };

      const { stack, index } = prev;

      // we've been on this exact history entry before (back / forward / reload)
      const found = stack.findIndex((e) => e.key === key);
      if (found >= 0) return found === index ? prev : { stack, index: found };

      const entry = { key, pathname, path: pathname + search };

      // replace(): swap the current entry instead of adding one
      if (type === "REPLACE" && index >= 0) {
        const next = [...stack];
        next[index] = entry;
        return { stack: next, index };
      }

      // normal navigation: drop any "forward" pages, then add the new one
      const next = [...stack.slice(0, index + 1), entry];
      let idx = next.length - 1;
      if (next.length > MAX_STACK) {
        next.shift();
        idx -= 1;
      }
      return { stack: next, index: idx };
    });
  }, [key, pathname, search, type]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nav));
    } catch {
      /* ignore */
    }
  }, [nav]);

  /* ---- measure the Dock and work out how much room we really have ---- */
  useLayoutEffect(() => {
    let frame = 0;

    function measure() {
      frame = 0;
      // every page renders its own <Dock/>, so re-find it if it was replaced
      if (!dockRef.current || !dockRef.current.isConnected) {
        dockRef.current = findDock(barRef.current);
        restW.current = Infinity; // new Dock element: start measuring again
        roRef.current?.disconnect();
        if (dockRef.current && roRef.current) roRef.current.observe(dockRef.current);
      }

      const vw = window.innerWidth;
      const dock = dockRef.current?.getBoundingClientRect();
      let next;

      if (!dock) {
        next = { avail: vw - EDGE * 2, top: EDGE };
      } else {
        // the Dock widens on hover, so only ever remember its smallest width
        restW.current = Math.min(restW.current, dock.width);
        next = {
          avail: Math.floor(Math.min(restW.current - INSET * 2, vw - EDGE * 2)),
          top: Math.round(dock.bottom - 1), // overlap the Dock's bottom border by 1px
        };
      }

      setLayout((p) => (p && p.avail === next.avail && p.top === next.top ? p : next));
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    roRef.current = new ResizeObserver(schedule);
    measure();

    window.addEventListener("resize", schedule);
    // Dock gets re-mounted on route change; also catches it loading late
    const mo = new MutationObserver(schedule);
    mo.observe(document.getElementById("root") || document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      mo.disconnect();
      roRef.current?.disconnect();
    };
  }, [pathname]);

  /* ---- how many trail items fit without touching the Dock ---- */
  const { stack, index } = nav;

  const textWidth = useMemo(() => {
    const ctx = (canvasRef.current ||= document.createElement("canvas")).getContext("2d");
    const family = getComputedStyle(document.body).fontFamily || "sans-serif";
    ctx.font = `500 14px ${family}`;
    return (t) => ctx.measureText(t).width;
  }, []);

  const range = useMemo(() => {
    if (index < 0 || !layout) return { lo: Math.max(index, 0), hi: Math.max(index, 0) };
    const w = (i) => textWidth(labelFor(stack[i].pathname)) + ITEM_PAD;
    const budget = layout.avail;
    const dots = (lo, hi) => ((lo > 0 ? 1 : 0) + (hi < stack.length - 1 ? 1 : 0)) * DOTS;

    let lo = index;
    let hi = index;
    let used = CHROME + w(index);
    let progressed = true;

    // grow outward from the current page, one step back then one step forward
    while (progressed) {
      progressed = false;
      for (const dir of [-1, 1]) {
        const i = dir < 0 ? lo - 1 : hi + 1;
        if (i < 0 || i >= stack.length) continue;
        const need = w(i) + SEP;
        const nlo = dir < 0 ? i : lo;
        const nhi = dir < 0 ? hi : i;
        if (used + need + dots(nlo, nhi) <= budget) {
          used += need;
          lo = nlo;
          hi = nhi;
          progressed = true;
        }
      }
    }
    return { lo, hi };
  }, [stack, index, layout, textWidth]);

  if (HIDDEN_ON.includes(pathname) || index < 0) return null;

  const canBack = index > 0;
  const canForward = index < stack.length - 1;
  const items = stack.slice(range.lo, range.hi + 1).map((e, n) => ({ ...e, i: range.lo + n }));
  const currentMax = layout ? Math.max(60, layout.avail - CHROME - ITEM_PAD) : 160;

  // keep only the page the user is on right now
  function clearHistory() {
    setNav({ stack: [{ key, pathname, path: pathname + search }], index: 0 });
  }

  const btn =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-secondary transition-colors hover:bg-primaryLight focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-35";

  return (
    <nav
      ref={barRef}
      aria-label="Page history"
      style={{
        left: "50%",
        transform: "translateX(-50%)",
        top: layout?.top ?? 0,
        width: layout?.avail,
        height: BAR_H,
        visibility: layout ? "visible" : "hidden",
      }}
      className="fixed z-40 flex items-center justify-between gap-1 overflow-hidden rounded-b-xl border border-t-0 border-border bg-background/80 px-2 backdrop-blur-md shadow-[0_12px_28px_-14px_rgba(17,24,39,0.25)] print:hidden"
    >
      <button
        type="button"
        className={btn}
        disabled={pathname === HOME}
        onClick={() => navigate(HOME)}
        aria-label="Home"
        title="Home (Dashboard)"
      >
        <Home className="h-4 w-4" strokeWidth={2} />
      </button>
      <button
        type="button"
        className={btn}
        disabled={!canBack}
        onClick={() => navigate(-1)}
        aria-label="Go back"
        title={canBack ? `Back to ${labelFor(stack[index - 1].pathname)}` : "Nothing to go back to"}
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
      </button>
      <button
        type="button"
        className={btn}
        disabled={!canForward}
        onClick={() => navigate(1)}
        aria-label="Go forward"
        title={canForward ? `Forward to ${labelFor(stack[index + 1].pathname)}` : "Nothing to go forward to"}
      >
        <ArrowRight className="h-4 w-4" strokeWidth={2} />
      </button>

      {/* the exact route the user took; pages they backed out of are dimmed */}
      <ol className="ml-1 flex min-w-0 items-center pr-2 text-sm">
        {range.lo > 0 && <li className="px-1 text-muted">…</li>}
        {items.map((e, n) => {
          const current = e.i === index;
          return (
            <li key={e.key} className="flex shrink-0 items-center">
              {n > 0 && <ChevronRight className="mx-0.5 h-3.5 w-3.5 shrink-0 text-muted/60" />}
              <button
                type="button"
                disabled={current}
                onClick={() => navigate(e.i - index)}
                aria-current={current ? "page" : undefined}
                style={current ? { maxWidth: currentMax } : undefined}
                className={[
                  "truncate whitespace-nowrap rounded-full px-2.5 py-1 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  current
                    ? "bg-primaryLight text-primary"
                    : e.i > index
                      ? "text-muted/60 hover:bg-primaryLight hover:text-secondary"
                      : "text-muted hover:bg-primaryLight hover:text-secondary",
                ].join(" ")}
              >
                {labelFor(e.pathname)}
              </button>
            </li>
          );
        })}
        {range.hi < stack.length - 1 && <li className="px-1 text-muted">…</li>}
      </ol>

      {stack.length > 1 && (
        <button
          type="button"
          className={btn}
          onClick={clearHistory}
          aria-label="Clear history"
          title="Clear history"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      )}
    </nav>
  );
}