import { jsPDF } from "jspdf";
import { SEAL_IMAGE_BASE64 } from "./diplomaPdf";


export const SEAL_SRC_W = 659;
export const SEAL_SRC_H = 378;

// ── helpers ──────────────────────────────────────────────────────────────

export function formatDate(raw) {
  if (!raw) return "—";
  const d = new Date(String(raw).includes("T") ? raw : raw + "T00:00:00");
  if (isNaN(d)) return String(raw);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

function formatTime(raw) {
  if (!raw) return "—";
  const parts = String(raw).split(":");
  if (parts.length < 2) return String(raw);
  let hours = parseInt(parts[0], 10);
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, "0")}:${parts[1]} ${ampm}`;
}

export async function fetchImageAsDataURL(url) {
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          canvas.getContext("2d").drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/jpeg", 0.9));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = url;
    });
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Image fetch failed");
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

// ── main ─────────────────────────────────────────────────────────────────

// Returns the generated PDF as a Blob (no longer downloads it).
export async function generateAdmitCardPDF(student, { branchAddress = "" } = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const W = 210;
  const margin = 18;
  const contentW = W - margin * 2;

  const purple = [106, 0, 122];
  const purpleLight = [240, 220, 245];
  const darkText = [30, 30, 50];
  const mutedText = [100, 100, 120];
  const white = [255, 255, 255];
  const borderGrey = [210, 210, 225];

  function filledRect(x, y, w, h, r, fillColor, strokeColor) {
    doc.setFillColor(...fillColor);
    if (strokeColor) doc.setDrawColor(...strokeColor);
    doc.roundedRect(x, y, w, h, r, r, strokeColor ? "FD" : "F");
  }

  // Page border
  doc.setDrawColor(...purple);
  doc.setLineWidth(1.2);
  doc.roundedRect(8, 8, W - 16, 281, 4, 4);
  doc.setLineWidth(0.3);
  doc.setDrawColor(...purpleLight);
  doc.roundedRect(10, 10, W - 20, 277, 3, 3);

  // Header banner
  filledRect(8, 8, W - 16, 32, 4, purple);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...white);
  doc.text("VINTECH COMPUTER EDUCATION", W / 2, 21, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(220, 190, 230);
  doc.text("Opp. Ramayan Vatika, Bareilly  |  vintecheducation.org  |  +91 90684 85233", W / 2, 27.5, {
    align: "center",
  });

  filledRect(W / 2 - 28, 31, 56, 10, 3, white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...purple);
  doc.text("ADMIT CARD", W / 2, 37.5, { align: "center" });

  // Student photo
  const photoX = W - margin - 36;
  const photoY = 50;
  const photoW = 34;
  const photoH = 40;

  // Photo comes from the applicant's stored photo_url
  let photoDataURL = null;
  if (student.photo_url) {
    try {
      photoDataURL = await fetchImageAsDataURL(student.photo_url);
    } catch (err) {
      console.error("Couldn't load applicant photo:", err);
    }
  }

  filledRect(photoX - 1, photoY - 1, photoW + 2, photoH + 2, 3, purpleLight);
  if (photoDataURL) {
    doc.addImage(photoDataURL, "JPEG", photoX, photoY, photoW, photoH);
  } else {
    filledRect(photoX, photoY, photoW, photoH, 2, [230, 215, 240]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...mutedText);
    doc.text("Photo", photoX + photoW / 2, photoY + photoH / 2 - 2, { align: "center" });
    doc.text("Not Available", photoX + photoW / 2, photoY + photoH / 2 + 4, { align: "center" });
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...purple);
  doc.text("STUDENT PHOTO", photoX + photoW / 2, photoY + photoH + 5, { align: "center" });

  // Student details
  const detailsX = margin;
  let curY = 50;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...purple);
  doc.text("STUDENT DETAILS", detailsX, curY);
  doc.setDrawColor(...purple);
  doc.setLineWidth(0.4);
  doc.line(detailsX, curY + 1.5, detailsX + 50, curY + 1.5);
  curY += 7;

  const fields = [
    ["Roll Number", student.roll_number ?? "—"],
    ["Student Name", student.student_name || "—"],
    ["Branch", student.exam_branch || "—"],
    ["Father's Name", student.father_name || "—"],
    ["Mobile", student.mobile_number || "—"],
  ];

  const labelW = 42;
  const valueW = contentW - photoW - 10 - labelW;
  const rowH = 9;

  fields.forEach(([label, value], i) => {
    const rowY = curY + i * rowH;
    const bg = i % 2 === 0 ? [248, 243, 252] : white;
    filledRect(detailsX, rowY, labelW + valueW, rowH - 0.5, 1.5, bg, borderGrey);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...mutedText);
    doc.text(label, detailsX + 3, rowY + 6);

    doc.setDrawColor(...borderGrey);
    doc.setLineWidth(0.2);
    doc.line(detailsX + labelW, rowY, detailsX + labelW, rowY + rowH - 0.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...darkText);
    doc.text(String(value).toUpperCase(), detailsX + labelW + 3, rowY + 6);
  });

  curY += fields.length * rowH + 10;

  // Exam / scholarship info
  filledRect(margin, curY, contentW, 8, 2, purple);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...white);
  doc.text("EXAM / SCHOLARSHIP INFORMATION", W / 2, curY + 5.5, { align: "center" });
  curY += 12;

  // Exam centre address comes from the branch table (via get_branches);
  // fall back to the branch name if no address is on record.
  const examCenterAddress = branchAddress || student.exam_branch || "—";

  // Row 1: date / time / issued-on side by side.
  // Row 2: exam centre across the full width, wrapping onto as many lines as needed.
  function infoCell(x, y, w, label, value, bg) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(String(value), w - 6);
    const h = 9 + (lines.length - 1) * 4;

    filledRect(x, y, w, h, 1.5, bg, borderGrey);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...mutedText);
    doc.text(label, x + 3, y + 3.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...darkText);
    doc.text(lines, x + 3, y + 7.5, { lineHeightFactor: 1.15 });
    return h;
  }

  const gap = 4;
  const thirdW = (contentW - gap * 2) / 3;
  const rowOneItems = [
    ["Exam Date", formatDate(student.exam_date)],
    ["Exam Time", formatTime(student.exam_time)],
    ["Issued On", formatDate(new Date().toISOString())],
  ];
  rowOneItems.forEach(([label, value], i) => {
    infoCell(margin + i * (thirdW + gap), curY, thirdW, label, value, [248, 243, 252]);
  });

  const centreH = infoCell(margin, curY + 10, contentW, "Exam Centre", examCenterAddress, white);

  curY += 10 + centreH + 10;

  // Instructions
  filledRect(margin, curY, contentW, 42, 3, [253, 248, 255], purpleLight);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...purple);
  doc.text("INSTRUCTIONS TO CANDIDATE", margin + 4, curY + 7);

  const instructions = [
    "1. This admit card must be presented at the examination / scholarship centre.",
    "2. Carry a valid government-issued photo ID along with this admit card.",
    "3. Mobile phones and electronic devices are NOT allowed in the exam hall.",
    "4. Any attempt at unfair means will lead to immediate disqualification.",
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(...darkText);
  instructions.forEach((line, idx) => doc.text(line, margin + 4, curY + 14 + idx * 6));

  curY += 48;

  // Signatures + seal
  const sigBoxW = 55;
  filledRect(margin, curY, sigBoxW, 18, 2, [250, 245, 255], borderGrey);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...purple);
  doc.text("STUDENT SIGNATURE", margin + sigBoxW / 2, curY + 14, { align: "center" });

  filledRect(W - margin - sigBoxW, curY, sigBoxW, 18, 2, [250, 245, 255], borderGrey);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...purple);
  doc.text("EXAMINER SIGNATURE", W - margin - sigBoxW / 2, curY + 14, { align: "center" });

  // "VCE / Official Seal" text is drawn first...
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...purple);
  doc.text("VCE", W / 2, curY + 8, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(...mutedText);
  doc.text("Official Seal", W / 2, curY + 13, { align: "center" });

  // ...then the seal image is stamped over it, centred on the text
  const sealW = 32; // mm
  const sealH = sealW * (SEAL_SRC_H / SEAL_SRC_W);
  const sealCx = W / 2;
  const sealCy = curY + 9; // vertical middle of the 18mm signature boxes

  try {
    doc.addImage(
      SEAL_IMAGE_BASE64,
      "PNG", // change to "JPEG" if your seal is a JPEG
      sealCx - sealW / 2,
      sealCy - sealH / 2,
      sealW,
      sealH
    );
  } catch (err) {
    // If the image is missing/invalid, the text above still shows
    console.error("Couldn't add seal image:", err);
  }

  // Footer strip
  const footerY = 282;
  filledRect(8, footerY, W - 16, 7, 0, purple);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...white);
  doc.text(
    "This is a computer-generated admit card. For queries contact: info@vintecheducation.org | +91 90684 85233",
    W / 2,
    footerY + 4.5,
    { align: "center" }
  );

  // Return the PDF instead of downloading it
  return doc.output("blob");
}