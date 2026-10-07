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

// Uploads a photo as "<roll>_<name>.<ext>" and removes any older photo for the same roll.
// Throws on failure. Returns the stored file name.
export async function uploadStudentPhoto(file, rollNumber, studentName) {
  const roll = cleanKeyPart(rollNumber);
  const name = cleanKeyPart(studentName);

  if (!roll) throw new Error("Roll number is required to upload a photo.");

  // Normalise extension to jpg / jpeg / png.
  let ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!["jpg", "jpeg", "png"].includes(ext)) {
    ext = file.type === "image/png" ? "png" : "jpg";
  }

  const path = `${roll}_${name}.${ext}`;
  const prefix = `${roll}_`;

  // Remove older photo(s) for this roll so the lookup never finds a stale one.
  try {
    const { data: existing } = await secSupabase.storage
      .from(PHOTO_BUCKET)
      .list("", { search: prefix, limit: 100 });

    const stale = (existing || [])
      .filter((f) => f.name.startsWith(prefix) && f.name !== path)
      .map((f) => f.name);

    if (stale.length) {
      await secSupabase.storage.from(PHOTO_BUCKET).remove(stale);
    }
  } catch (err) {
    console.error("Couldn't clean old photos:", err);
  }

  const { error } = await secSupabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || (ext === "png" ? "image/png" : "image/jpeg"),
    });

  if (error) throw error;
  return path;
}