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
  const maxCount = countryEntries[0]?.[1] ?? 1;

  const activeDots = countryEntries
    .filter(([code]) => COUNTRY_META[code])
    .map(([code, count]) => {
      const meta = COUNTRY_META[code];
      const pos = toXY(meta.lon, meta.lat);
      const r = Math.min(9, 4 + count * 2);
      return { code, count, ...pos, r };
    });

  return (
    <section className="admin-live-card">
      <div className="admin-live-header">
        <div className="admin-live-title-group">
          <span className="admin-live-pulse-dot" />
          <h3 className="admin-live-title">Live Visitors</h3>
        </div>
        <div className="admin-live-stats">
          <span className="admin-live-count">{loading ? "—" : totalLive}</span>
          <span className="admin-live-meta">online · last {windowMin} min</span>
        </div>
      </div>

      <div className="admin-live-map-outer">
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="admin-live-map" aria-label="Live visitor world map">
          <defs>
            <radialGradient id="ocean-g" cx="50%" cy="40%" r="65%">
              <stop offset="0%" stopColor="#162035" />
              <stop offset="100%" stopColor="#090e1a" />
            </radialGradient>
            <pattern id="map-grid" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
              <circle cx="7" cy="7" r="0.65" fill="rgba(255,255,255,0.07)" />
            </pattern>
            <filter id="dot-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="dot-glow-sm" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Dark ocean */}
          <rect width={MAP_W} height={MAP_H} fill="url(#ocean-g)" rx="12" />
          {/* Subtle dot grid */}
          <rect width={MAP_W} height={MAP_H} fill="url(#map-grid)" rx="12" />

          {/* Latitude / longitude grid lines */}
          {[-60, -30, 0, 30, 60].map((lat) => {
            const y = ((90 - lat) / 180) * MAP_H;
            return <line key={`lat${lat}`} x1={0} y1={y} x2={MAP_W} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="0.6" />;
          })}
          {[-120, -60, 0, 60, 120].map((lon) => {
            const x = ((lon + 180) / 360) * MAP_W;
            return <line key={`lon${lon}`} x1={x} y1={0} x2={x} y2={MAP_H} stroke="rgba(255,255,255,0.05)" strokeWidth="0.6" />;
          })}

          {/* Continent land masses — blue-steel silhouettes */}
          <ellipse cx="138" cy="82" rx="102" ry="52" fill="#1d3461" opacity="0.95" />   {/* North America */}
          <ellipse cx="207" cy="190" rx="40"  ry="60" fill="#1d3461" opacity="0.95" />  {/* South America */}
          <ellipse cx="295" cy="72" rx="42"   ry="30" fill="#1d3461" opacity="0.95" />  {/* Europe */}
          <ellipse cx="310" cy="168" rx="55"  ry="70" fill="#1d3461" opacity="0.95" />  {/* Africa */}
          <ellipse cx="468" cy="82" rx="130"  ry="72" fill="#1d3461" opacity="0.95" />  {/* Asia */}
          <ellipse cx="543" cy="204" rx="34"  ry="26" fill="#1d3461" opacity="0.95" />  {/* Australia */}
          {/* Minor landmasses */}
          <ellipse cx="78"  cy="28"  rx="22" ry="13" fill="#1d3461" opacity="0.9" />   {/* Greenland */}
          <ellipse cx="310" cy="55"  rx="10" ry="8"  fill="#1d3461" opacity="0.9" />   {/* British Isles */}
          <ellipse cx="550" cy="92"  rx="13" ry="18" fill="#1d3461" opacity="0.9" />   {/* Japan */}
          <ellipse cx="516" cy="150" rx="32" ry="13" fill="#1d3461" opacity="0.9" />   {/* Indonesia */}

          {/* Dim markers for known countries with no current visitors */}
          {Object.entries(COUNTRY_META)
            .filter(([code]) => !countries[code])
            .map(([code, meta]) => {
              const { x, y } = toXY(meta.lon, meta.lat);
              return <circle key={code} cx={x} cy={y} r="2.5" fill="rgba(146,171,105,0.38)" />;
            })}

          {/* Active country dots — glowing green with SMIL pulse rings */}
          {activeDots.map(({ code, x, y, r }) => (
            <g key={code}>
              {/* Outer ring 1 */}
              <circle cx={x} cy={y} fill="none" stroke="rgba(52,211,153,0.55)" strokeWidth="1.5" r={r + 3}>
                <animate attributeName="r"       from={r + 3} to={r + 22} dur="2s" begin="0s"    repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.8"   to="0"      dur="2s" begin="0s"    repeatCount="indefinite" />
              </circle>
              {/* Outer ring 2 (staggered) */}
              <circle cx={x} cy={y} fill="none" stroke="rgba(52,211,153,0.3)" strokeWidth="1" r={r + 3}>
                <animate attributeName="r"       from={r + 3} to={r + 32} dur="2s" begin="0.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5"   to="0"      dur="2s" begin="0.8s" repeatCount="indefinite" />
              </circle>
              {/* Soft glow halo */}
              <circle cx={x} cy={y} r={r + 5} fill="rgba(52,211,153,0.18)" filter="url(#dot-glow)" />
              {/* Core dot */}
              <circle cx={x} cy={y} r={r} fill="#34d399" filter="url(#dot-glow-sm)" />
              {/* Country label */}
              <text x={x} y={y + r + 12} textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.75)" fontWeight="700" letterSpacing="0.5">
                {code}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {countryEntries.length > 0 ? (
        <div className="admin-live-countries-list">
          {countryEntries.map(([code, count]) => {
            const meta = COUNTRY_META[code] || { flag: "🌍", name: code };
            const pct = Math.round((count / maxCount) * 100);
            return (
              <div key={code} className="admin-live-country-item">
                <span className="admin-live-country-flag">{meta.flag}</span>
                <div className="admin-live-country-info">
                  <div className="admin-live-country-top">
                    <span className="admin-live-country-nm">{meta.name}</span>
                    <span className="admin-live-country-ct">{count}</span>
                  </div>
                  <div className="admin-live-bar-track">
                    <div className="admin-live-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
          {(liveData?.unknown ?? 0) > 0 && (
            <div className="admin-live-country-item">
              <span className="admin-live-country-flag">🌐</span>
              <div className="admin-live-country-info">
                <div className="admin-live-country-top">
                  <span className="admin-live-country-nm">Unknown</span>
                  <span className="admin-live-country-ct">{liveData.unknown}</span>
                </div>
                <div className="admin-live-bar-track">
                  <div className="admin-live-bar-fill" style={{ width: `${Math.round((liveData.unknown / maxCount) * 100)}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        !loading && (
          <p className="admin-chart-notice">No active visitors in the last {windowMin} minutes.</p>
        )
      )}
    </section>
  );
}

const SOURCE_ICONS = {
  Direct:    "🔗",
  Instagram: "📸",
  Facebook:  "👤",
  TikTok:    "🎵",
  Snapchat:  "👻",
  Google:    "🔍",
  WhatsApp:  "💬",
};

function TrafficSourcesPanel({ sources = [] }) {
  if (!sources.length) return null;
  const total = sources.reduce((s, r) => s + r.sessions, 0);
  return (
    <section className="admin-chart-card admin-traffic-card">
      <h3>Traffic Sources</h3>
      <div className="admin-traffic-list">
        {sources.map(({ source, sessions }) => {
          const pct = total > 0 ? Math.round((sessions / total) * 100) : 0;
          const icon = SOURCE_ICONS[source] || "🌐";
          return (
            <div key={source} className="admin-traffic-row">
              <span className="admin-traffic-icon">{icon}</span>
              <span className="admin-traffic-name">{source}</span>
              <div className="admin-traffic-bar-track">
                <div className="admin-traffic-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="admin-traffic-pct">{pct}%</span>
              <span className="admin-traffic-count">{sessions}</span>
            </div>
          );
        })}
      </div>
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

      {/* Traffic sources */}
      <TrafficSourcesPanel sources={data?.traffic_sources || []} />

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
