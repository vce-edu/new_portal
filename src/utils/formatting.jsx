export function feeStatusStyle(status) {
  if (!status) return "bg-border/40 text-muted";
  if (status.startsWith("Pending")) return "bg-[#FEF3E2] text-accent";
  if (status === "Course-Overdue") return "bg-red-50 text-red-600";
  if (status === "Up-to-Date") return "bg-green-50 text-green-600";
  return "bg-border/40 text-muted";
}

export function toTitleCase(str) {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Center operates 8 AM - 8 PM. A bare hour number is ambiguous (AM or PM),
 * so we resolve it to whichever interpretation actually falls inside
 * operating hours: 1-7 can only be PM (their AM versions are before opening),
 * 8-11 can only be AM (their PM versions are after/at closing), 12 -> noon (PM).
 */
export function formatBatchTime(raw) {
  if (!raw) return raw;
  const trimmed = String(raw).trim();
  if (!/^\d{1,2}$/.test(trimmed)) return raw; // already formatted / not a bare number, leave alone
  const hour = parseInt(trimmed, 10);
  if (hour < 1 || hour > 12) return raw;

  let period;
  if (hour === 12) period = "PM";
  else if (hour >= 8) period = "AM";
  else period = "PM";

  return `${hour}:00 ${period}`;
}

export function combineBatchTime(from, to) {
  if (from && to) return `${from} - ${to}`;
  return from || to || "";
}

export function splitBatchTime(value) {
  if (!value) return { from: "", to: "" };
  const parts = value.split(" - ");
  if (parts.length === 2) return { from: parts[0], to: parts[1] };
  return { from: value, to: "" };
}
/**
 * Prefixes a roll number with the branch's first letter, e.g. "1234" + "Main" -> "m_1234".
 * Strips any existing "x_" prefix first so re-editing doesn't stack prefixes,
 * and so it stays correct if the branch is changed after the roll number was typed.
 */
export function formatRollNumber(raw, branch) {
  if (!raw || !branch) return raw;
  const stripped = raw.replace(/^[a-zA-Z]+_/, "");
  const initial = branch.charAt(0).toLowerCase();
  return `${initial}_${stripped}`;
}