"use client";

import { useEffect, useMemo, useState } from "react";

const MARKET_ORDER = ["om", "ae", "sa"];
const MARKET_LABELS = {
  om: "Oman",
  ae: "UAE",
  sa: "KSA/Saudi",
};

const EMPTY_CUSTOMER = {
  user_id: null,
  create_account: false,
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  address_line_1: "",
  address_line_2: "",
  area: "",
  city: "",
  postcode: "",
  country: "",
  location_notes: "",
  notes: "",
  tags: "",
};

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(amount, currencyCode) {
  const code = String(currencyCode || "").toUpperCase();
  const value = asNumber(amount);
  if (!code) return value.toFixed(2);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${code} ${value.toFixed(2)}`;
  }
}

function mapPaginated(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

function normalizeDraftItemsFromOrder(order) {
  const rows = Array.isArray(order?.items) ? order.items : [];
  return rows.map((item) => ({
    slug: item.product_slug || "",
    name: item.product_name || item.product_slug || "Product",
    quantity: Math.max(1, asNumber(item.quantity || 1)),
    unit_price: asNumber(item.unit_price),
    line_total: asNumber(item.line_total),
    image: item.product_image || "",
    selected_options_text: item.variant || "",
  }));
}

export default function DraftOrderComposer({
  request,
  initialOrder = null,
  onClose,
  onSaved,
}) {
  const isEditing = Boolean(initialOrder?.order_number);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState("");
  const [regions, setRegions] = useState([]);
  const [regionCode, setRegionCode] = useState("om");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER);
  const [items, setItems] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [productRows, setProductRows] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerRows, setCustomerRows] = useState([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const regionMap = useMemo(() => {
    const map = new Map();
    regions.forEach((region) => map.set(String(region.code || "").toLowerCase(), region));
    return map;
  }, [regions]);

  const activeRegion = regionMap.get(String(regionCode || "").toLowerCase()) || null;
  const currencyCode = String(activeRegion?.currency_code || initialOrder?.currency_code || "OMR").toUpperCase();
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + asNumber(item.unit_price) * Math.max(1, asNumber(item.quantity)), 0),
    [items],
  );

  useEffect(() => {
    let ignore = false;
    async function loadRegions() {
      try {
        const payload = await request("/admin/regions/");
        const rows = mapPaginated(payload)
          .filter((row) => row?.is_active !== false)
          .filter((row) => MARKET_ORDER.includes(String(row?.code || "").toLowerCase()))
          .sort((a, b) => MARKET_ORDER.indexOf(String(a.code || "").toLowerCase()) - MARKET_ORDER.indexOf(String(b.code || "").toLowerCase()));
        if (!ignore) setRegions(rows);
      } catch {
        if (!ignore) setRegions([]);
      }
    }
    void loadRegions();
    return () => {
      ignore = true;
    };
  }, [request]);

  useEffect(() => {
    const fromOrder = initialOrder || null;
    const nextRegion = String(fromOrder?.region_code || "om").toLowerCase();
    setRegionCode(nextRegion);
    setNotes(String(fromOrder?.notes || ""));
    setTags(String(fromOrder?.customer_snapshot?.tags || ""));
    setItems(fromOrder ? normalizeDraftItemsFromOrder(fromOrder) : []);
    setCustomer({
      ...EMPTY_CUSTOMER,
      user_id: fromOrder?.user || null,
      first_name: String(fromOrder?.customer_snapshot?.first_name || "").trim(),
      last_name: String(fromOrder?.customer_snapshot?.last_name || "").trim(),
      email: String(fromOrder?.customer_email || ""),
      phone: String(fromOrder?.customer_phone || ""),
      address_line_1: String(fromOrder?.address_line_1 || ""),
      address_line_2: String(fromOrder?.address_line_2 || ""),
      area: String(fromOrder?.area || ""),
      city: String(fromOrder?.city || ""),
      postcode: String(fromOrder?.postcode || ""),
      country: String(fromOrder?.country || ""),
      location_notes: String(fromOrder?.location_notes || ""),
      notes: String(fromOrder?.customer_snapshot?.notes || ""),
      tags: String(fromOrder?.customer_snapshot?.tags || ""),
      create_account: false,
    });
    setCustomerSearch(fromOrder?.customer_name || "");
  }, [initialOrder]);

  async function searchProducts(query) {
    const clean = String(query || "").trim();
    if (!clean) {
      setProductRows([]);
      return;
    }
    setProductsLoading(true);
    setErrors("");
    try {
      const payload = await request(`/admin/products/?search=${encodeURIComponent(clean)}`);
      const rows = mapPaginated(payload);
      const normalizedRegion = String(regionCode || "").toLowerCase();
      const mapped = rows
        .map((row) => {
          const prices = Array.isArray(row?.prices) ? row.prices : [];
          const matchedPrice = prices.find((price) => String(price?.region_code || "").toLowerCase() === normalizedRegion);
          if (!matchedPrice) return null;
          return {
            slug: row.slug,
            name: row.name_en || row.slug,
            unit_price: asNumber(matchedPrice.price),
            image: row.image || "",
          };
        })
        .filter(Boolean);
      setProductRows(mapped.slice(0, 15));
    } catch (err) {
      setErrors(err.message || "Failed to search products.");
    } finally {
      setProductsLoading(false);
    }
  }

  async function searchCustomers(query) {
    const clean = String(query || "").trim();
    if (!clean) {
      setCustomerRows([]);
      return;
    }
    setCustomerLoading(true);
    setErrors("");
    try {
      const payload = await request(`/admin/orders/drafts/customer-search/?q=${encodeURIComponent(clean)}&limit=12`);
      setCustomerRows(Array.isArray(payload?.results) ? payload.results : []);
    } catch (err) {
      setErrors(err.message || "Failed to search customers.");
    } finally {
      setCustomerLoading(false);
    }
  }

  function addProduct(product) {
    if (!product?.slug) return;
    setItems((prev) => {
      const index = prev.findIndex((item) => item.slug === product.slug);
      if (index === -1) {
        return [
          ...prev,
          {
            slug: product.slug,
            name: product.name,
            quantity: 1,
            unit_price: asNumber(product.unit_price),
            line_total: asNumber(product.unit_price),
            image: product.image || "",
            selected_options_text: "",
          },
        ];
      }
      const next = [...prev];
      const current = next[index];
      const nextQty = Math.max(1, asNumber(current.quantity) + 1);
      const nextUnit = asNumber(current.unit_price);
      next[index] = {
        ...current,
        quantity: nextQty,
        line_total: nextQty * nextUnit,
      };
      return next;
    });
  }

  function updateItemQuantity(index, quantityValue) {
    const nextQty = Math.max(1, asNumber(quantityValue));
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const unit = asNumber(current.unit_price);
      next[index] = {
        ...current,
        quantity: nextQty,
        line_total: unit * nextQty,
      };
      return next;
    });
  }

  function removeItem(index) {
    setItems((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  }

  function applyCustomerSelection(entry) {
    setShowCustomerDropdown(false);
    setCustomerSearch(entry?.label || entry?.name || "");
    setCustomer((prev) => ({
      ...prev,
      user_id: entry?.user_id || null,
      first_name: String(entry?.first_name || prev.first_name || ""),
      last_name: String(entry?.last_name || prev.last_name || ""),
      email: String(entry?.email || prev.email || ""),
      phone: String(entry?.phone || prev.phone || ""),
      address_line_1: String(entry?.address_line_1 || prev.address_line_1 || ""),
      address_line_2: String(entry?.address_line_2 || prev.address_line_2 || ""),
      area: String(entry?.area || prev.area || ""),
      city: String(entry?.city || prev.city || ""),
      postcode: String(entry?.postcode || prev.postcode || ""),
      country: String(entry?.country || prev.country || ""),
      create_account: false,
    }));
  }

  function startNewCustomer() {
    setShowCustomerDropdown(false);
    setCustomer({
      ...EMPTY_CUSTOMER,
      first_name: customer.first_name || customerSearch || "",
      create_account: true,
    });
  }

  async function saveDraft() {
    if (!items.length) {
      setErrors("Add at least one product before saving the draft.");
      return;
    }
    if (!regionCode) {
      setErrors("Select a market before saving.");
      return;
    }

    const payload = {
      region: regionCode,
      notes,
      customer: {
        ...customer,
        tags,
      },
      items: items.map((item) => ({
        slug: item.slug,
        quantity: Math.max(1, asNumber(item.quantity)),
        selected_options_text: item.selected_options_text || "",
      })),
    };

    setIsSaving(true);
    setErrors("");
    try {
      const targetPath = isEditing
        ? `/admin/orders/drafts/${initialOrder.order_number}/`
        : "/admin/orders/drafts/";
      const method = isEditing ? "PATCH" : "POST";
      const saved = await request(targetPath, { method, body: JSON.stringify(payload) });
      onSaved(saved);
    } catch (err) {
      setErrors(err.message || "Failed to save draft order.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="admin-draft-layout">
      <div className="admin-draft-header">
        <h3>{isEditing ? `Edit Draft ${initialOrder?.order_number || ""}` : "Create Order"}</h3>
        <div className="admin-draft-header-actions">
          <button type="button" className="admin-btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>

      {errors ? <p className="admin-draft-error">{errors}</p> : null}

      <div className="admin-draft-grid">
        <div className="admin-draft-main">
          <article className="admin-draft-card">
            <div className="admin-draft-card-head">
              <h4>Products</h4>
              <div className="admin-draft-card-tools">
                <input
                  className="admin-input"
                  placeholder="Search products..."
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchProducts(productSearch);
                    }
                  }}
                />
                <button type="button" className="admin-btn-sm" onClick={() => { void searchProducts(productSearch); }}>
                  Add product
                </button>
              </div>
            </div>
            {productsLoading ? <p className="admin-draft-hint">Searching products...</p> : null}
            {productRows.length ? (
              <div className="admin-draft-product-search">
                {productRows.map((row) => (
                  <button
                    key={`${row.slug}-${row.unit_price}`}
                    type="button"
                    className="admin-draft-search-row"
                    onClick={() => addProduct(row)}
                  >
                    <div>
                      <strong>{row.name}</strong>
                      <span>{row.slug}</span>
                    </div>
                    <span>{formatMoney(row.unit_price, currencyCode)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="admin-draft-lines">
              {items.length ? (
                items.map((item, index) => (
                  <div key={`${item.slug}-${index}`} className="admin-draft-line-row">
                    <div className="admin-draft-line-main">
                      {item.image ? <img src={item.image} alt={item.name} className="admin-record-thumb" /> : null}
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.slug}</span>
                      </div>
                    </div>
                    <span>{formatMoney(item.unit_price, currencyCode)}</span>
                    <input
                      className="admin-input admin-draft-qty"
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(event) => updateItemQuantity(index, event.target.value)}
                    />
                    <strong>{formatMoney(item.unit_price * item.quantity, currencyCode)}</strong>
                    <button type="button" className="admin-btn-sm danger" onClick={() => removeItem(index)}>
                      Remove
                    </button>
                  </div>
                ))
              ) : (
                <p className="admin-draft-hint">No products added yet.</p>
              )}
            </div>
          </article>

          <article className="admin-draft-card">
            <div className="admin-draft-card-head">
              <h4>Payment Summary</h4>
            </div>
            <div className="admin-draft-summary-grid">
              <span>Subtotal</span>
              <strong>{formatMoney(subtotal, currencyCode)}</strong>
              <span>Shipping</span>
              <strong>{isEditing ? formatMoney(initialOrder?.shipping_total || 0, currencyCode) : "Calculated on save"}</strong>
              <span>Tax</span>
              <strong>{isEditing ? formatMoney(initialOrder?.tax_total || 0, currencyCode) : "Calculated on save"}</strong>
              <span className="admin-draft-summary-total">Total</span>
              <strong className="admin-draft-summary-total">
                {isEditing ? formatMoney(initialOrder?.grand_total || subtotal, currencyCode) : formatMoney(subtotal, currencyCode)}
              </strong>
            </div>
            <div className="admin-draft-disabled-actions">
              <button type="button" className="admin-btn-sm" disabled>Send invoice (Future)</button>
              <button type="button" className="admin-btn-sm" disabled>Mark as paid (Use order status flow)</button>
            </div>
          </article>
        </div>

        <aside className="admin-draft-side">
          <article className="admin-draft-card">
            <div className="admin-draft-card-head">
              <h4>Notes</h4>
            </div>
            <textarea
              className="admin-input admin-textarea"
              placeholder="Add internal order notes..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </article>

          <article className="admin-draft-card">
            <div className="admin-draft-card-head">
              <h4>Customer</h4>
            </div>
            <input
              className="admin-input"
              placeholder="Search or create a customer"
              value={customerSearch}
              onFocus={() => setShowCustomerDropdown(true)}
              onChange={(event) => {
                setCustomerSearch(event.target.value);
                setShowCustomerDropdown(true);
                void searchCustomers(event.target.value);
              }}
            />
            {showCustomerDropdown ? (
              <div className="admin-draft-customer-dropdown">
                <button type="button" className="admin-draft-search-row create" onClick={startNewCustomer}>
                  <strong>Create a new customer</strong>
                </button>
                {customerLoading ? <p className="admin-draft-hint">Searching customers...</p> : null}
                {customerRows.map((entry, index) => (
                  <button
                    key={`${entry.type}-${entry.user_id || entry.email || entry.phone || index}`}
                    type="button"
                    className="admin-draft-search-row"
                    onClick={() => applyCustomerSelection(entry)}
                  >
                    <div>
                      <strong>{entry.label || entry.name || "Customer"}</strong>
                      <span>{entry.subtitle || entry.email || entry.phone || "—"}</span>
                    </div>
                    <span>{entry.type === "user" ? "Saved" : "History"}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="admin-draft-customer-form">
              <div className="admin-draft-two-col">
                <label className="admin-label">
                  First name
                  <input
                    className="admin-input"
                    value={customer.first_name}
                    onChange={(event) => setCustomer((prev) => ({ ...prev, first_name: event.target.value, user_id: prev.user_id }))}
                  />
                </label>
                <label className="admin-label">
                  Last name
                  <input
                    className="admin-input"
                    value={customer.last_name}
                    onChange={(event) => setCustomer((prev) => ({ ...prev, last_name: event.target.value, user_id: prev.user_id }))}
                  />
                </label>
              </div>
              <label className="admin-label">
                Email
                <input
                  className="admin-input"
                  type="email"
                  value={customer.email}
                  onChange={(event) => setCustomer((prev) => ({ ...prev, email: event.target.value }))}
                />
              </label>
              <label className="admin-label">
                Phone
                <input
                  className="admin-input"
                  value={customer.phone}
                  onChange={(event) => setCustomer((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </label>
              <label className="admin-label">
                Address
                <input
                  className="admin-input"
                  value={customer.address_line_1}
                  onChange={(event) => setCustomer((prev) => ({ ...prev, address_line_1: event.target.value }))}
                />
              </label>
              <div className="admin-draft-two-col">
                <label className="admin-label">
                  City
                  <input
                    className="admin-input"
                    value={customer.city}
                    onChange={(event) => setCustomer((prev) => ({ ...prev, city: event.target.value }))}
                  />
                </label>
                <label className="admin-label">
                  Country
                  <input
                    className="admin-input"
                    value={customer.country}
                    onChange={(event) => setCustomer((prev) => ({ ...prev, country: event.target.value }))}
                  />
                </label>
              </div>
              <label className="admin-label admin-check-label">
                <input
                  type="checkbox"
                  className="admin-checkbox"
                  checked={Boolean(customer.create_account)}
                  onChange={(event) => setCustomer((prev) => ({ ...prev, create_account: event.target.checked }))}
                />
                <span>Create or link customer account</span>
              </label>
            </div>
          </article>

          <article className="admin-draft-card">
            <div className="admin-draft-card-head">
              <h4>Market & Currency</h4>
            </div>
            <label className="admin-label">
              Market
              <select className="admin-input" value={regionCode} onChange={(event) => setRegionCode(event.target.value)}>
                {regions.map((region) => (
                  <option key={region.code} value={region.code}>
                    {MARKET_LABELS[String(region.code || "").toLowerCase()] || region.name_en || region.code}
                  </option>
                ))}
              </select>
            </label>
            <p className="admin-draft-hint">Currency: {currencyCode}</p>
          </article>

          <article className="admin-draft-card">
            <div className="admin-draft-card-head">
              <h4>Tags</h4>
            </div>
            <input
              className="admin-input"
              placeholder="Optional internal tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </article>
        </aside>
      </div>

      <div className="admin-draft-footer">
        <button type="button" className="admin-btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="admin-btn-primary" onClick={saveDraft} disabled={isSaving}>
          {isSaving ? "Saving..." : isEditing ? "Update Draft Order" : "Save as Draft Order"}
        </button>
      </div>
    </section>
  );
}
