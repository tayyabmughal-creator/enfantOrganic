"use client";
import { useState, useEffect, useRef } from "react";
import { API_BASE_URL, ADMIN_TOKEN_KEY } from "@/lib/config";
import { RevenueChart, DonutChart } from "./SharedUI";

const COUNTRY_META = {
  OM: { lon: 57.5,   lat: 21.0,  flag: "🇴🇲", name: "Oman" },
  AE: { lon: 54.0,   lat: 24.5,  flag: "🇦🇪", name: "UAE" },
  SA: { lon: 45.0,   lat: 24.0,  flag: "🇸🇦", name: "Saudi Arabia" },
  KW: { lon: 47.7,   lat: 29.3,  flag: "🇰🇼", name: "Kuwait" },
  BH: { lon: 50.6,   lat: 26.0,  flag: "🇧🇭", name: "Bahrain" },
  QA: { lon: 51.2,   lat: 25.3,  flag: "🇶🇦", name: "Qatar" },
  JO: { lon: 36.2,   lat: 30.6,  flag: "🇯🇴", name: "Jordan" },
  EG: { lon: 30.8,   lat: 26.8,  flag: "🇪🇬", name: "Egypt" },
  IN: { lon: 78.9,   lat: 20.6,  flag: "🇮🇳", name: "India" },
  PK: { lon: 69.3,   lat: 30.4,  flag: "🇵🇰", name: "Pakistan" },
  GB: { lon:  -2.0,  lat: 54.0,  flag: "🇬🇧", name: "UK" },
  DE: { lon:  10.5,  lat: 51.2,  flag: "🇩🇪", name: "Germany" },
  FR: { lon:   2.3,  lat: 46.2,  flag: "🇫🇷", name: "France" },
  NL: { lon:   5.3,  lat: 52.1,  flag: "🇳🇱", name: "Netherlands" },
  US: { lon: -100.0, lat: 38.0,  flag: "🇺🇸", name: "USA" },
  CA: { lon:  -96.0, lat: 56.0,  flag: "🇨🇦", name: "Canada" },
  AU: { lon:  133.0, lat: -25.0, flag: "🇦🇺", name: "Australia" },
  SG: { lon:  103.8, lat:   1.3, flag: "🇸🇬", name: "Singapore" },
};

const MAP_W = 620, MAP_H = 300;

function toXY(lon, lat) {
  return {
    x: ((lon + 180) / 360) * MAP_W,
    y: ((90 - lat) / 180) * MAP_H,
  };
}

function LiveVisitorsPanel() {
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  function fetchLive() {
    const token = typeof window !== "undefined" ? window.localStorage.getItem(ADMIN_TOKEN_KEY) : "";
    fetch(`${API_BASE_URL}/admin/analytics/live-visitors/`, {
      headers: { Authorization: token ? `Bearer ${token}` : "" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setLiveData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchLive();
    timerRef.current = setInterval(fetchLive, 30000);
    return () => clearInterval(timerRef.current);
  }, []);

  const countries = liveData?.countries || {};
  const countryEntries = Object.entries(countries).sort((a, b) => b[1] - a[1]);
  const totalLive = liveData?.live_sessions ?? 0;
  const windowMin = liveData?.window_minutes ?? 5;

  const activeDots = countryEntries
    .filter(([code]) => COUNTRY_META[code])
    .map(([code, count]) => {
      const meta = COUNTRY_META[code];
      const { x, y } = toXY(meta.lon, meta.lat);
      const r = Math.min(12, 5 + count * 2);
      return { code, count, x, y, r, ...meta };
    });

  return (
    <section className="admin-chart-card admin-live-visitors-card">
      <div className="admin-live-header">
        <h3>Live Visitors</h3>
        <span className="admin-live-badge">
          <span className="admin-live-pulse-dot" />
          {loading ? "—" : totalLive} online · last {windowMin} min
        </span>
      </div>

      <div className="admin-live-map-wrap">
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className="admin-live-map"
          aria-label="World map showing visitor locations"
        >
          {/* Ocean */}
          <rect width={MAP_W} height={MAP_H} fill="#dceef5" rx="10" />
          {/* Rough continent silhouettes */}
          {/* North America */}
          <ellipse cx="125" cy="105" rx="110" ry="72" fill="#c8dba0" opacity="0.7" />
          {/* South America */}
          <ellipse cx="168" cy="218" rx="52" ry="60" fill="#c8dba0" opacity="0.7" />
          {/* Europe */}
          <ellipse cx="300" cy="82" rx="34" ry="38" fill="#c8dba0" opacity="0.7" />
          {/* Africa */}
          <ellipse cx="305" cy="188" rx="52" ry="68" fill="#c8dba0" opacity="0.7" />
          {/* Asia */}
          <ellipse cx="455" cy="96" rx="130" ry="76" fill="#c8dba0" opacity="0.7" />
          {/* Australia */}
          <ellipse cx="516" cy="218" rx="34" ry="28" fill="#c8dba0" opacity="0.7" />

          {/* Dim dots for all known countries */}
          {Object.entries(COUNTRY_META)
            .filter(([code]) => !countries[code])
            .map(([code, meta]) => {
              const { x, y } = toXY(meta.lon, meta.lat);
              return <circle key={code} cx={x} cy={y} r="3" fill="rgba(96,122,66,0.35)" />;
            })}

          {/* Active country dots with pulse */}
          {activeDots.map(({ code, x, y, r }) => (
            <g key={code}>
              <circle cx={x} cy={y} r={r + 6} fill="rgba(146,171,105,0.22)" className="live-map-ring" />
              <circle cx={x} cy={y} r={r} fill="var(--brand)" opacity="0.9" />
              <text
                x={x}
                y={y + r + 11}
                textAnchor="middle"
                fontSize="8"
                fill="#2d4a28"
                fontWeight="700"
              >
                {code}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {countryEntries.length > 0 ? (
        <div className="admin-live-countries">
          {countryEntries.map(([code, count]) => {
            const meta = COUNTRY_META[code] || { flag: "🌍", name: code };
            return (
              <div key={code} className="admin-live-country-row">
                <span className="admin-live-flag">{meta.flag}</span>
                <span className="admin-live-country-name">{meta.name}</span>
                <span className="admin-live-country-count">{count}</span>
              </div>
            );
          })}
          {(liveData?.unknown ?? 0) > 0 && (
            <div className="admin-live-country-row">
              <span className="admin-live-flag">🌐</span>
              <span className="admin-live-country-name">Unknown</span>
              <span className="admin-live-country-count">{liveData.unknown}</span>
            </div>
          )}
        </div>
      ) : (
        !loading && (
          <p className="admin-chart-notice">
            No active visitors in the last {windowMin} minutes.
          </p>
        )
      )}
    </section>
  );
}

function fmtMoney(value, currency = "") {
  const number = Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return currency ? `${currency} ${number}` : number;
}

export default function AnalyticsView({ data }) {
  const completedOrders = Number(data?.completed_orders || data?.orders || 0);
  const visitors = Number(data?.visitors || 0);
  const funnelPct = (value) =>
    visitors > 0 ? Math.max(0, Math.min(100, (Number(value || 0) / visitors) * 100)) : 0;
  const funnel = [
    { label: "Store Visitors", value: visitors, pct: visitors ? 100 : 0 },
    { label: "Product Views",  value: Number(data?.product_views || 0), pct: funnelPct(data?.product_views) },
    { label: "Add to Cart",    value: Number(data?.cart_adds || 0),     pct: funnelPct(data?.cart_adds) },
    { label: "Checkout",       value: Number(data?.checkouts || 0),     pct: funnelPct(data?.checkouts) },
    { label: "Orders",         value: completedOrders,                  pct: funnelPct(completedOrders) },
  ];
  const regionRows = [
    { label: "Oman",         payload: data?.region_om, color: "var(--brand)" },
    { label: "UAE",          payload: data?.region_ae, color: "var(--brand-dark)" },
    { label: "Saudi Arabia", payload: data?.region_sa, color: "#c9a84c" },
  ];
  const totalRegionalRevenueOmr = regionRows.reduce(
    (sum, row) => sum + Number(row?.payload?.revenue_omr || 0),
    0,
  );
  const regions = regionRows.map((row) => {
    const revenue = Number(row?.payload?.revenue || 0);
    const revenueOmr = Number(row?.payload?.revenue_omr || 0);
    const orders = Number(row?.payload?.orders || 0);
    const pct = totalRegionalRevenueOmr > 0 ? (revenueOmr / totalRegionalRevenueOmr) * 100 : 0;
    return { ...row, revenue, revenueOmr, orders, pct, currencyCode: row?.payload?.currency_code || "" };
  });

  const trendData = data?.revenue_trend || [];
  const acqBars   = trendData.length ? trendData.map((t) => Math.round(t.value)) : [0];
  const acqLabels = trendData.length ? trendData.map((t) => t.label) : ["—"];

  return (
    <div className="admin-analytics">
      {/* Live visitors panel — self-polling */}
      <LiveVisitorsPanel />

      <div className="admin-chart-row">
        <section className="admin-chart-card span-2">
          <h3>Revenue Analytics</h3>
          <RevenueChart values={data?.revenue_trend || []} />
        </section>
        <section className="admin-chart-card">
          <h3>Regional Revenue Split</h3>
          <div className="admin-regional">
            {regions.map((r) => (
              <div key={r.label} className="admin-regional-row">
                <span>{r.label}</span>
                <div className="admin-regional-track">
                  <div
                    className="admin-regional-fill"
                    style={{ width: `${r.pct}%`, background: r.color }}
                  />
                </div>
                <strong>{r.pct.toFixed(1)}%</strong>
                <small>
                  {fmtMoney(r.revenue, r.currencyCode)} · {r.orders} orders
                </small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="admin-chart-row">
        <section className="admin-chart-card admin-analytics-funnel-card">
          <h3>Conversion Funnel</h3>
          {visitors === 0 && (
            <p className="admin-chart-notice">
              No visitor data yet. Funnel will populate as customers browse the storefront.
            </p>
          )}
          <div className="admin-funnel">
            {funnel.map((step, i) => (
              <div key={step.label} className="admin-funnel-step">
                <div
                  className="admin-funnel-bar"
                  style={{
                    "--fw": `${step.value > 0 ? (i === 0 ? 100 : Math.max(46, step.pct)) : 38}%`,
                  }}
                >
                  <span>{step.label}</span>
                  <strong>{step.value.toLocaleString()}</strong>
                </div>
                {i < funnel.length - 1 ? (
                  <div className="admin-funnel-rate">
                    {step.value
                      ? `${((funnel[i + 1].value / step.value) * 100).toFixed(1)}% pass-through`
                      : "0.0% pass-through"}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="admin-chart-card admin-analytics-status-card">
          <h3>Order Status Distribution</h3>
          <div className="admin-analytics-donut-wrap">
            <DonutChart values={data?.status_mix || []} />
          </div>
        </section>
      </div>

      <section className="admin-chart-card">
        <h3>Monthly Revenue (6 months)</h3>
        <div className="admin-bar-chart">
          {acqBars.map((h, i) => (
            <div key={acqLabels[i]} className="admin-bar-col">
              <div className="admin-bar" style={{ "--bh": `${h}%` }}>
                <span className="admin-bar-val">{Math.round(h)}</span>
              </div>
              <span className="admin-bar-label">{acqLabels[i]}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
