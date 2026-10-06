import { secSupabase } from "../createClient"; // adjust path if needed

export const PHOTO_BUCKET = "student-photos";

// Strip characters storage keys dislike, keep spaces.
export function cleanKeyPart(s) {
  return String(s ?? "")
    .replace(/[\\/?#%*:|"<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Finds "<roll>_<name>.(jpg|jpeg|png)" in the bucket. Returns the file entry or null.
export async function findStudentPhotoFile(rollNumber) {
  const roll = cleanKeyPart(rollNumber);
  if (!roll) return null;

  const prefix = `${roll}_`;

  const { data, error } = await secSupabase.storage
    .from(PHOTO_BUCKET)
    .list("", { search: prefix, limit: 100 });

  if (error) throw error;

  return (
    (data || []).find(
      (f) => f.name.startsWith(prefix) && /\.(jpe?g|png)$/i.test(f.name)
    ) || null
  );
}

// Returns { blob, name } or null if the student has no photo.
export async function downloadStudentPhoto(rollNumber) {
  const file = await findStudentPhotoFile(rollNumber);
  if (!file) return null;

  const { data: blob, error } = await secSupabase.storage
    .from(PHOTO_BUCKET)
    .download(file.name);

  if (error || !blob) throw error || new Error("Empty photo");
  return { blob, name: file.name };
}