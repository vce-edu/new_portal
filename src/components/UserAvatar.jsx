import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Camera, Loader2 } from "lucide-react";
import { supabase, secSupabase } from "../createClient";
import { useAuth } from "../context/AuthContext";
import { toTitleCase } from "../utils/formatting";

/* -------------------------------------------------------------------------- */
/*  Config — adjust to your app                                                */
/* -------------------------------------------------------------------------- */

const HIDDEN_ON = ["/"]; // login page: no avatar here
const GAP = 8; // space between the avatar and the Dock
const BTN = 40; // avatar size next to the full Dock (matches the Dock buttons)
const CARD_W = 320; // profile card width (w-80)

// Must match COMPACT_MAX_WIDTH in Dock.jsx: below this the Dock collapses into
// a circle on the left, so the avatar moves to the right edge of the screen.
const COMPACT_QUERY = "(max-width: 767px)";

const LEVELS = { 3: "Owner", 2: "Manager" };

// Photos go to the second ("sec") Supabase project, same as student photos.
// Create a public bucket with this name there (or point this at "student-photos").
const AVATAR_BUCKET = "staff-avatars";
const MAX_MB = 5;

// The Dock has data-dock on its root element
const findDock = () => document.querySelector("[data-dock]");

// The Dock's real visible box: its own rect plus every item inside it,
// so it is right even while buttons are mid-expansion.
function visualBox(dock) {
  const r = dock.getBoundingClientRect();
  let left = r.left;
  const row = dock.firstElementChild;
  if (row) {
    left = Math.min(left, row.getBoundingClientRect().left);
    for (const c of row.children) left = Math.min(left, c.getBoundingClientRect().left);
  }
  return { left, top: r.top, height: r.height };
}

const prettify = (s) => toTitleCase(String(s).replace(/[-_]/g, " "));

function initialsOf(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

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

/* -------------------------------------------------------------------------- */
/*  Component — render ONCE inside the router, next to <NavHistory />          */
/*  Wide screens: sits to the LEFT of the Dock and opens on hover/focus.       */
/*  Compact screens: pinned to the top-right and opens on tap.                 */
/* -------------------------------------------------------------------------- */

// onGetIdCard (optional): called when "Get ID Card" is clicked, with { user, name, email, role, branch, staffId }
export default function UserAvatar({ onGetIdCard }) {
  const { pathname } = useLocation();
  const { user, role, roleLevel, branch, staffId, avatarUrl, setAvatarUrl } = useAuth();
  const compact = useIsCompact();
  const [pos, setPos] = useState(null); // { left, top }
  const [open, setOpen] = useState(false); // tap-to-open (compact screens)
  const [imgFailed, setImgFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const wrapRef = useRef(null);
  const dockRef = useRef(null);
  const roRef = useRef(null);

  // Wide screens: stick to the left edge of the Dock (it widens on hover, so we follow it)
  useLayoutEffect(() => {
    if (compact) return; // pinned to the right edge via CSS, nothing to track

    let frame = 0;
    let observed = null; // the Dock element roRef is currently watching
    let loop = 0; // per-frame tracking while the Dock animates
    let until = 0; // keep tracking until this time (ms)

    function measure() {
      frame = 0;
      // every page renders its own <Dock/>, so re-find it if it was replaced
      if (!dockRef.current || !dockRef.current.isConnected) dockRef.current = findDock();
      // (re)attach the size observer whenever it isn't watching the current Dock
      if (dockRef.current !== observed) {
        roRef.current?.disconnect();
        if (dockRef.current) roRef.current?.observe(dockRef.current);
        observed = dockRef.current;
      }

      const dock = dockRef.current ? visualBox(dockRef.current) : null;
      const next = dock
        ? {
            left: Math.round(Math.max(GAP, dock.left - GAP - BTN)),
            top: Math.round(dock.top + (dock.height - BTN) / 2),
          }
        : { left: 16, top: 12 };

      setPos((p) => (p && p.left === next.left && p.top === next.top ? p : next));
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    roRef.current = new ResizeObserver(schedule);
    measure();

    window.addEventListener("resize", schedule);

    // While Dock buttons expand/contract, re-measure on every frame so the
    // avatar slides out of the way in step with them.
    const tick = () => {
      measure();
      loop = performance.now() < until ? requestAnimationFrame(tick) : 0;
    };
    const onDockTransition = (e) => {
      if (!dockRef.current?.contains(e.target)) return;
      until = performance.now() + 450;
      if (!loop) loop = requestAnimationFrame(tick);
    };
    const events = ["transitionrun", "transitionstart", "transitionend", "transitioncancel"];
    events.forEach((ev) => document.addEventListener(ev, onDockTransition, true));

    const mo = new MutationObserver(schedule); // Dock re-mounts on route change
    mo.observe(document.getElementById("root") || document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(loop);
      events.forEach((ev) => document.removeEventListener(ev, onDockTransition, true));
      window.removeEventListener("resize", schedule);
      mo.disconnect();
      roRef.current?.disconnect();
    };
  }, [pathname, compact]);

  // Close the tapped-open card when tapping elsewhere or pressing Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Reset the tapped-open state when the layout flips or the route changes
  useEffect(() => setOpen(false), [compact, pathname]);

  if (HIDDEN_ON.includes(pathname) || !user) return null;

  /* ---- what we know about the user ---- */
  const meta = user.user_metadata || {};
  const email = user.email || "";
  const name = meta.full_name || meta.name || (email ? prettify(email.split("@")[0]) : "User");
  const photo = !imgFailed && (avatarUrl || meta.avatar_url || meta.picture);

  // upload the chosen image, then save its public URL on the user's row
  async function handleAvatarFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be picked again
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setUploadError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setUploadError(`Image must be under ${MAX_MB} MB.`);
      return;
    }

    setUploading(true);
    setUploadError("");
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `avatars/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await secSupabase.storage.from(AVATAR_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (upErr) throw upErr;

      const { data } = secSupabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const url = data.publicUrl;

      const { error: saveErr } = await supabase.rpc("update_my_avatar", { url });
      if (saveErr) throw saveErr;

      setImgFailed(false);
      setAvatarUrl(url);
    } catch (err) {
      setUploadError(err.message || "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  const rows = [
    role && { label: "Role", value: prettify(role) },
    LEVELS[roleLevel] && { label: "Access", value: LEVELS[roleLevel] },
    branch && { label: "Branch", value: prettify(branch) },
    staffId && { label: "Staff ID", value: String(staffId) },
  ].filter(Boolean);

  const face = photo ? (
    <img
      src={photo}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      className="h-full w-full object-cover"
    />
  ) : (
    <span className="text-sm font-medium">{initialsOf(name)}</span>
  );

  // Beside the full Dock the avatar can be close to the left edge: if the card
  // would run off-screen when growing leftwards, grow rightwards instead.
  const anchorLeft = !compact && pos && pos.left + BTN < CARD_W + GAP;

  // Compact: pinned top-right, same size and top offset as the Dock's circle
  const wrapperStyle = compact
    ? {
        right: "max(0.75rem, env(safe-area-inset-right))",
        top: "max(0.75rem, env(safe-area-inset-top))",
      }
    : {
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? "visible" : "hidden",
      };

  const cardShown = "visible translate-y-0 scale-100 opacity-100";
  const cardHidden = "invisible translate-y-1 scale-95 opacity-0";
  const cardHover =
    "group-hover:visible group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100";

  return (
    <div ref={wrapRef} className="group fixed z-50 print:hidden" style={wrapperStyle}>
      <button
        type="button"
        aria-label="Your profile"
        aria-haspopup="true"
        aria-expanded={compact ? open : undefined}
        onClick={() => compact && setOpen((v) => !v)}
        className={[
          "flex items-center justify-center overflow-hidden rounded-full bg-primaryLight text-primary transition-all duration-200",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          compact
            ? "h-11 w-11 border-2 border-primary/20 shadow-[0_12px_28px_-14px_rgba(17,24,39,0.35)] active:scale-95"
            : "h-10 w-10 group-hover:ring-2 group-hover:ring-primary/30",
          compact && open ? "ring-2 ring-primary/30" : "",
        ].join(" ")}
      >
        {face}
      </button>

      {/* pt-2 keeps the hover area unbroken between the avatar and the card */}
      <div
        role="dialog"
        aria-label="Profile details"
        className={[
          "absolute top-full pt-2 transition-all duration-200 ease-out",
          anchorLeft ? "left-0 origin-top-left" : "right-0 origin-top-right",
          open ? cardShown : compact ? cardHidden : `${cardHidden} ${cardHover}`,
        ].join(" ")}
      >
        <div className="w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-background p-3 shadow-xl">
          <div className="flex items-center gap-3">
            {/* click the photo to upload a new one */}
            <label
              title="Change photo"
              className="group/pic relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-primaryLight text-primary"
            >
              {face}
              <span
                className={[
                  "absolute inset-0 flex items-center justify-center bg-secondary/55 text-background transition-opacity",
                  uploading ? "opacity-100" : "opacity-0 group-hover/pic:opacity-100",
                ].join(" ")}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={handleAvatarFile}
              />
            </label>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-secondary">{name}</p>
              <div className="mt-0.5 flex items-center gap-2">
                {email && <p className="min-w-0 flex-1 truncate text-xs text-muted">{email}</p>}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onGetIdCard?.({ user, name, email, role, branch, staffId });
                  }}
                  className="shrink-0 whitespace-nowrap rounded-full bg-primaryLight px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  Get ID Card
                </button>
              </div>
            </div>
          </div>

          {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}

          {rows.length > 0 && (
            <dl className="mt-3 space-y-1.5 border-t border-border pt-3">
              {rows.map(({ label, value }) => (
                <div key={label} className="flex items-baseline justify-between gap-4 text-sm">
                  <dt className="text-muted">{label}</dt>
                  <dd className="truncate text-right font-medium text-secondary">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}