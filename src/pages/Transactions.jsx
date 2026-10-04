import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import Dock from "../components/Dock";
import Table from "../components/Table";
import TransactionModal from "../components/TransactionModal";
import AddTransactionModal from "../components/AddTransactionModal";
import Button from "../components/Button";
import { supabase } from "../createClient";
import { useBranchFilter } from "../context/BranchFilterContext";
import { toTitleCase } from "../utils/formatting";

const columns = [
  { key: "receipt_no", label: "Receipt No" },
  { key: "student_name", label: "Student Name" },
  { key: "roll_number", label: "Roll Number" },
  { key: "payee", label: "Payee" },
  {
    key: "amount_paid",
    label: "Amount Paid",
    sortable: true,
    render: (row) =>
      row.amount_paid != null ? `₹${Number(row.amount_paid).toLocaleString("en-IN")}` : "—",
  },
  {
    key: "paid_on",
    label: "Paid On",
    sortable: true,
    render: (row) =>
      row.paid_on
        ? new Date(row.paid_on).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "—",
  },
  { key: "branch", label: "Branch", render: (row) => toTitleCase(row.branch) || "—" },
];

function TableSkeleton() {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-background">
      <div className="border-b border-border bg-backgroundAlt px-4 py-3">
        <div className="h-3 w-24 rounded bg-border/60 animate-pulse" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-4">
            <div className="h-3 w-16 rounded bg-border/50 animate-pulse" />
            <div className="h-3 w-32 rounded bg-border/50 animate-pulse" />
            <div className="h-3 w-24 rounded bg-border/50 animate-pulse" />
            <div className="h-3 w-20 rounded bg-border/50 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { mode: 'view' | 'edit', transaction }
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;
  const { selectedBranch } = useBranchFilter();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("paid_on");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function loadTransactions() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase.rpc("get_transactions", {
      p_branch: selectedBranch,
      p_page: page,
      p_page_size: pageSize,
      p_search: search || null,
      p_sort_by: sortKey,
      p_sort_dir: sortDir,
    });

    if (error) {
      setError(error.message || "Couldn't load transactions. Please try again.");
      setTransactions([]);
      setTotalCount(0);
    } else {
      setTransactions(data || []);
      setTotalCount(data?.[0]?.total_count ?? 0);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadTransactions();
  }, [selectedBranch, page, search, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [selectedBranch, search, sortKey, sortDir]);

  function handleSortChange(key) {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  async function handleDelete(row) {
    const confirmed = window.confirm(`Delete receipt ${row.receipt_no}? This can't be undone.`);
    if (!confirmed) return;

    const { error } = await supabase.rpc("manage_transaction", {
      action: "delete",
      transaction_id: row.transaction_id,
    });

    if (error) {
      alert(error.message || "Couldn't delete this transaction.");
      return;
    }

    loadTransactions();
  }

  return (
    <div className="min-h-screen bg-backgroundAlt">
      <Dock />

      <main className="pt-24 px-6 pb-12">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-2xl text-secondary">Transactions</h1>
              <p className="mt-1 text-sm text-muted">
                {loading ? "Loading records..." : `${totalCount} transaction${totalCount === 1 ? "" : "s"}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search receipt no, payee, or roll no"
                  className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-4 text-sm text-text placeholder:text-muted/60 focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <Button onClick={() => setShowAdd(true)}>Add Transaction</Button>
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          {loading ? (
            <TableSkeleton />
          ) : (
            <Table
              columns={columns}
              data={transactions}
              emptyMessage={search ? `No transactions match "${search}".` : "No transactions recorded yet."}
              onView={(row) => setModal({ mode: "view", transaction: row })}
              onEdit={(row) => setModal({ mode: "edit", transaction: row })}
              onDelete={handleDelete}
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              onPageChange={setPage}
              sortKey={sortKey}
              sortDir={sortDir}
              onSortChange={handleSortChange}
            />
          )}
        </div>
      </main>

      {modal && (
        <TransactionModal
          mode={modal.mode}
          transaction={modal.transaction}
          onClose={() => setModal(null)}
          onSaved={loadTransactions}
        />
      )}

      {showAdd && (
        <AddTransactionModal onClose={() => setShowAdd(false)} onSaved={loadTransactions} />
      )}
    </div>
  );
}