import { RevenueChart, DonutChart } from "./SharedUI";
import Icon from "../icons/Icon";

function fmtMoney(v, currency = "OMR") {
  return `${currency} ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtPct(v, decimals = 1) {
  return `${Number(v || 0).toFixed(decimals)}%`;
}

function fmtDelta(val) {
  if (val === null || val === undefined) {
    return { text: "— vs last period", up: null };
  }
  const n = Number(val);
  return {
    text: `${n >= 0 ? "+" : ""}${n.toFixed(1)}% vs last period`,
    up: n >= 0,
  };
}

// Mini SVG sparkline for KPI cards. Pure visual — accepts numeric values, optional negative tint.
function Sparkline({ values = [], up = true, height = 28, width = 96 }) {
  if (!values || values.length < 2) {
    return (
      <svg className="kpi-spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
        <line x1="2" y1={height - 4} x2={width - 2} y2={height - 4} stroke="#d4dccf" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = (width - 6) / (values.length - 1);
  const points = values
    .map((v, i) => `${3 + i * step},${height - 3 - ((v - min) / range) * (height - 6)}`)
    .join(" ");
  const tone = up === false ? "#c44242" : "#4f7d3d";
  return (
    <svg className="kpi-spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <polyline points={points} fill="none" stroke={tone} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function DashboardView({ data }) {
  const currency = data?.currency_code || "OMR";

  const revenue = Number(data?.revenue || 0);
  const monthlyRevenue = Number(data?.monthly_revenue || 0);
  const orders = Number(data?.orders || 0);
  const customers = Number(data?.customers || 0);
  const avgOrder = Number(data?.avg_order_value || 0);
  const conversion = Number(data?.conversion_rate || 0);
  const abandonment = Number(data?.abandonment_rate || 0);
  const repeat = Number(data?.repeat_rate || 0);

  const revDelta = fmtDelta(data?.revenue_delta);
  const ordDelta = fmtDelta(data?.orders_delta);
  const cusDelta = fmtDelta(data?.customers_delta);
  const abnDelta = fmtDelta(data?.abandonment_delta ?? null);
  // For non-deltaed metrics we don't fake a number — fmtDelta(null) returns the "—" string.
  const avgDelta = fmtDelta(data?.avg_order_value_delta ?? null);
  const convDelta = fmtDelta(data?.conversion_delta ?? null);
  const repDelta = fmtDelta(data?.repeat_delta ?? null);

  const revSeries = (data?.revenue_trend || []).map((p) => Number(p.value || 0));
  // Reuse the revenue trend as a proxy spark for both revenue cards. Orders/customers
  // get a flat indicator unless the backend ships their own series later.
  const ordersSeries = (data?.orders_trend || []).map((p) => Number(p.value || 0));
  const customersSeries = (data?.customers_trend || []).map((p) => Number(p.value || 0));

  const kpis = [
    {
      key: "revenue",
      icon: "wallet",
      label: "Total Revenue",
      value: fmtMoney(revenue, currency),
      delta: revDelta,
      spark: revSeries,
      tone: "revenue",
    },
    {
      key: "monthly",
      icon: "coin",
      label: "Monthly Revenue",
      value: fmtMoney(monthlyRevenue, currency),
      delta: revDelta,
      spark: revSeries.slice(-6),
      tone: "monthly",
    },
    {
      key: "orders",
      icon: "bag",
      label: "Total Orders",
      value: orders.toLocaleString(),
      delta: ordDelta,
      spark: ordersSeries,
      tone: "orders",
    },
    {
      key: "customers",
      icon: "user",
      label: "Customers",
      value: customers.toLocaleString(),
      delta: cusDelta,
      spark: customersSeries,
      tone: "customers",
    },
    {
      key: "avg",
      icon: "receipt",
      label: "Avg Order Value",
      value: fmtMoney(avgOrder, currency),
      delta: avgDelta,
      spark: revSeries.map((v, i, arr) => (i > 0 && arr[i - 1] ? v / Math.max(arr[i - 1], 1) : v)),
      tone: "avg",
    },
    {
      key: "conversion",
      icon: "target",
      label: "Conversion Rate",
      value: fmtPct(conversion),
      delta: convDelta,
      spark: [],
      tone: "conversion",
    },
    {
      key: "abandonment",
      icon: "cartX",
      label: "Cart Abandonment",
      value: fmtPct(abandonment),
      delta: { ...abnDelta, up: abnDelta.up === null ? null : !abnDelta.up },
      spark: [],
      tone: "abandonment",
    },
    {
      key: "repeat",
      icon: "repeat",
      label: "Repeat Purchase",
      value: fmtPct(repeat),
      delta: repDelta,
      spark: [],
      tone: "repeat",
    },
  ];

  // Order status mix → readable legend
  const statusMix = Array.isArray(data?.status_mix) ? data.status_mix : [];
  const statusTotal = statusMix.reduce((s, i) => s + Number(i.count || 0), 0);
  const STATUS_COLORS = ["#c9a84c", "#92ab69", "#607a42", "#62b5e8", "#df5750", "#8a82ff"];
  const statusLegend = statusMix.map((item, i) => ({
    label: String(item.status || "unknown")
      .split("_")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" "),
    count: Number(item.count || 0),
    color: STATUS_COLORS[i % STATUS_COLORS.length],
    pct: statusTotal ? Math.round((Number(item.count || 0) / statusTotal) * 100) : 0,
  }));

  // Footer insight cards — narrative summaries the user can read at a glance.
  const insights = [
    {
      icon: "trophy",
      title: orders > 0 ? "Keep growing!" : "Ready to launch",
      body:
        orders > 0
          ? `Your store has fulfilled ${orders.toLocaleString()} orders so far.`
          : "Orders will appear here as customers check out.",
      tone: "ok",
    },
    {
      icon: "trendingUp",
      title: "Revenue update",
      body:
        revDelta.up === null
          ? `Total revenue is ${fmtMoney(revenue, currency)}.`
          : revDelta.up
          ? `Revenue is up ${revDelta.text.replace(" vs last period", "")} vs last month.`
          : `Revenue is down ${revDelta.text.replace(" vs last period", "").replace("+", "")} vs last month.`,
      tone: revDelta.up === false ? "warn" : "ok",
    },
    {
      icon: "users",
      title: "Customer growth",
      body:
        customers > 0
          ? `${customers.toLocaleString()} total customers and counting.`
          : "No customers yet — share your store to start growing.",
      tone: "ok",
    },
  ];

  const periodLabel = data?.period_label || "All time";

  return (
    <div className="admin-dashboard">
      <div className="admin-dash-toolbar">
        <div className="admin-dash-period">
          <span className="admin-dash-period-icon" aria-hidden="true">
            <Icon name="calendar" size={16} />
          </span>
          <span>{periodLabel}</span>
        </div>
        <button type="button" className="admin-dash-refresh" title="Refresh" aria-label="Refresh dashboard">
          <Icon name="refresh" size={16} />
        </button>
      </div>

      <div className="admin-kpi-grid">
        {kpis.map((k) => (
          <article key={k.key} className={`admin-kpi-card kpi-tone-${k.tone}`}>
            <div className="admin-kpi-card-head">
              <span className="admin-kpi-icon" aria-hidden="true">
                <Icon name={k.icon} size={18} />
              </span>
              <span className="admin-kpi-label">{k.label}</span>
            </div>
            <div className="admin-kpi-card-body">
              <strong className="admin-kpi-value">{k.value}</strong>
              {k.spark && k.spark.length >= 2 ? (
                <Sparkline values={k.spark} up={k.delta.up !== false} />
              ) : null}
            </div>
            <span
              className={`admin-kpi-delta ${
                k.delta.up === null ? "flat" : k.delta.up ? "up" : "down"
              }`}
            >
              {k.delta.up === null ? null : (
                <span className="admin-kpi-delta-arrow" aria-hidden="true">{k.delta.up ? "▲" : "▼"}</span>
              )}
              <span>{k.delta.text}</span>
            </span>
          </article>
        ))}
      </div>

      <div className="admin-chart-row">
        <section className="admin-chart-card span-2">
          <div className="admin-chart-card-head">
            <h3>Revenue Trend</h3>
            <span className="admin-chart-chip">
              <Icon name="chartLine" size={14} />
              Monthly
            </span>
          </div>
          <RevenueChart values={data?.revenue_trend || []} />
          <div className="admin-chart-legend">
            <span className="admin-chart-swatch" style={{ background: "var(--brand)" }} />
            Revenue ({currency})
          </div>
        </section>

        <section className="admin-chart-card admin-donut-section">
          <div className="admin-chart-card-head">
            <h3>Order Status Mix</h3>
            <span className="admin-chart-chip">
              <Icon name="clock" size={14} />
              {periodLabel}
            </span>
          </div>
          <DonutChart values={statusMix} />
          <ul className="admin-donut-legend">
            {statusLegend.length ? (
              statusLegend.map((item) => (
                <li key={item.label}>
                  <span className="admin-donut-dot" style={{ background: item.color }} />
                  <span className="admin-donut-label">{item.label}</span>
                  <span className="admin-donut-count">{item.count} <em>({item.pct}%)</em></span>
                </li>
              ))
            ) : (
              <li className="admin-donut-empty">No orders yet — status mix will appear here.</li>
            )}
          </ul>
        </section>
      </div>

      <div className="admin-insight-row">
        {insights.map((it) => (
          <article key={it.title} className={`admin-insight-card tone-${it.tone}`}>
            <span className="admin-insight-icon" aria-hidden="true">
              <Icon name={it.icon} size={18} />
            </span>
            <div className="admin-insight-copy">
              <strong>{it.title}</strong>
              <span>{it.body}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="admin-chart-row admin-chart-row--3">
        <section className="admin-chart-card">
          <div className="admin-chart-card-head">
            <h3>Top Products</h3>
            <span className="admin-chart-chip">
              <Icon name="star" size={14} />
              By rating
            </span>
          </div>
          <div className="admin-list-sm">
            {(data?.top_products || []).length ? (
              data.top_products.map((p, i) => (
                <div key={p.slug || i} className="admin-list-sm-item">
                  <span className="admin-list-sm-rank">{i + 1}</span>
                  <span className="admin-list-sm-name">{p.name_en}</span>
                  <strong>{p.stock_quantity ?? p.sales ?? 0}</strong>
                </div>
              ))
            ) : (
              <span className="admin-empty-sm">No products yet</span>
            )}
          </div>
        </section>

        <section className="admin-chart-card">
          <div className="admin-chart-card-head">
            <h3>Inventory Health</h3>
            <span className="admin-chart-chip">
              <Icon name="box" size={14} />
              Low stock
            </span>
          </div>
          <div className="admin-stat-grid">
            <div className="admin-stat-tile">
              <span className="admin-stat-label">Low stock SKUs</span>
              <strong>{Number(data?.low_stock_products || 0).toLocaleString()}</strong>
            </div>
            <div className="admin-stat-tile">
              <span className="admin-stat-label">Low stock entries</span>
              <strong>{Number(data?.low_stock || 0).toLocaleString()}</strong>
            </div>
            <div className="admin-stat-tile">
              <span className="admin-stat-label">Total products</span>
              <strong>{Number(data?.products || 0).toLocaleString()}</strong>
            </div>
            <div className="admin-stat-tile">
              <span className="admin-stat-label">Pending orders</span>
              <strong>{Number(data?.pending_orders || 0).toLocaleString()}</strong>
            </div>
          </div>
        </section>

        <section className="admin-chart-card">
          <div className="admin-chart-card-head">
            <h3>New Customers</h3>
            <span className="admin-chart-chip">
              <Icon name="user" size={14} />
              Latest
            </span>
          </div>
          <div className="admin-list-sm">
            {(data?.recent_customers || []).length ? (
              data.recent_customers.slice(0, 6).map((c) => (
                <div key={c.id} className="admin-list-sm-item">
                  <span className="admin-list-sm-name">
                    {(c.first_name || c.username || c.email || "Customer").toString()}
                  </span>
                  <small>{c.email || ""}</small>
                </div>
              ))
            ) : (
              <span className="admin-empty-sm">No customers yet</span>
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
