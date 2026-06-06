import { RevenueChart, DonutChart } from "./SharedUI";

function fmtMoney(value, currency = "") {
  const number = Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return currency ? `${currency} ${number}` : number;
}

export default function AnalyticsView({ data }) {
  const completedOrders = Number(data?.completed_orders || data?.orders || 0);
  const visitors = Number(data?.visitors || 0);
  const funnelPct = (value) => (visitors > 0 ? Math.max(0, Math.min(100, (Number(value || 0) / visitors) * 100)) : 0);
  const funnel = [
    { label: "Store Visitors", value: visitors, pct: visitors ? 100 : 0 },
    { label: "Product Views",  value: Number(data?.product_views || 0), pct: funnelPct(data?.product_views) },
    { label: "Add to Cart",    value: Number(data?.cart_adds || 0), pct: funnelPct(data?.cart_adds) },
    { label: "Checkout",       value: Number(data?.checkouts || 0), pct: funnelPct(data?.checkouts) },
    { label: "Orders",         value: completedOrders, pct: funnelPct(completedOrders) },
  ];
  const regionRows = [
    { label: "Oman", payload: data?.region_om, color: "var(--brand)" },
    { label: "UAE", payload: data?.region_ae, color: "var(--brand-dark)" },
    { label: "Saudi Arabia", payload: data?.region_sa, color: "#c9a84c" },
  ];
  const totalRegionalRevenueOmr = regionRows.reduce((sum, row) => sum + Number(row?.payload?.revenue_omr || 0), 0);
  const regions = regionRows.map((row) => {
    const revenue = Number(row?.payload?.revenue || 0);
    const revenueOmr = Number(row?.payload?.revenue_omr || 0);
    const orders = Number(row?.payload?.orders || 0);
    const pct = totalRegionalRevenueOmr > 0 ? (revenueOmr / totalRegionalRevenueOmr) * 100 : 0;
    return {
      ...row,
      revenue,
      revenueOmr,
      orders,
      pct,
      currencyCode: row?.payload?.currency_code || "",
    };
  });

  const trendData = data?.revenue_trend || [];
  const acqBars = trendData.length ? trendData.map((t) => Math.round(t.value)) : [0];
  const acqLabels = trendData.length ? trendData.map((t) => t.label) : ["—"];

  return (
    <div className="admin-analytics">
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
                  <div className="admin-regional-fill" style={{ width: `${r.pct}%`, background: r.color }} />
                </div>
                <strong>{r.pct.toFixed(1)}%</strong>
                <small>{fmtMoney(r.revenue, r.currencyCode)} · {r.orders} orders</small>
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
                  style={{ "--fw": `${step.value > 0 ? (i === 0 ? 100 : Math.max(46, step.pct)) : 38}%` }}
                >
                  <span>{step.label}</span>
                  <strong>{step.value.toLocaleString()}</strong>
                </div>
                {i < funnel.length - 1
                  ? (
                    <div className="admin-funnel-rate">
                      {step.value ? `${((funnel[i + 1].value / step.value) * 100).toFixed(1)}% pass-through` : "0.0% pass-through"}
                    </div>
                  )
                  : null}
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
