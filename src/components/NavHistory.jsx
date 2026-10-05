import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronRight, Home, X } from "lucide-react";
import { toTitleCase } from "../utils/formatting";



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

// Must match COMPACT_MAX_WIDTH in Dock.jsx: below this the Dock collapses into a
// circle (left) and the avatar moves to the right, so this bar stops hanging
// from the Dock and attaches to the top of the page between the two instead.
const COMPACT_QUERY = "(max-width: 767px)";

// Layout maths (px)
const EDGE = 16;   // min distance from screen edges (wide screens)
const INSET = 14;  // how far the tab is narrower than the Dock on each side
const DEBUG = false; // set to true to log every layout change to the browser console
const BAR_H = 40;  // tab height under the Dock (wide screens)
const MIN_BAR_W = 260; // the bar never gets narrower than this, whatever the Dock measures
const CHROME = 168; // home + arrow + clear buttons + paddings + gaps
const ITEM_PAD = 20; // horizontal padding of one trail item
const SEP = 18; //    chevron between trail items
const DOTS = 22; //   the "…" marker

// Compact (top-of-page) layout
const CIRCLE = 44;   // size of the Dock circle / avatar on compact screens
const CIRCLE_TOP = 12; // their distance from the top and side edges
const SIDE = CIRCLE_TOP + CIRCLE + 8; // space reserved on each side for them
const CHROME_SLIM = 100; // back + forward only (very narrow phones)
const SLIM_BELOW = 280;  // below this bar width, Home and Clear are hidden

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

// Pick the real (wide) Dock: ignore the small collapsed-Dock circle if it is in the page
function pickDock(self) {
  const wide = [...document.querySelectorAll("[data-dock]")].filter(
    (el) => el.getBoundingClientRect().width > 100
  );
  return wide[0] || findDock(self);
}

const sameLayout = (a, b) =>
  a && a.avail === b.avail && a.top === b.top && a.compact === b.compact && a.chrome === b.chrome;

/* -------------------------------------------------------------------------- */
/*  Component — render ONCE inside the router, next to your <Routes>           */
/* -------------------------------------------------------------------------- */

export default function NavHistory() {
  const { pathname, search, key } = useLocation();
  const type = useNavigationType(); // "PUSH" | "POP" | "REPLACE"
  const navigate = useNavigate();
  const [nav, setNav] = useState(load);
  const [layout, setLayout] = useState(null); // { avail, top, compact, chrome }

  const barRef = useRef(null);
  const dockRef = useRef(null);
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

  /* ---- work out where the bar goes and how much room it really has ---- */
  // Instead of reacting to resize/mutation events (which miss slides, fades and
  // content that loads late, e.g. after a refresh), read the Dock's real on-screen
  // box every frame and only re-render when something actually changed.
  useLayoutEffect(() => {
    let raf = 0;
    let lastEl = null;

    function measure() {
      const vw = window.innerWidth;
      let next;

      if (window.matchMedia(COMPACT_QUERY).matches) {
        // Compact: no Dock to follow. The bar is pinned to the top of the page,
        // between the Dock circle (left) and the avatar (right).
        restW.current = Infinity;
        lastEl = null;
        const avail = Math.max(120, vw - SIDE * 2);
        next = { compact: true, avail, top: 0, chrome: avail < SLIM_BELOW ? CHROME_SLIM : CHROME };
      } else {
        // every page renders its own <Dock/>, so re-find it if it was replaced
        if (!dockRef.current || !dockRef.current.isConnected) dockRef.current = pickDock(barRef.current);
        const el = dockRef.current;
        if (el !== lastEl) {
          restW.current = Infinity; // new Dock element: start measuring again
          lastEl = el;
        }

        const r = el ? el.getBoundingClientRect() : null;
        if (!r || r.width < 1) {
          next = { compact: false, avail: Math.max(MIN_BAR_W, vw - EDGE * 2), top: EDGE, chrome: CHROME };
        } else {
          // The Dock widens while hovered, so only follow its width while the mouse is NOT over it
          if (!el.matches(":hover") || !Number.isFinite(restW.current)) restW.current = r.width;
          next = {
            compact: false,
            avail: Math.floor(Math.min(vw - EDGE * 2, Math.max(MIN_BAR_W, restW.current - INSET * 2))),
            top: Math.round(r.bottom - 1), // overlap the Dock's bottom border by 1px
            chrome: CHROME,
          };
        }
      }

      setLayout((p) => {
        if (sameLayout(p, next)) return p;
        if (DEBUG) console.log("[NavHistory] layout", next, "dock:", dockRef.current);
        return next;
      });
    }

    const loop = () => {
      if (!document.hidden) measure();
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---- how many trail items fit in the room we have ---- */
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
    let used = layout.chrome + w(index);
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

  const compact = !!layout?.compact;
  const slim = compact && layout.avail < SLIM_BELOW; // very narrow: back/forward only
  const canBack = index > 0;
  const canForward = index < stack.length - 1;
  const items = stack.slice(range.lo, range.hi + 1).map((e, n) => ({ ...e, i: range.lo + n }));
  const currentMax = layout ? Math.max(60, layout.avail - layout.chrome - ITEM_PAD) : 160;

  // keep only the page the user is on right now
  function clearHistory() {
    setNav({ stack: [{ key, pathname, path: pathname + search }], index: 0 });
  }

  const btn =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-secondary transition-colors hover:bg-primaryLight focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-35";

  // Compact: a strip hanging from the top edge, between the circle and the avatar.
  // Its top padding matches the circles' offset so all three line up in one row.
  const topGap = "max(0.75rem, env(safe-area-inset-top, 0px))";
  const barStyle = compact
    ? {
        left: `calc(${SIDE}px + env(safe-area-inset-left, 0px))`,
        right: `calc(${SIDE}px + env(safe-area-inset-right, 0px))`,
        top: 0,
        paddingTop: topGap,
        height: `calc(${topGap} + ${CIRCLE}px)`,
      }
    : {
        left: "50%",
        transform: "translateX(-50%)",
        top: layout?.top ?? 0,
        width: layout?.avail,
        height: BAR_H,
        visibility: layout ? "visible" : "hidden",
      };

  return (
    <nav
      ref={barRef}
      aria-label="Page history"
      style={{ ...barStyle, visibility: layout ? "visible" : "hidden" }}
      className={[
        "fixed z-40 flex items-center justify-between gap-1 overflow-hidden border border-t-0 border-border bg-background/80 px-2 backdrop-blur-md shadow-[0_12px_28px_-14px_rgba(17,24,39,0.25)] print:hidden",
        compact ? "rounded-b-2xl" : "rounded-b-xl",
      ].join(" ")}
    >
      {!slim && (
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
      )}
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

      {!slim && stack.length > 1 && (
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