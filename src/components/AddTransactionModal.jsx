import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";
import { TextField } from "./Input.jsx";
import Button from "./Button.jsx";
import { supabase } from "../createClient";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";
import { toTitleCase } from "../utils/formatting";

function getTodayDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// receipt numbers just need to be unique and human-scannable; timestamp-based
// is enough here since there's no sequence/counter exposed for this
function generateReceiptNo() {
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("");
  const time = [
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
  ].join("");
  return `RCPT-${stamp}-${time}`;
}

const printReceipt = (receipt) => {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.write(`
    <html>
      <head>
        <title>Receipt - ${receipt.receipt_no || "N/A"}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 20mm;
          }
          body {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 0;
            background: #fff;
          }
          .receipt-container {
            max-width: 100%;
            margin: 20px 0 0 0;
            border: 1px dashed #7c3aed;
            padding: 12px 16px;
            border-radius: 8px;
            background: #fff;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #7c3aed;
            padding-bottom: 6px;
            margin-bottom: 8px;
          }
          .logo {
            font-size: 15px;
            font-weight: 800;
            color: #7c3aed;
            margin: 0 0 2px 0;
            text-transform: uppercase;
          }
          .subtitle {
            font-size: 9px;
            color: #666;
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .receipt-title {
            font-size: 12px;
            font-weight: 700;
            margin: 4px 0 0 0;
            color: #111;
          }
          .details-grid {
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin-bottom: 8px;
          }
          .detail-item {
            font-size: 12px;
            display: flex;
            justify-content: space-between;
            line-height: 1.1;
          }
          .label {
            font-weight: 600;
            color: #666;
          }
          .value {
            color: #111;
            font-weight: 500;
          }
          .fee-row {
            border-top: 1px solid #e5e7eb;
            border-bottom: 1px solid #e5e7eb;
            padding: 4px 0;
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
            font-size: 12px;
          }
          .fee-label {
            font-weight: 600;
            color: #4b5563;
          }
          .fee-amount {
            font-weight: 700;
            color: #111;
          }
          .total-box {
            background: #f3f4f6;
            padding: 6px 10px;
            border-radius: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-sizing: border-box;
          }
          .total-label {
            font-size: 10px;
            color: #4b5563;
            font-weight: 600;
            text-transform: uppercase;
          }
          .total-amount {
            font-size: 14px;
            font-weight: 800;
            color: #111;
          }
          .footer-note {
            text-align: center;
            font-size: 9px;
            color: #9ca3af;
            margin-top: 10px;
            border-top: 1px dashed #e5e7eb;
            padding-top: 4px;
          }
          @media print {
            body {
              padding: 0;
            }
            .receipt-container {
              border: 1px dashed #7c3aed !important;
              margin: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="header">
            <h1 class="logo">Vintech Computer Education</h1>
            ${receipt.branch_address ? `<p class="subtitle">${receipt.branch_address}</p>` : ""}
            <h2 class="receipt-title">FEE RECEIPT</h2>
          </div>
          
          <div class="details-grid">
            <div class="detail-item">
              <span class="label">Receipt No:</span>
              <span class="value" style="font-weight: 700;">${receipt.receipt_no || "N/A"}</span>
            </div>
            <div class="detail-item">
              <span class="label">Date Paid:</span>
              <span class="value">${receipt.paid_on}</span>
            </div>
            <div class="detail-item">
              <span class="label">Student Name:</span>
              <span class="value" style="font-weight: 700;">${(receipt.student_name || "").toUpperCase()}</span>
            </div>
            <div class="detail-item">
              <span class="label">Roll Number:</span>
              <span class="value" style="font-weight: 700; font-family: monospace;">${(receipt.roll_no || "").toUpperCase()}</span>
            </div>
            <div class="detail-item">
              <span class="label">Father's Name:</span>
              <span class="value">${receipt.father_name || "N/A"}</span>
            </div>
            <div class="detail-item">
              <span class="label">Course:</span>
              <span class="value">${receipt.course || "N/A"}</span>
            </div>
            <div class="detail-item">
              <span class="label">Batch Time:</span>
              <span class="value">${receipt.batch_time || "N/A"}</span>
            </div>
          </div>

          <div class="fee-row">
            <span class="fee-label">Tuition Fee Payment</span>
            <span class="fee-amount">₹${receipt.amount_paid}</span>
          </div>

          <div class="total-box">
            <span class="total-label">Total Paid</span>
            <span class="total-amount">₹${receipt.amount_paid}</span>
          </div>

          <div class="footer-note">
            Thank you for your payment. This is a computer-generated receipt.
          </div>
        </div>
      </body>
    </html>
  `);
  doc.close();

  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  }, 250);
};

export default function AddTransactionModal({ onClose, onSaved, lockedStudent }) {
  useCloseOnEscape(onClose);

  const [rollNumber, setRollNumber] = useState(lockedStudent?.roll_number || "");
  const [receiptNo] = useState(generateReceiptNo);
  const [paidOn, setPaidOn] = useState(getTodayDate);
  const [amountPaid, setAmountPaid] = useState(
    lockedStudent?.fee_per_month != null ? String(lockedStudent.fee_per_month) : ""
  );
  const [amountTouched, setAmountTouched] = useState(false);

  const [student, setStudent] = useState(lockedStudent || null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // set once the transaction is saved; drives the "print receipt" step
  const [savedReceipt, setSavedReceipt] = useState(null);

  // debounced lookup as soon as the roll number is typed — skipped entirely
  // when the student is already known (opened from within their profile)
  useEffect(() => {
    if (lockedStudent) return;

    const trimmed = rollNumber.trim();
    if (!trimmed) {
      setStudent(null);
      setLookupError("");
      return;
    }

    setLookupLoading(true);
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc("get_students", {
        p_search: trimmed,
        p_page: 1,
        p_page_size: 5,
      });

      setLookupLoading(false);

      if (error) {
        setLookupError("Couldn't look up that roll number.");
        setStudent(null);
        return;
      }

      const match = (data || []).find(
        (s) => s.roll_number.toLowerCase() === trimmed.toLowerCase()
      );

      if (!match) {
        setLookupError("No student found with this roll number.");
        setStudent(null);
        return;
      }

      setLookupError("");
      setStudent(match);
      if (!amountTouched && match.fee_per_month != null) {
        setAmountPaid(String(match.fee_per_month));
      }
    }, 400);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollNumber]);

  function handleKeyDown(e) {
    if (e.key === "Enter" && e.target.tagName === "INPUT") {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!student) {
      setError("Enter a valid roll number before saving.");
      return;
    }
    if (!amountPaid) {
      setError("Amount paid is required.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.rpc("manage_transaction", {
      action: "insert",
      payload: {
        roll_number: student.roll_number,
        receipt_no: receiptNo,
        payee: student.father_name || "",
        amount_paid: amountPaid,
        paid_on: paidOn,
      },
    });

    setSaving(false);

    if (error) {
      setError(error.message || "Couldn't save this transaction.");
      return;
    }

    // the student we hold may have come from somewhere that doesn't carry
    // course / batch_time (e.g. a locked student passed in from a profile),
    // so pull the full row by roll number for the receipt
    let receiptStudent = student;
    if (!student.course || !student.batch_time) {
      try {
        const { data: found } = await supabase.rpc("get_students", {
          p_search: student.roll_number,
          p_page: 1,
          p_page_size: 5,
        });
        const exact = (found || []).find(
          (s) => s.roll_number.toLowerCase() === student.roll_number.toLowerCase()
        );
        if (exact) receiptStudent = exact;
      } catch (err) {
        console.error("get_students (receipt):", err);
      }
    }

    // get_branches returns every branch for owners and only the caller's own
    // branch for everyone else, so match on the student's branch to pick the
    // right address. A failure here shouldn't block the receipt.
    let branchAddress = "";
    try {
      const { data: branches } = await supabase.rpc("get_branches");
      const studentBranch = (student.branch || "").trim().toLowerCase();
      const branchRow = (branches || []).find(
        (b) => (b.branch || "").trim().toLowerCase() === studentBranch
      );
      branchAddress = branchRow?.address || "";
    } catch (err) {
      console.error("get_branches:", err);
    }

    // same shape the receipt printer expects (dd/mm/yyyy date, like the Fees page)
    setSavedReceipt({
      branch_address: branchAddress,
      roll_no: student.roll_number,
      student_name: student.student_name,
      father_name: student.father_name,
      amount_paid: amountPaid,
      receipt_no: receiptNo,
      paid_on: paidOn.split("-").reverse().join("/"),
      course: receiptStudent.course,
      batch_time: receiptStudent.batch_time,
    });

    onSaved();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/40 backdrop-blur-sm p-6">
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="font-display text-lg text-secondary">
              {savedReceipt ? "Payment Successful!" : "Add Transaction"}
            </h2>
            <p className="text-sm text-muted">
              {savedReceipt
                ? "Transaction has been recorded successfully."
                : "Record a fee payment against a student."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-primaryLight hover:text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {savedReceipt ? (
          <div className="space-y-5 px-6 py-6">
            <div className="rounded-lg bg-backgroundAlt p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Student Name</span>
                <span className="text-text">{savedReceipt.student_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Roll Number</span>
                <span className="text-text uppercase">{savedReceipt.roll_no}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Receipt No</span>
                <span className="text-text">{savedReceipt.receipt_no}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Amount Paid</span>
                <span className="text-text">₹{savedReceipt.amount_paid}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Paid On</span>
                <span className="text-text">{savedReceipt.paid_on}</span>
              </div>
            </div>

            <p className="text-center text-sm text-muted">
              Would you like to print a physical receipt for this transaction?
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md border border-border px-4 py-2 text-sm text-text transition-colors hover:bg-backgroundAlt"
              >
                Close
              </button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => printReceipt(savedReceipt)}
              >
                Print Receipt
              </Button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-5 px-6 py-6">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="relative">
            <TextField
              label="Roll Number"
              value={rollNumber}
              onChange={(e) => {
                setRollNumber(e.target.value);
                setAmountTouched(false);
              }}
              placeholder="e.g. m_1234"
              error={lookupError || undefined}
              disabled={Boolean(lockedStudent)}
            />
            {lookupLoading && !lockedStudent && (
              <Loader2 className="absolute right-0 top-9 h-4 w-4 animate-spin text-muted" />
            )}
          </div>

          {student && (
            <div className="rounded-lg bg-backgroundAlt p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Student Name</span>
                <span className="text-text">{student.student_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Father's Name</span>
                <span className="text-text">{student.father_name || "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Branch</span>
                <span className="text-text">{toTitleCase(student.branch) || "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Receipt No</span>
                <span className="text-text">{receiptNo}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Payee</span>
                <span className="text-text">{student.father_name || "—"}</span>
              </div>
            </div>
          )}

          <TextField
            label="Amount Paid"
            type="number"
            value={amountPaid}
            onChange={(e) => {
              setAmountPaid(e.target.value);
              setAmountTouched(true);
            }}
            disabled={!student}
          />

          <TextField
            label="Paid On"
            type="date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />

          <Button type="submit" className="w-full" loading={saving} disabled={saving || !student}>
            Add transaction
          </Button>
        </form>
        )}
      </div>
    </div>,
    document.body
  );
}