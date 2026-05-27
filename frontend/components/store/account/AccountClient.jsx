"use client";

import { useCallback, useEffect, useState } from "react";

import Icon from "@/components/icons/Icon";
import { buildStorePath, formatMoney, uiText } from "@/lib/storefront";
import { API_BASE_URL, CUSTOMER_TOKEN_KEY, CUSTOMER_REFRESH_KEY } from "@/lib/config";
import { appendRegionQuery } from "@/lib/regionResolver";

const API_BASE = API_BASE_URL;
const TOKEN_KEY = CUSTOMER_TOKEN_KEY;
const REFRESH_KEY = CUSTOMER_REFRESH_KEY;

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}
function setTokens(access, refresh) {
  try {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  } catch {}
}
function clearTokens() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {}
}

async function authFetch(path, options = {}) {
  const token = getToken();
  const { region, ...fetchOptions } = options;
  const requestPath = region ? appendRegionQuery(path, region) : path;
  const res = await fetch(`${API_BASE}${requestPath}`, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(fetchOptions.headers || {}),
    },
  });
  return res;
}

export default function AccountClient({ locale, region }) {
  const t = uiText(locale);
  const isAr = locale === "ar";

  const [view, setView] = useState("login"); // login | register | profile
  const [profile, setProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeReturnOrder, setActiveReturnOrder] = useState("");
  const [returnReasonByOrder, setReturnReasonByOrder] = useState({});
  const [returnSubmittingOrder, setReturnSubmittingOrder] = useState("");
  const [returnErrorByOrder, setReturnErrorByOrder] = useState({});
  const [returnSuccessByOrder, setReturnSuccessByOrder] = useState({});

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [regForm, setRegForm] = useState({ username: "", email: "", password: "", password2: "" });

  const loadProfile = useCallback(async () => {
    const res = await authFetch("/account/profile/", { region });
    if (!res.ok) { clearTokens(); return null; }
    return res.json();
  }, [region]);

  const loadOrders = useCallback(async () => {
    const res = await authFetch("/account/orders/", { region });
    if (!res.ok) return [];
    return res.json();
  }, [region]);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    Promise.all([loadProfile(), loadOrders()]).then(([p, o]) => {
      if (p) { setProfile(p); setOrders(o || []); setView("profile"); }
      setLoading(false);
    });
  }, [loadProfile, loadOrders]);

  async function handleLogin(e) {
    e.preventDefault();
    setError(""); setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}${appendRegionQuery("/auth/token/", region)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginForm.username, password: loginForm.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || isAr ? "بيانات الدخول غير صحيحة" : "Invalid credentials");
      setTokens(data.access, data.refresh);
      const [p, o] = await Promise.all([loadProfile(), loadOrders()]);
      if (p) { setProfile(p); setOrders(o || []); setView("profile"); }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError(""); setSubmitting(true);
    if (regForm.password !== regForm.password2) {
      setError(isAr ? "كلمتا المرور غير متطابقتين" : "Passwords do not match");
      setSubmitting(false); return;
    }
    try {
      const res = await fetch(`${API_BASE}${appendRegionQuery("/auth/register/", region)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: regForm.username, email: regForm.email, password: regForm.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data === "object" ? Object.values(data).flat().join(", ") : String(data);
        throw new Error(msg);
      }
      setSuccess(isAr ? "تم إنشاء حسابك! سجّل دخولك الآن." : "Account created! Please log in.");
      setView("login");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogout() {
    clearTokens(); setProfile(null); setOrders([]); setView("login");
  }

  function hasOpenReturnRequest(order) {
    const requests = Array.isArray(order?.return_requests) ? order.return_requests : [];
    return requests.some((item) => ["requested", "approved"].includes(String(item?.status || "").toLowerCase()));
  }

  function canRequestReturn(order) {
    const status = String(order?.status || "").toLowerCase();
    return ["shipped", "delivered"].includes(status) && !hasOpenReturnRequest(order);
  }

  async function submitReturnRequest(orderNumber) {
    const reason = String(returnReasonByOrder[orderNumber] || "").trim();
    if (reason.length < 10) {
      setReturnErrorByOrder((prev) => ({
        ...prev,
        [orderNumber]: isAr ? "يرجى كتابة سبب لا يقل عن 10 أحرف." : "Please enter at least 10 characters.",
      }));
      return;
    }

    setReturnSubmittingOrder(orderNumber);
    setReturnErrorByOrder((prev) => ({ ...prev, [orderNumber]: "" }));
    setReturnSuccessByOrder((prev) => ({ ...prev, [orderNumber]: "" }));
    try {
      const response = await authFetch(`/account/orders/${orderNumber}/returns/`, {
        method: "POST",
        region,
        body: JSON.stringify({ reason }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.detail || payload?.reason?.[0] || (isAr ? "تعذر إرسال طلب الإرجاع." : "Unable to submit return request."));
      }
      setReturnSuccessByOrder((prev) => ({
        ...prev,
        [orderNumber]: isAr ? "تم إرسال طلب الإرجاع." : "Return request submitted.",
      }));
      setReturnReasonByOrder((prev) => ({ ...prev, [orderNumber]: "" }));
      setActiveReturnOrder("");
      const refreshed = await loadOrders();
      setOrders(refreshed || []);
    } catch (err) {
      setReturnErrorByOrder((prev) => ({
        ...prev,
        [orderNumber]: err.message || (isAr ? "حدث خطأ غير متوقع." : "Unexpected error."),
      }));
    } finally {
      setReturnSubmittingOrder("");
    }
  }

  if (loading) {
    return (
      <section className="section-shell">
        <div className="account-loading">
          <span className="btn-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
        </div>
      </section>
    );
  }

  if (view === "profile" && profile) {
    return (
      <section className="section-shell">
        <div className="account-layout">
          <div className="account-header">
            <div>
              <h1 className="account-title">{isAr ? "حسابي" : "My Account"}</h1>
              <p className="account-sub">{profile.email || profile.username}</p>
            </div>
            <button type="button" className="secondary-action" onClick={handleLogout}>
              {isAr ? "تسجيل الخروج" : "Log out"}
            </button>
          </div>

          <div className="account-section">
            <h2>{isAr ? "سجل الطلبات" : "Order History"}</h2>
            {orders.length === 0 ? (
              <p className="account-empty">{isAr ? "لا توجد طلبات بعد." : "No orders yet."}</p>
            ) : (
              <div className="order-list">
                {orders.map((order) => (
                  <div key={order.order_number} className="order-row">
                    <div className="order-row-meta">
                      <strong className="order-number">{order.order_number}</strong>
                      <span className="order-date">{order.created_at?.slice(0, 10)}</span>
                    </div>
                    <div className="order-row-badges">
                      <span className={`order-status-badge status-${order.status}`}>
                        {order.status}
                      </span>
                      <span className={`order-status-badge payment-${order.payment_status}`}>
                        {order.payment_status}
                      </span>
                    </div>
                    <strong className="order-total">
                      {order.grand_total} {order.currency_code}
                    </strong>
                    <div className="order-row-actions">
                      <a
                        href={`${buildStorePath(locale, `/thank-you/${order.order_number}`, region)}&email_or_phone=${encodeURIComponent(profile.email || "")}`}
                        className="order-view-link"
                      >
                        {isAr ? "عرض" : "View"}
                      </a>
                      {order.invoice_download_url && order.payment_status === "paid" ? (
                        <a
                          href={order.invoice_download_url}
                          className="order-view-link"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {isAr ? "فاتورة" : "Invoice"}
                        </a>
                      ) : null}
                      {order.tracking_url ? (
                        <a
                          href={order.tracking_url}
                          className="order-view-link"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {isAr ? "تتبع" : "Track"}
                        </a>
                      ) : null}
                      {canRequestReturn(order) ? (
                        <button
                          type="button"
                          className="order-view-link"
                          style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0 }}
                          onClick={() => setActiveReturnOrder((current) => (current === order.order_number ? "" : order.order_number))}
                        >
                          {isAr ? "طلب إرجاع" : "Request Return"}
                        </button>
                      ) : null}
                    </div>
                    {hasOpenReturnRequest(order) ? (
                      <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "var(--text-soft)" }}>
                        {isAr ? "طلب الإرجاع قيد المراجعة." : "Return request is under review."}
                      </p>
                    ) : null}
                    {returnSuccessByOrder[order.order_number] ? (
                      <p className="form-success" style={{ marginTop: 8 }}>{returnSuccessByOrder[order.order_number]}</p>
                    ) : null}
                    {activeReturnOrder === order.order_number ? (
                      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                        <textarea
                          value={returnReasonByOrder[order.order_number] || ""}
                          onChange={(e) =>
                            setReturnReasonByOrder((prev) => ({
                              ...prev,
                              [order.order_number]: e.target.value,
                            }))
                          }
                          placeholder={isAr ? "سبب الإرجاع" : "Reason for return"}
                          rows={3}
                          style={{
                            width: "100%",
                            border: "1px solid var(--line)",
                            borderRadius: "10px",
                            padding: "10px 12px",
                            font: "inherit",
                            resize: "vertical",
                          }}
                        />
                        {returnErrorByOrder[order.order_number] ? (
                          <p className="form-error" style={{ margin: 0 }}>{returnErrorByOrder[order.order_number]}</p>
                        ) : null}
                        <button
                          type="button"
                          className="secondary-action"
                          disabled={returnSubmittingOrder === order.order_number}
                          onClick={() => submitReturnRequest(order.order_number)}
                        >
                          {returnSubmittingOrder === order.order_number
                            ? (isAr ? "جارٍ الإرسال..." : "Submitting...")
                            : (isAr ? "إرسال الطلب" : "Submit Request")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section-shell">
      <div className="auth-card">
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${view === "login" ? "is-active" : ""}`}
            onClick={() => { setView("login"); setError(""); setSuccess(""); }}
          >
            {isAr ? "تسجيل الدخول" : "Log In"}
          </button>
          <button
            type="button"
            className={`auth-tab ${view === "register" ? "is-active" : ""}`}
            onClick={() => { setView("register"); setError(""); setSuccess(""); }}
          >
            {isAr ? "حساب جديد" : "Create Account"}
          </button>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {success ? <p className="form-success">{success}</p> : null}

        {view === "login" ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <label>
              {isAr ? "اسم المستخدم أو البريد" : "Username or email"}
              <input
                type="text"
                value={loginForm.username}
                onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value }))}
                required
                autoComplete="username"
                className="field-ltr"
              />
            </label>
            <label>
              {isAr ? "كلمة المرور" : "Password"}
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                required
                autoComplete="current-password"
              />
            </label>
            <button type="submit" className="primary-action full-width" disabled={submitting}>
              {submitting ? <span className="btn-spinner" /> : null}
              {isAr ? "دخول" : "Log In"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleRegister}>
            <label>
              {isAr ? "اسم المستخدم" : "Username"}
              <input
                type="text"
                value={regForm.username}
                onChange={(e) => setRegForm((f) => ({ ...f, username: e.target.value }))}
                required
                autoComplete="username"
                className="field-ltr"
              />
            </label>
            <label>
              {isAr ? "البريد الإلكتروني" : "Email"}
              <input
                type="email"
                value={regForm.email}
                onChange={(e) => setRegForm((f) => ({ ...f, email: e.target.value }))}
                required
                autoComplete="email"
                className="field-ltr"
              />
            </label>
            <label>
              {isAr ? "كلمة المرور" : "Password"}
              <input
                type="password"
                value={regForm.password}
                onChange={(e) => setRegForm((f) => ({ ...f, password: e.target.value }))}
                required
                autoComplete="new-password"
                minLength={8}
              />
            </label>
            <label>
              {isAr ? "تأكيد كلمة المرور" : "Confirm Password"}
              <input
                type="password"
                value={regForm.password2}
                onChange={(e) => setRegForm((f) => ({ ...f, password2: e.target.value }))}
                required
                autoComplete="new-password"
                minLength={8}
              />
            </label>
            <button type="submit" className="primary-action full-width" disabled={submitting}>
              {submitting ? <span className="btn-spinner" /> : null}
              {isAr ? "إنشاء حساب" : "Create Account"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
