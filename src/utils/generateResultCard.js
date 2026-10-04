import { jsPDF } from "jspdf";
import { SEAL_IMAGE_BASE64 } from "./diplomaPdf";
import {
  SEAL_SRC_W,
  SEAL_SRC_H,
  fetchImageAsDataURL,
  formatDate,
} from "./generateAdmitCard";

import { SIGNATURE_IMAGE_BASE64 } from "./diplomaPdf";

const VERIFY_URL =
  "https://vintecheducation.org/scholarship-results.html";

// A score is valid when it exists and is a real number.
export function hasValidScore(row) {
  return (
    row?.exam_score != null &&
    row.exam_score !== "" &&
    !isNaN(Number(row.exam_score))
  );
}

// Same tiers as the public results page.
export function scholarshipFor(score) {
  const marks = Number(score);

  if (marks >= 91) return "100% OFF";
  if (marks >= 81) return "90% OFF";
  if (marks >= 71) return "75% OFF";
  if (marks >= 61) return "70% OFF";
  if (marks >= 41) return "65% OFF";
  if (marks >= 21) return "60% OFF";
  if (marks >= 1) return "50% OFF";

  return "Qualifying";
}

// Returns the generated PDF as a Blob (no longer downloads it).
export async function generateResultPDF(
  student,
  { branchAddress = "" } = {}
) {
  if (!hasValidScore(student)) {
    throw new Error("No valid score for this applicant.");
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const W = 210;
  const margin = 18;
  const contentW = W - margin * 2;

  const purple = [106, 0, 122];
  const accent = [160, 70, 180];
  const panel = [252, 250, 255];
  const darkText = [30, 30, 50];
  const mutedText = [100, 100, 120];
  const white = [255, 255, 255];
  const lineGrey = [225, 225, 235];

  const score = Number(student.exam_score);
  const scholarship = scholarshipFor(score);

  // Letter-spaced text, truly centered.
  function spacedCenter(text, cx, y, spacing) {
    const visibleW =
      doc.getTextWidth(text) + (text.length - 1) * spacing;

    doc.setCharSpace(spacing);
    doc.text(text, cx - visibleW / 2, y);
    doc.setCharSpace(0);

    return visibleW;
  }

  // Watermark.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(64);
  doc.setTextColor(246, 238, 248);

  // Shift right slightly to visually center the rotated watermark.
  doc.text("VCE ORIGINAL", W / 2 + 20, 160, {
    align: "center",
    angle: 45,
  });

  // Double border.
  doc.setDrawColor(...purple);
  doc.setLineWidth(0.8);
  doc.rect(8, 8, W - 16, 281);

  doc.setDrawColor(...accent);
  doc.setLineWidth(0.25);
  doc.rect(10.5, 10.5, W - 21, 276);

  // Header.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...purple);
  doc.text("VINTECH COMPUTER EDUCATION", W / 2, 28, {
    align: "center",
  });

  doc.setFontSize(10);
  doc.setTextColor(...accent);
  spacedCenter("VCESE - REPORT CARD", W / 2, 36, 1.5);

  const branches = [
    ["Main Branch", "Opp. Ramayan Vatika, Bareilly", "Ph: +91 90684 85233"],
    ["Second Branch", "Greater Green Park, Bareilly", "Ph: +91 94564 89436"],
    ["Village Branch", "Umedpur Bhuta, Bareilly", "Ph: +91 90684 85233"],
  ];

  const colW = contentW / 3;

  branches.forEach(([name, addr, ph], i) => {
    const x = margin + i * colW;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...darkText);
    doc.text(name, x, 46);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...mutedText);
    doc.text(addr, x, 50.5);
    doc.text(ph, x, 55);
  });

  // Double rule.
  doc.setDrawColor(...lineGrey);
  doc.setLineWidth(0.3);
  doc.line(margin, 61, W - margin, 61);
  doc.line(margin, 62.2, W - margin, 62.2);

  // Section helper.
  function sectionTag(text, y) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...purple);

    const tw = spacedCenter(text, W / 2, y, 1);

    doc.setDrawColor(...purple);
    doc.setLineWidth(0.3);
    doc.line(
      W / 2 - tw / 2,
      y + 1.5,
      W / 2 + tw / 2,
      y + 1.5
    );
  }

  // Student particulars.
  sectionTag("STUDENT PARTICULARS", 74);

  const centre =
    branchAddress || student.exam_branch || "—";

  const rows = [
    ["Enrollment No / Roll No", student.roll_number ?? "—"],
    ["Candidate's Name", student.student_name || "—"],
    ["Father's / Guardian's Name", student.father_name || "—"],
    ["Gender", student.gender || "—"],
    ["Contact Information", student.mobile_number || "—"],
    ["Exam Centre", centre],
    ["Exam Date", formatDate(student.exam_date)],
  ];

  let y = 84;
  const rowH = 10;

  rows.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...mutedText);
    doc.text(label.toUpperCase(), margin, y);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...darkText);

    const lines = doc.splitTextToSize(
      String(value),
      contentW * 0.6
    );

    doc.text(lines, W - margin, y, {
      align: "right",
    });

    const extra = (lines.length - 1) * 4.2;

    doc.setDrawColor(...lineGrey);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(
      margin,
      y + 3 + extra,
      W - margin,
      y + 3 + extra
    );
    doc.setLineDashPattern([], 0);

    y += rowH + extra;
  });

  // Performance appraisal.
  y += 6;
  sectionTag("PERFORMANCE APPRAISAL", y);
  y += 8;

  const boxH = 46;
  const gap = 8;
  const boxW = (contentW - gap) / 2;

  // Marks box.
  doc.setFillColor(...panel);
  doc.setDrawColor(...lineGrey);
  doc.setLineWidth(0.3);
  doc.roundedRect(
    margin,
    y,
    boxW,
    boxH,
    2,
    2,
    "FD"
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...mutedText);
  doc.text(
    "TOTAL MARKS SECURED",
    margin + boxW / 2,
    y + 12,
    { align: "center" }
  );

  doc.setFontSize(28);
  doc.setTextColor(...purple);

  const scoreText = Number.isInteger(score)
    ? String(score)
    : score.toFixed(2);

  doc.text(
    `${scoreText}/100`,
    margin + boxW / 2,
    y + 30,
    { align: "center" }
  );

  // Percentage badge (highlighted).
  const bx = margin + boxW + gap;

  doc.setFillColor(248, 240, 255);
  doc.setDrawColor(...purple);
  doc.setLineWidth(0.9);
  doc.roundedRect(bx, y, boxW, boxH, 6, 6, "FD");

  doc.setLineWidth(0.3);
  doc.roundedRect(bx + 1.6, y + 1.6, boxW - 3.2, boxH - 3.2, 5, 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...accent);
  doc.text("PERCENTAGE SCORE", bx + boxW / 2, y + 17, { align: "center" });

  doc.setFontSize(28);
  doc.setTextColor(...purple);
  doc.text(`${scoreText}%`, bx + boxW / 2, y + 33, { align: "center" });

  // Waiver line below the boxes: "<num>% off on percentage score <num>%"
  // Mixed bold/regular segments, centred as one line.
  const pctText = `${scoreText}%`;
  const segments =
    scholarship === "Qualifying"
      ? [
          { t: "Qualifying", bold: true },
          { t: " on percentage score ", bold: false },
          { t: pctText, bold: true },
        ]
      : [
          { t: scholarship.toLowerCase(), bold: true },
          { t: " on percentage score ", bold: false },
          { t: pctText, bold: true },
        ];

  doc.setFontSize(11);
  const widths = segments.map((seg) => {
    doc.setFont("helvetica", seg.bold ? "bold" : "normal");
    return doc.getTextWidth(seg.t);
  });
  const totalW = widths.reduce((a, b) => a + b, 0);
  let tx = W / 2 - totalW / 2;
  const lineY = y + boxH + 11;

  segments.forEach((seg, i) => {
    doc.setFont("helvetica", seg.bold ? "bold" : "normal");
    if (seg.bold) doc.setTextColor(...purple);
    else doc.setTextColor(...darkText);
    doc.text(seg.t, tx, lineY);
    tx += widths[i];
  });

  // Footer authentication area.
  const authY = 244;

  doc.setDrawColor(...lineGrey);
  doc.setLineWidth(0.3);
  doc.line(
    margin,
    authY - 4,
    W - margin,
    authY - 4
  );

  // QR code.
  try {
    const qr = await fetchImageAsDataURL(
      `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
        VERIFY_URL
      )}`
    );

    doc.addImage(
      qr,
      "JPEG",
      margin,
      authY,
      24,
      24
    );
  } catch (err) {
    console.error(
      "Couldn't load verification QR:",
      err
    );

    doc.setDrawColor(...lineGrey);
    doc.rect(margin, authY, 24, 24);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...mutedText);
  doc.text(
    "SCAN TO VERIFY",
    margin + 12,
    authY + 28,
    { align: "center" }
  );

  // Center Director signature and official seal.
  const sx = W - margin - 30;

  // Signature dimensions (500 x 150 source ratio).
  const sigImgW = 38;
  const sigImgH = sigImgW * (150 / 500);

  // Seal dimensions, preserving the source aspect ratio.
  const sealW = 32;
  const sealH = sealW * (SEAL_SRC_H / SEAL_SRC_W);

  // Seal behind signature, with increased opacity.
  try {
    if (
      typeof doc.saveGraphicsState === "function" &&
      typeof doc.GState === "function"
    ) {
      doc.saveGraphicsState();
      doc.setGState(
        new doc.GState({ opacity: 0.65 })
      );
    }

    doc.addImage(
      SEAL_IMAGE_BASE64,
      "PNG",
      sx - sealW / 2,
      authY + 2,
      sealW,
      sealH
    );

    if (
      typeof doc.restoreGraphicsState === "function"
    ) {
      doc.restoreGraphicsState();
    }
  } catch (err) {
    console.error(
      "Couldn't add seal image:",
      err
    );

    if (
      typeof doc.restoreGraphicsState === "function"
    ) {
      try {
        doc.restoreGraphicsState();
      } catch (_) {
        // Ignore graphics-state restoration errors.
      }
    }
  }

  // Signature on top of the seal.
  // Positioned closer to the signature line.
  try {
    doc.addImage(
      SIGNATURE_IMAGE_BASE64,
      "PNG",
      sx - sigImgW / 2,
      authY + 5,
      sigImgW,
      sigImgH
    );
  } catch (err) {
    console.error(
      "Couldn't add signature image:",
      err
    );
  }

  // Signature line.
  doc.setDrawColor(51, 51, 51);
  doc.setLineWidth(0.3);
  doc.line(
    sx - 20,
    authY + 17,
    sx + 20,
    authY + 17
  );

  // Director name.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...purple);
  doc.text(
    "Manish Vishwakarma",
    sx,
    authY + 22,
    { align: "center" }
  );

  // Director title.
  doc.setFontSize(7);
  doc.setTextColor(...mutedText);
  doc.text(
    "CENTER DIRECTOR",
    sx,
    authY + 26.5,
    { align: "center" }
  );

  // Footer strip.
  doc.setFillColor(...purple);
  doc.rect(8, 282, W - 16, 7, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...white);
  doc.text(
    "This is a computer-generated report card. For queries contact: info@vintecheducation.org | +91 90684 85233",
    W / 2,
    286.5,
    { align: "center" }
  );

  // Return the PDF instead of downloading it
  return doc.output("blob");
}