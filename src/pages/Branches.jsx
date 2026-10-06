import { useEffect, useState } from "react";
import { Users, UserX, Wallet, UserCog, Trash2 } from "lucide-react";
import Dock from "../components/Dock";
import Button from "../components/Button";
import { supabase } from "../createClient";
import AddStaffModal from "../components/AddStaffModal";
import DeleteStaffModal from "../components/DeleteStaffModal";
import { toTitleCase } from "../utils/formatting";

const fmtINR = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const fmtNum = (n) => Number(n || 0).toLocaleString("en-IN");
const toISO = (d) => d.toLocaleDateString("en-CA"); // local YYYY-MM-DD

const fmtDay = (d, withYear) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", ...(withYear ? { year: "numeric" } : {}) });

const rangeLabel = (from, to) =>
  from && to ? `${fmtDay(from)} – ${fmtDay(to, true)}` : from ? `From ${fmtDay(from, true)}` : to ? `Until ${fmtDay(to, true)}` : "All time";

/* ------------------------------- UI pieces -------------------------------- */

const TONES = {
  green: "bg-emerald-50 text-emerald-600",
  red: "bg-red-50 text-red-500",
  indigo: "bg-indigo-50 text-indigo-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
};

function Kpi({ icon: Icon, label, value, tone, footnote }) {
  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-full ${TONES[tone]}`}>
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl text-secondary">{value}</p>
      {footnote && <p className="mt-2 text-xs text-muted">{footnote}</p>}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-10">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-4">
          <div className="h-6 w-48 animate-pulse rounded bg-border/60" />
          <div className="h-4 w-72 animate-pulse rounded bg-border/50" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="h-28 animate-pulse rounded-xl border border-border bg-background" />
            ))}
          </div>
          <div className="h-48 animate-pulse rounded-xl border border-border bg-background" />
        </div>
      ))}
    </div>
  );
}

function DateRange({ value, onChange }) {
  const today = new Date();
  const presets = [
    { label: "This month", from: toISO(new Date(today.getFullYear(), today.getMonth(), 1)), to: toISO(today) },
    { label: "Last 30 days", from: toISO(new Date(today.getTime() - 29 * 86400000)), to: toISO(today) },
    { label: "This year", from: toISO(new Date(today.getFullYear(), 0, 1)), to: toISO(today) },
    { label: "All time", from: "", to: "" },
  ];
  const active = (p) => p.from === value.from && p.to === value.to;
  const input =
    "rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-muted">
        From
        <input
          type="date"
          className={input}
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted">
        To
        <input
          type="date"
          className={input}
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange({ from: p.from, to: p.to })}
            className={`rounded-full border px-3 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              active(p) ? "border-primary/40 bg-primaryLight text-secondary" : "border-border text-muted hover:text-secondary"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Avatar({ name, url }) {
  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return url ? (
    <img src={url} alt="" className="h-8 w-8 rounded-full border border-border object-cover" />
  ) : (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primaryLight text-xs font-medium text-primary">
      {initials}
    </span>
  );
}

// Staff table, styled like the Students table
function StaffTable({ staff, canDelete, onDelete }) {
  if (!staff.length) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border bg-background text-sm text-muted">
        No staff are attached to this branch yet.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border bg-background">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border bg-backgroundAlt text-xs text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Staff ID</th>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="w-14 px-4 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {staff.map((s) => (
            <tr key={s.id} className="group transition-colors hover:bg-backgroundAlt/60">
              <td className="px-4 py-3 text-muted">{s.staff_id || "—"}</td>
              <td className="px-4 py-3">
                <span className="flex items-center gap-3 text-secondary">
                  <Avatar name={s.display_name} url={s.avatar_url} />
                  {s.display_name ? toTitleCase(s.display_name) : "—"}
                </span>
              </td>
              <td className="px-4 py-3 text-text">{s.email || "—"}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded-full bg-primaryLight px-2.5 py-1 text-xs font-medium text-primary">
                  {s.role ? toTitleCase(s.role.replace(/_/g, " ")) : "—"}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                {canDelete(s) && (
                  <button
                    type="button"
                    onClick={() => onDelete(s)}
                    aria-label={`Delete ${s.display_name || "staff member"}`}
                    title="Delete staff"
                    className="rounded-full p-1.5 text-red-500 opacity-0 transition-opacity hover:bg-red-50 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-300 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BranchSection({ b, periodText, onAddStaff, canDelete, onDeleteStaff }) {
  const staff = Array.isArray(b.staff) ? b.staff : [];
  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl text-secondary">{toTitleCase(b.branch_name)}</h2>
          <p className="mt-1 text-sm text-muted">{b.branch_address || "No address added"}</p>
        </div>
        <Button onClick={() => onAddStaff(b)}>Add staff</Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Users} tone="green" label="Live students" value={fmtNum(b.live_students)} />
        <Kpi
          icon={UserX}
          tone="red"
          label="Break / discontinued"
          value={fmtNum(b.inactive_students)}
          footnote={`${fmtNum(b.break_students)} on break · ${fmtNum(b.discontinued_students)} discontinued`}
        />
        <Kpi icon={Wallet} tone="indigo" label="Revenue" value={fmtINR(b.revenue)} footnote={periodText} />
        <Kpi icon={UserCog} tone="sky" label="Staff" value={fmtNum(staff.length)} />
      </div>

      <div className="mt-4">
        <StaffTable staff={staff} canDelete={canDelete} onDelete={(s) => onDeleteStaff({ ...s, branch: b.branch_name })} />
      </div>
    </section>
  );
}

/* --------------------------------- Page ----------------------------------- */

export default function Branches() {
  const now = new Date();
  const [range, setRange] = useState({ from: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: toISO(now) });
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addTo, setAddTo] = useState(null); // branch row the Add staff dialog is open for
  const [deleting, setDeleting] = useState(null); // staff row the Delete dialog is open for
  const [reloadKey, setReloadKey] = useState(0);
  const [myId, setMyId] = useState(null);
  const [deletableRoles, setDeletableRoles] = useState(new Set()); // roles the caller may remove

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      setMyId(auth?.user?.id || null);
      const { data } = await supabase.rpc("get_assignable_roles");
      setDeletableRoles(new Set((data || []).map((r) => r.name)));
    })();
  }, []);

  // Hide the trash icon for yourself and for roles you can't remove (the server enforces this too)
  const canDelete = (s) => s.id !== myId && deletableRoles.has(s.role);

  // Refresh when staff are added from the dock's Add Staff menu
  useEffect(() => {
    const refresh = () => setReloadKey((k) => k + 1);
    window.addEventListener("staff:changed", refresh);
    return () => window.removeEventListener("staff:changed", refresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const { data, error } = await supabase.rpc("get_branch_report", {
        p_start_date: range.from || null,
        p_end_date: range.to || null,
      });
      if (cancelled) return;
      if (error) {
        setError(error.message || "Couldn't load branches. Please try again.");
        setBranches([]);
      } else {
        setBranches(data || []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, reloadKey]);

  const periodText = rangeLabel(range.from, range.to);

  return (
    <div className="min-h-screen bg-backgroundAlt">
      <Dock />

      <main className="px-6 pb-12 pt-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl text-secondary">Branches</h1>
              <p className="mt-1 text-sm text-muted">
                {loading ? "Loading..." : `${branches.length} branch${branches.length === 1 ? "" : "es"} · ${periodText}`}
              </p>
            </div>
            <DateRange value={range} onChange={setRange} />
          </div>

          {error && (
            <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          {loading ? (
            <Skeleton />
          ) : branches.length === 0 && !error ? (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border bg-background text-sm text-muted">
              You don't have access to any branch reports.
            </div>
          ) : (
            <div className="space-y-12">
              {branches.map((b) => (
                <BranchSection key={b.branch_name} b={b} periodText={periodText} onAddStaff={setAddTo}
                  canDelete={canDelete}
                  onDeleteStaff={setDeleting}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {deleting && (
        <DeleteStaffModal
          staff={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {addTo && (
        <AddStaffModal
          branch={addTo}
          branches={branches}
          onClose={() => setAddTo(null)}
          onSaved={() => {
            setAddTo(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}