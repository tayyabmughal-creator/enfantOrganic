import { RevenueChart, DonutChart } from "./SharedUI";

export default function AnalyticsView({ data }) {
  const funnel = [
    { label: "Store Visitors", value: data?.visitors       || 0, pct: 100 },
    { label: "Product Views",  value: data?.product_views  || 0, pct: 0 },
    { label: "Add to Cart",    value: data?.cart_adds      || 0, pct: 0 },
    { label: "Checkout",       value: data?.checkouts      || 0, pct: 0 },
    { label: "Orders",         value: data?.orders         || 0, pct: data?.orders ? 100 : 0 },
  ];
  const regions = [
    { label: "Oman",         value: data?.region_om || 0, color: "var(--brand)" },
    { label: "UAE",          value: data?.region_ae || 0, color: "var(--brand-dark)" },
    { label: "Saudi Arabia", value: data?.region_sa || 0, color: "#c9a84c" },
  ];
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
                  <div className="admin-regional-fill" style={{ width: `${r.value}%`, background: r.color }} />
                </div>
                <strong>{r.value}%</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="admin-chart-row">
        <section className="admin-chart-card">
          <h3>Conversion Funnel</h3>
          <div className="admin-funnel">
            {funnel.map((step, i) => (
              <div key={step.label} className="admin-funnel-step">
                <div className="admin-funnel-bar" style={{ "--fw": `${step.pct}%` }}>
                  <span>{step.label}</span>
                  <strong>{step.value.toLocaleString()}</strong>
                </div>
                {i < funnel.length - 1
                  ? <div className="admin-funnel-rate">{((funnel[i + 1].value / step.value) * 100).toFixed(1)}% pass-through</div>
                  : null}
              </div>
            ))}
          </div>
        </section>

        <section className="admin-chart-card">
          <h3>Order Status Distribution</h3>
          <DonutChart values={data?.status_mix || []} />
        </section>
      </div>

      <section className="admin-chart-card">
        <h3>Customer Acquisition (6 months)</h3>
        <div className="admin-bar-chart">
          {acqBars.map((h, i) => (
            <div key={acqLabels[i]} className="admin-bar-col">
              <div className="admin-bar" style={{ "--bh": `${h}%` }}>
                <span className="admin-bar-val">{Math.round(h * 1.2)}</span>
              </div>
              <span className="admin-bar-label">{acqLabels[i]}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
