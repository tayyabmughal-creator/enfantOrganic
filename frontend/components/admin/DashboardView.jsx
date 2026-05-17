import { RevenueChart, DonutChart, statusTone, AdminEmpty } from "./SharedUI";

export default function DashboardView({ data }) {
  function fmtDelta(val) {
    if (val === null || val === undefined) return { text: "—", up: true };
    const n = Number(val);
    return { text: `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`, up: n >= 0 };
  }
  const revDelta = fmtDelta(data?.revenue_delta);
  const ordDelta = fmtDelta(data?.orders_delta);
  const cusDelta = fmtDelta(data?.customers_delta);

  const kpis = [
    { label: "Total Revenue",    value: `OMR ${Number(data?.revenue || 0).toLocaleString()}`,          tone: "gold",   ...revDelta },
    { label: "Monthly Revenue",  value: `OMR ${Number(data?.monthly_revenue || 0).toLocaleString()}`,  tone: "green",  ...revDelta },
    { label: "Total Orders",     value: data?.orders ?? 0,                                             tone: "blue",   ...ordDelta },
    { label: "Customers",        value: data?.customers ?? 0,                                          tone: "violet", ...cusDelta },
    { label: "Avg Order Value",  value: `OMR ${Number(data?.avg_order_value || 0).toFixed(2)}`,        tone: "amber",  text: "—", up: true },
    { label: "Conversion Rate",  value: `${Number(data?.conversion_rate || 0).toFixed(1)}%`,          tone: "teal",   text: "—", up: true },
    { label: "Cart Abandonment", value: `${Number(data?.abandonment_rate || 0).toFixed(1)}%`,          tone: "rose",   text: "—", up: false },
    { label: "Repeat Purchase",  value: `${Number(data?.repeat_rate || 0).toFixed(1)}%`,              tone: "indigo", text: "—", up: true },
  ];

  return (
    <div className="admin-dashboard">
      <div className="admin-kpi-grid">
        {kpis.map((k) => (
          <article key={k.label} className="admin-kpi-card">
            <span className="admin-kpi-label">{k.label}</span>
            <strong className="admin-kpi-value">{k.value}</strong>
            <span className={`admin-kpi-delta ${k.up ? "up" : "down"}`}>{k.text} vs last period</span>
          </article>
        ))}
      </div>

      <div className="admin-chart-row">
        <section className="admin-chart-card span-2">
          <h3>Revenue Trend</h3>
          <RevenueChart values={data?.revenue_trend || []} />
        </section>
        <section className="admin-chart-card">
          <h3>Order Status Mix</h3>
          <DonutChart values={data?.status_mix || []} />
        </section>
        <section className="admin-chart-card">
          <h3>Top Products</h3>
          <div className="admin-list-sm">
            {(data?.top_products || []).length ? (
              data.top_products.map((p) => (
                <div key={p.slug} className="admin-list-sm-item">
                  <span>{p.name_en}</span>
                  <strong>{p.sales} sold</strong>
                </div>
              ))
            ) : (
              <span className="admin-empty-sm">No sales data yet</span>
            )}
          </div>
        </section>
      </div>

      <div className="admin-dashboard-footer">
        <section className="admin-panel-card">
          <div className="admin-panel-head">
            <h3>Recent Orders</h3>
            <span>Latest transactions requiring fulfillment.</span>
          </div>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recent_orders || []).length ? (
                  data.recent_orders.map((o) => (
                    <tr key={o.order_number}>
                      <td><strong>{o.order_number}</strong></td>
                      <td>{o.customer_name}</td>
                      <td>{o.grand_total} {o.currency_code}</td>
                      <td><span className={`admin-badge status-${o.status || "pending"}`}>{o.status}</span></td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="4" className="admin-table-empty">No orders recently</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
