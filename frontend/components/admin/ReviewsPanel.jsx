import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/icons/Icon";
import { AdminEmpty } from "./SharedUI";

/**
 * The Reviews screen.
 *
 * It used to be the generic record list: every row read "reviews item", the only
 * way to approve one was to open it and save, and 1,563 imported reviews meant 63
 * pages of that. There was no way to select rows, no way to get the reviews out,
 * and the only way in was a management command on the server.
 *
 * So: a real table with tick boxes, bulk approve/unapprove/delete that can reach
 * past the rendered page to every review matching the filters, an export the
 * client can open in Excel, and an importer that reads that same file back.
 */

const STATUS_OPTIONS = [
  ["", "All statuses"],
  ["approved", "Approved"],
  ["pending", "Pending moderation"],
];

const RATING_OPTIONS = [
  ["", "All ratings"],
  ["5", "5 stars"],
  ["4", "4 stars"],
  ["3", "3 stars"],
  ["2", "2 stars"],
  ["1", "1 star"],
];

const BULK_ACTIONS = [
  { value: "approve", label: "Approve", verb: "Approve" },
  { value: "unapprove", label: "Move to pending", verb: "Move to pending" },
  { value: "delete", label: "Delete", verb: "Delete", danger: true },
];

function stars(rating) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  return "★".repeat(value) + "☆".repeat(5 - value);
}

function excerpt(text, limit = 140) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trimEnd()}…`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function ReviewsPanel({
  rows,
  totalCount,
  page,
  totalPages,
  onPageChange,
  searchQuery,
  onSearchChange,
  filters,
  onFiltersChange,
  canCreate,
  canEdit,
  canDelete,
  onCreate,
  onEdit,
  onDelete,
  onExport,
  exportBusy,
  onImport,
  onBulkAction,
}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const selectAllRef = useRef(null);

  const visibleIds = useMemo(() => rows.map((row) => row.id).filter(Boolean), [rows]);
  const pageSelected = visibleIds.filter((id) => selectedIds.has(id));
  const allOnPageSelected = visibleIds.length > 0 && pageSelected.length === visibleIds.length;
  const partiallySelected = pageSelected.length > 0 && !allOnPageSelected;
  const matchingCount = Number.isFinite(Number(totalCount)) ? Number(totalCount) : rows.length;
  const affectedCount = selectAllMatching ? matchingCount : selectedIds.size;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = partiallySelected;
  }, [partiallySelected]);

  // A filter change redraws the list under the selection. Ticks made before it
  // would survive into a list that no longer shows them — and "Delete 40" with
  // 38 of them off screen is not something anyone meant to click. Start over.
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
  }, [searchQuery, filters?.status, filters?.rating]);

  function clearSelection() {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
  }

  function toggleRow(id) {
    setSelectAllMatching(false);
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelectAllMatching(false);
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allOnPageSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function runBulk(action) {
    const entry = BULK_ACTIONS.find((item) => item.value === action);
    if (!entry || !affectedCount) return;
    const target = `${affectedCount} review${affectedCount === 1 ? "" : "s"}`;
    const warning = action === "delete" ? "\n\nThis cannot be undone." : "";
    if (!window.confirm(`${entry.verb} ${target}?${warning}`)) return;

    setBulkWorking(true);
    try {
      await onBulkAction({
        action,
        ids: selectAllMatching ? [] : Array.from(selectedIds),
        selectAll: selectAllMatching,
      });
      clearSelection();
    } finally {
      setBulkWorking(false);
    }
  }

  const isBusy = Boolean(exportBusy);

  return (
    <section className="admin-panel-card">
      <div className="admin-panel-head">
        <div>
          <h3>Reviews</h3>
          <span>
            {matchingCount} review{matchingCount === 1 ? "" : "s"}
            {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""}
          </span>
        </div>
        <div className="admin-panel-head-actions">
          <div className="admin-export-controls">
            {canEdit ? (
              <button type="button" className="admin-btn-sm" onClick={() => setImportOpen(true)}>
                <Icon name="upload" size={14} />
                Import
              </button>
            ) : null}
            <button
              type="button"
              className="admin-btn-sm"
              disabled={isBusy}
              onClick={() => onExport({ format: "csv" })}
              title="Every review matching the filters below — one row each, opens in Excel."
            >
              <Icon name="download" size={14} />
              {exportBusy === "csv" ? "Preparing…" : "Export all (CSV)"}
            </button>
            <button
              type="button"
              className="admin-btn-sm"
              disabled={isBusy}
              onClick={() => onExport({ format: "xlsx" })}
              title="Every review matching the filters below, as an Excel workbook."
            >
              <Icon name="download" size={14} />
              {exportBusy === "xlsx" ? "Preparing…" : "Export all (Excel)"}
            </button>
          </div>
          {canCreate ? (
            <button type="button" className="admin-btn-primary" onClick={onCreate}>
              + Add review
            </button>
          ) : null}
        </div>
      </div>

      <div className="admin-search-bar">
        <input
          type="text"
          className="admin-input"
          placeholder="Search reviewer, title, text or product…"
          value={searchQuery || ""}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="admin-top-products-filters admin-orders-filters">
        <label className="admin-filter-field">
          <span>Status</span>
          <select
            className="admin-filter-select"
            value={filters?.status || ""}
            onChange={(e) => onFiltersChange({ status: e.target.value })}
            aria-label="Review status filter"
          >
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value || "all"} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="admin-filter-field">
          <span>Rating</span>
          <select
            className="admin-filter-select"
            value={filters?.rating || ""}
            onChange={(e) => onFiltersChange({ rating: e.target.value })}
            aria-label="Review rating filter"
          >
            {RATING_OPTIONS.map(([value, label]) => (
              <option key={value || "all"} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="admin-record-list">
        {rows.length ? (
          <div className="admin-orders-table-wrap">
            {selectedIds.size > 0 ? (
              <div className="admin-bulk-bar">
                <span>
                  <strong>{affectedCount}</strong> selected
                  {selectAllMatching ? " (everything matching the filters)" : ""}
                </span>
                {BULK_ACTIONS.map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    className={`admin-btn-sm${entry.danger ? " danger" : ""}`}
                    disabled={bulkWorking}
                    onClick={() => runBulk(entry.value)}
                  >
                    {entry.label}
                  </button>
                ))}
                {!selectAllMatching ? (
                  <button
                    type="button"
                    className="admin-btn-sm"
                    disabled={bulkWorking || isBusy}
                    onClick={() => onExport({ format: "csv", ids: Array.from(selectedIds) })}
                    title="Only the ticked reviews. For the whole list use “Export all” above."
                  >
                    Export selected ({selectedIds.size})
                  </button>
                ) : null}
                {/* The page holds 25 rows; approving an imported batch means
                    reaching the other 1,538 without clicking through 62 pages. */}
                {allOnPageSelected && !selectAllMatching && matchingCount > visibleIds.length ? (
                  <button
                    type="button"
                    className="admin-btn-sm"
                    disabled={bulkWorking}
                    onClick={() => setSelectAllMatching(true)}
                  >
                    Select all {matchingCount} matching
                  </button>
                ) : null}
                <button type="button" className="admin-btn-sm" onClick={clearSelection} disabled={bulkWorking}>
                  Clear
                </button>
              </div>
            ) : null}

            <table className="admin-orders-table admin-reviews-table">
              <thead>
                <tr>
                  <th className="checkbox-col">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={togglePage}
                      aria-label="Select every review on this page"
                    />
                  </th>
                  <th className="reviewer-col">Reviewer</th>
                  <th className="product-col">Product</th>
                  <th className="rating-col">Rating</th>
                  <th className="review-col">Review</th>
                  <th className="status-col">Status</th>
                  <th className="date-col">Date</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((review) => {
                  const images = Array.isArray(review.images) ? review.images : [];
                  return (
                    <tr key={review.id}>
                      <td className="checkbox-col">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(review.id)}
                          onChange={() => toggleRow(review.id)}
                          aria-label={`Select review by ${review.customer_name || "customer"}`}
                        />
                      </td>
                      <td className="reviewer-col">
                        <div className="admin-order-customer">
                          <strong>{review.customer_name || "Anonymous"}</strong>
                          <span>
                            {review.is_verified_purchase ? "Verified purchase" : "Unverified"}
                            {images.length ? ` · ${images.length} photo${images.length === 1 ? "" : "s"}` : ""}
                          </span>
                        </div>
                      </td>
                      <td className="product-col">{review.product_name || `Product #${review.product}`}</td>
                      <td className="rating-col admin-review-stars" title={`${review.rating} out of 5`}>
                        {stars(review.rating)}
                      </td>
                      <td className="review-col">
                        <div className="admin-review-text">
                          {review.title ? <strong>{review.title}</strong> : null}
                          <span>{excerpt(review.comment) || "—"}</span>
                        </div>
                      </td>
                      <td className="status-col">
                        <span className={`admin-badge ${review.is_approved ? "success" : "warning"}`}>
                          {review.is_approved ? "Approved" : "Pending"}
                        </span>
                      </td>
                      <td className="date-col">{formatDate(review.created_at)}</td>
                      <td className="actions-col">
                        <div className="admin-row-actions">
                          {canEdit ? (
                            <button type="button" className="admin-btn-sm" onClick={() => onEdit(review)}>
                              Edit
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button type="button" className="admin-btn-sm danger" onClick={() => onDelete(review)}>
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <AdminEmpty label="reviews" />
        )}
      </div>

      {totalPages > 1 ? (
        <div className="admin-pagination">
          <button type="button" className="admin-btn-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>← Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button type="button" className="admin-btn-sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next →</button>
        </div>
      ) : null}

      {importOpen ? (
        <ReviewImportModal onClose={() => setImportOpen(false)} onImport={onImport} />
      ) : null}
    </section>
  );
}

/**
 * Upload dialog.
 *
 * "Preview" runs the same parse with dry_run set, which is the only safe way to
 * find out what a file actually contains before it lands in the live catalogue —
 * a Judge.me export whose handles no longer match would otherwise import as a
 * silent zero.
 */
function ReviewImportModal({ onClose, onImport }) {
  const [file, setFile] = useState(null);
  const [defaultApproved, setDefaultApproved] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [backfillImages, setBackfillImages] = useState(true);
  const [working, setWorking] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function run(dryRun) {
    if (!file) {
      setError("Choose a .csv or .xlsx file first.");
      return;
    }
    setWorking(dryRun ? "preview" : "import");
    setError("");
    try {
      const stats = await onImport(file, {
        dryRun,
        defaultApproved,
        updateExisting,
        backfillImages,
      });
      setResult(stats);
    } catch (err) {
      setError(err.message || "Import failed.");
      setResult(null);
    } finally {
      setWorking("");
    }
  }

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="admin-modal admin-modal--import">
        <div className="admin-modal-head">
          <div>
            <p className="admin-modal-eyebrow">Reviews</p>
            <h2>Import reviews</h2>
            <span className="admin-modal-meta">
              A .csv or .xlsx file. Both the file this screen exports and a Judge.me /
              Shopify review export are understood.
            </span>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="admin-import-body">
          <input
            type="file"
            accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); setError(""); }}
          />

          <label className="admin-export-toggle">
            <input type="checkbox" checked={defaultApproved} onChange={(e) => setDefaultApproved(e.target.checked)} />
            <span>Publish new reviews straight away (a status column in the file still wins)</span>
          </label>
          <label className="admin-export-toggle">
            <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
            <span>Update reviews the file already carries an id for</span>
          </label>
          <label className="admin-export-toggle">
            <input type="checkbox" checked={backfillImages} onChange={(e) => setBackfillImages(e.target.checked)} />
            <span>Add photos to matching reviews that have none</span>
          </label>

          {error ? <p className="admin-import-error">{error}</p> : null}

          {result ? (
            <div className="admin-import-result">
              <strong>
                {result.dry_run ? "Preview — nothing was saved" : "Import finished"}
              </strong>
              <ul>
                <li>{result.rows} row{result.rows === 1 ? "" : "s"} read</li>
                <li>{result.created} created · {result.updated} updated</li>
                <li>
                  {result.skipped_duplicate} already present · {result.skipped_no_product} without a
                  matching product · {result.skipped_invalid} unusable
                </li>
                {result.images_backfilled ? <li>{result.images_backfilled} review(s) gained photos</li> : null}
                <li>{result.products_touched} product rating{result.products_touched === 1 ? "" : "s"} recalculated</li>
              </ul>
              {result.unmatched_products?.length ? (
                <div className="admin-import-warning">
                  <strong>No product answers to these — their reviews were skipped:</strong>
                  <ul>
                    {result.unmatched_products.map((entry) => (
                      <li key={entry.value}>{entry.value} ({entry.rows} row{entry.rows === 1 ? "" : "s"})</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {result.messages?.length ? (
                <div className="admin-import-warning">
                  <strong>Rows that could not be read:</strong>
                  <ul>
                    {result.messages.map((message) => <li key={message}>{message}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn-sm" disabled={Boolean(working)} onClick={() => run(true)}>
            {working === "preview" ? "Checking…" : "Preview first"}
          </button>
          <button type="button" className="admin-btn-primary" disabled={Boolean(working)} onClick={() => run(false)}>
            {working === "import" ? "Importing…" : "Import"}
          </button>
          <button type="button" className="admin-btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
