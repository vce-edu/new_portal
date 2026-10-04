import { useEffect, useRef, useState } from "react";
import {
  ArrowRightLeft,
  RotateCcw,
  CreditCard,
  Trash2,
  Printer,
  UserCheck,
  UserX,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";

// selection is keyed by row.id, then row.roll_number; rows with neither fall back to their index
const rowKey = (row, i) => row.id ?? row.roll_number ?? i;

export default function Table({
  columns,
  data,
  emptyMessage = "No records found.",
  onView,
  onPay,
  onMoveToBreak,
  onRestore,
  renderRowActions,
  onTogglePresent,
  onPrint,
  onTransfer,
  onDelete,
  onBulkDelete,
  onBulkMove,
  page,
  pageSize,
  totalCount,
  onPageChange,
  sortKey,
  sortDir,
  onSortChange,
}) {
  const showActions = Boolean(
    onPay ||
      onMoveToBreak ||
      onRestore ||
      renderRowActions ||
      onTogglePresent ||
      onPrint ||
      onTransfer ||
      onDelete
  );
  const showPagination = totalCount != null && onPageChange;
  // checkboxes only appear when the parent supplies a bulk handler
  const selectable = Boolean(onBulkDelete || onBulkMove);

  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());

  function updateScrollState() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth - 2);
  }

  useEffect(() => {
    const raf = requestAnimationFrame(updateScrollState);
    window.addEventListener("resize", updateScrollState);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [data, columns]);

  // selection only ever covers rows that are on screen: when the data changes
  // (page change, filters, refetch after a delete/move) drop keys that are gone
  useEffect(() => {
    setSelectedKeys((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(data.map(rowKey));
      const next = new Set([...prev].filter((k) => present.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [data]);

  function scrollBy(amount) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: amount, behavior: "smooth" });
    const start = performance.now();
    function poll(now) {
      updateScrollState();
      if (now - start < 400) requestAnimationFrame(poll);
    }
    requestAnimationFrame(poll);
  }

  const selectedRows = selectable ? data.filter((r, i) => selectedKeys.has(rowKey(r, i))) : [];
  const unselectedRows = selectable ? data.filter((r, i) => !selectedKeys.has(rowKey(r, i))) : [];
  const selectedCount = selectedRows.length;
  const allSelected = data.length > 0 && selectedCount === data.length;
  const someSelected = selectedCount > 0 && !allSelected;

  function toggleRow(key) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelectedKeys(allSelected ? new Set() : new Set(data.map(rowKey)));
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  function handleBulkDelete() {
    if (selectedRows.length === 0) return;
    onBulkDelete(selectedRows);
  }

  function handleBulkMove() {
    if (selectedRows.length === 0) return;
    // the parent's modal asks whether to move the selected or the unselected rows
    onBulkMove(selectedRows, unselectedRows);
  }

  const totalPages = showPagination ? Math.max(Math.ceil(totalCount / pageSize), 1) : 1;
  const rangeStart = showPagination && totalCount > 0 ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = showPagination ? Math.min(page * pageSize, totalCount) : 0;

  const actionBtn =
    "flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-primaryLight hover:text-primary";

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between gap-2">
        {selectedCount > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-secondary">{selectedCount} selected</span>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-primaryLight"
            >
              Deselect all
            </button>
            {onBulkMove && (
              <button
                type="button"
                onClick={handleBulkMove}
                className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-primaryLight hover:text-primary"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" strokeWidth={2} />
                Transfer
              </button>
            )}
            {onBulkDelete && (
              <button
                type="button"
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                Delete all
              </button>
            )}
          </div>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Scroll left"
            disabled={!canScrollLeft}
            onClick={() => scrollBy(-240)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-secondary transition-colors hover:bg-primaryLight disabled:opacity-30 disabled:hover:bg-background disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            disabled={!canScrollRight}
            onClick={() => scrollBy(240)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-secondary transition-colors hover:bg-primaryLight disabled:opacity-30 disabled:hover:bg-background disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <div className="w-full overflow-hidden rounded-xl border border-border bg-background">
        <div ref={scrollRef} onScroll={updateScrollState} className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="bg-backgroundAlt">
                {selectable && (
                  <th className="w-10 border-b border-border px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      aria-label="Select all rows"
                      checked={allSelected}
                      disabled={data.length === 0}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
                    />
                  </th>
                )}
                {columns.map((col) => {
                  const isSortable = col.sortable && onSortChange;
                  const isActive = isSortable && sortKey === col.key;

                  if (!isSortable) {
                    return (
                      <th
                        key={col.key}
                        className="whitespace-nowrap border-b border-border px-4 py-3 text-left text-xs font-medium text-muted"
                      >
                        {col.label}
                      </th>
                    );
                  }

                  return (
                    <th
                      key={col.key}
                      className="whitespace-nowrap border-b border-border px-4 py-3 text-left text-xs font-medium text-muted"
                    >
                      <button
                        type="button"
                        onClick={() => onSortChange(col.key)}
                        className="flex items-center gap-1 transition-colors hover:text-primary"
                      >
                        {col.label}
                        {isActive ? (
                          sortDir === "asc" ? (
                            <ChevronUp className="h-3.5 w-3.5 text-primary" strokeWidth={2.4} />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-primary" strokeWidth={2.4} />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 text-muted/50" strokeWidth={2} />
                        )}
                      </button>
                    </th>
                  );
                })}
                {showActions && (
                  <th className="sticky right-0 z-10 whitespace-nowrap border-b border-l border-border bg-backgroundAlt px-4 py-3 text-right text-xs font-medium text-muted shadow-[-6px_0_6px_-6px_rgba(17,24,39,0.1)]">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {data.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (showActions ? 1 : 0) + (selectable ? 1 : 0)}
                    className="px-4 py-10 text-center text-sm text-muted"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                data.map((row, i) => {
                  const key = rowKey(row, i);
                  const isSelected = selectable && selectedKeys.has(key);

                  return (
                    <tr
                      key={key}
                      onClick={() => onView && onView(row)}
                      className={[
                        "group transition-colors",
                        isSelected ? "bg-primaryLight" : "hover:bg-primaryLight/50",
                        onView ? "cursor-pointer" : "",
                      ].join(" ")}
                    >
                      {selectable && (
                        <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label="Select row"
                            checked={isSelected}
                            onChange={() => toggleRow(key)}
                            className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
                          />
                        </td>
                      )}

                      {columns.map((col) => (
                        <td key={col.key} className="whitespace-nowrap px-4 py-3 text-text">
                          {col.render ? col.render(row) : row[col.key]}
                        </td>
                      ))}

                      {showActions && (
                        <td
                          className={[
                            "sticky right-0 z-10 whitespace-nowrap border-l border-border px-4 py-3 shadow-[-6px_0_6px_-6px_rgba(17,24,39,0.1)] transition-colors group-hover:bg-primaryLight",
                            isSelected ? "bg-primaryLight" : "bg-background",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-end gap-1">
                            {/* always visible */}
                            {renderRowActions && renderRowActions(row)}
                            {/* buttons appear on row hover */}
                            <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                              {onPay && (
                                <button
                                  type="button"
                                  aria-label="Pay"
                                  title="Pay"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onPay(row);
                                  }}
                                  className={actionBtn}
                                >
                                  <CreditCard className="h-4 w-4" strokeWidth={2} />
                                </button>
                              )}
                              {onMoveToBreak && (
                                <button
                                  type="button"
                                  aria-label="Transfer"
                                  title="Transfer to Break / Discontinued"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onMoveToBreak(row);
                                  }}
                                  className={actionBtn}
                                >
                                  <ArrowRightLeft className="h-4 w-4" strokeWidth={2} />
                                </button>
                              )}
                              {onRestore && (
                                <button
                                  type="button"
                                  aria-label="Restore"
                                  title="Restore to live students"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRestore(row);
                                  }}
                                  className={actionBtn}
                                >
                                  <RotateCcw className="h-4 w-4" strokeWidth={2} />
                                </button>
                              )}
                              {onTogglePresent && (
                                <button
                                  type="button"
                                  aria-label={row.present ? "Mark absent" : "Mark present"}
                                  title={row.present ? "Present - click to mark absent" : "Mark present"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onTogglePresent(row);
                                  }}
                                  className={
                                    row.present
                                      ? "flex h-8 w-8 items-center justify-center rounded-full text-green-600 transition-colors hover:bg-green-50"
                                      : actionBtn
                                  }
                                >
                                  {row.present ? (
                                    <UserX className="h-4 w-4" strokeWidth={2} />
                                  ) : (
                                    <UserCheck className="h-4 w-4" strokeWidth={2} />
                                  )}
                                </button>
                              )}
                              {onPrint && (
                                <button
                                  type="button"
                                  aria-label="Print admit card"
                                  title="Print admit card"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onPrint(row);
                                  }}
                                  className={actionBtn}
                                >
                                  <Printer className="h-4 w-4" strokeWidth={2} />
                                </button>
                              )}
                              {onTransfer && (
                                <button
                                  type="button"
                                  aria-label="Transfer to students"
                                  title="Transfer to students"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onTransfer(row);
                                  }}
                                  className={actionBtn}
                                >
                                  <ArrowLeftRight className="h-4 w-4" strokeWidth={2} />
                                </button>
                              )}
                              {onDelete && (
                                <button
                                  type="button"
                                  aria-label="Delete"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(row);
                                  }}
                                  className="flex h-8 w-8 items-center justify-center rounded-full text-red-500 transition-colors hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" strokeWidth={2} />
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {showPagination && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-sm text-muted">
              {totalCount > 0 ? `Showing ${rangeStart}–${rangeEnd} of ${totalCount}` : "No records"}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-secondary transition-colors hover:bg-primaryLight disabled:opacity-30 disabled:hover:bg-background disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
              </button>
              <p className="text-sm text-muted">
                Page {page} of {totalPages}
              </p>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-secondary transition-colors hover:bg-primaryLight disabled:opacity-30 disabled:hover:bg-background disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}