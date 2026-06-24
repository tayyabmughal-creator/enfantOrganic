import { DonutChart, EmptyState } from "./SharedUI";
import Icon from "../icons/Icon";

const TOP_PRODUCT_METRIC_OPTIONS = [
  { value: "rating", label: "By Rating (Sold Products)" },
  { value: "revenue", label: "By Revenue" },
  { value: "units_sold", label: "By Units Sold" },
  { value: "orders", label: "By Orders" },
  { value: "repeat_purchase", label: "By Repeat Purchase" },
];

const TOP_PRODUCT_DATE_OPTIONS = [
  { value: "all_time", label: "All Time" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_60_days", label: "Last 60 Days" },
  { value: "last_90_days", label: "Last 90 Days" },
  { value: "custom_date", label: "Custom Date" },
];

const TOP_PRODUCT_MARKET_OPTIONS = [
  { value: "all", label: "All Markets" },
  { value: "om", label: "Oman" },
  { value: "ae", label: "UAE" },
  { value: "sa", label: "Saudi (SAR)" },
];

function fmtMoney(v, currency = "OMR") {
  return `${currency} ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtPct(v, decimals = 1) {
  return `${Number(v || 0).toFixed(decimals)}%`;
}

function fmtDelta(val, label = "vs last period") {
  if (val === null || val === undefined) {
    return { text: `— ${label}`, up: null };
  }
  const n = Number(val);
  return {
    text: `${n >= 0 ? "+" : ""}${n.toFixed(1)}% ${label}`,
    up: n >= 0,
  };
}

function stripDeltaContext(text = "") {
  return String(text).replace(/\s+vs\s+.*$/i, "");
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

function formatTopProductMetricValue(product, currency) {
  const metric = product?.metric || "rating";
  const metricCurrency = product?.currency_code || currency;
  if (metric === "revenue") {
    return fmtMoney(product?.metric_value ?? product?.revenue ?? 0, metricCurrency);
  }
  if (metric === "units_sold") {
    return `${Number(product?.metric_value ?? product?.sales ?? 0).toLocaleString()} units`;
  }
  if (metric === "orders") {
    return `${Number(product?.metric_value ?? product?.orders_count ?? 0).toLocaleString()} orders`;
  }
  if (metric === "repeat_purchase") {
    return `${Number(product?.metric_value ?? product?.repeat_purchase_count ?? 0).toLocaleString()} repeat`;
  }
  return `${Number(product?.metric_value ?? product?.rating ?? 0).toFixed(1)}★`;
}

function formatStepDelta(value) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function getInventoryTone(product) {
  const label = String(product?.status_label || "").toLowerCase();
  if (label.includes("out of stock")) return "danger";
  if (label.includes("critical")) return "critical";
  if (label.includes("low")) return "warning";
  return product?.status_tone || "warning";
}

function SalesChannelDonut({ channels = [], totalSales = 0, currency = "OMR" }) {
  const total = Math.max(Number(totalSales || 0), 0);
  const totalNumber = Number(total || 0);
  const totalValueText = totalNumber.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const valueFontSize = totalValueText.length > 10 ? 18 : totalValueText.length > 8 ? 20 : 24;
  const items = channels.length ? channels : [
    { key: "online_store", label: "Online Store", color: "#20aeea", sales: 0 },
    { key: "draft_order", label: "Draft Orders", color: "#7652e9", sales: 0 },
  ];
  let offset = 25;

  return (
    <svg className="admin-sales-channel-donut" viewBox="0 0 220 220" role="img" aria-label="Total sales by sales channel">
      <circle cx="110" cy="110" r="68" fill="none" stroke="#eef2e6" strokeWidth="28" />
      {total > 0 ? items.map((item) => {
        const len = (Number(item.sales || 0) / total) * 320;
        const circle = (
          <circle
            key={item.key}
            cx="110"
            cy="110"
            r="68"
            fill="none"
            stroke={item.color || "#20aeea"}
            strokeWidth="28"
            strokeDasharray={`${len} 320`}
            strokeDashoffset={-offset}
            style={{ transform: "rotate(-90deg)", transformOrigin: "110px 110px" }}
          />
        );
        offset += len;
        return circle;
      }) : null}
      <text x="110" y="89" textAnchor="middle" className="admin-donut-center-label admin-donut-center-label--compact">
        {currency}
      </text>
      <text
        x="110"
        y="118"
        textAnchor="middle"
        className="admin-donut-center-value admin-donut-center-value--compact"
        style={{ fontSize: `${valueFontSize}px` }}
      >
        {totalValueText}
      </text>
      <text x="110" y="143" textAnchor="middle" className="admin-donut-center-meta">
        Total sales
      </text>
    </svg>
  );
}

export default function DashboardView({ data, filters, onFiltersChange, onRefresh, onRestock, onViewAllInventory }) {
  const currency = data?.currency_code || "OMR";
  const topProductsCurrency = data?.top_products_currency_code || currency;
  const salesByChannel = data?.sales_by_channel || {};
  const salesChannelCurrency = salesByChannel?.currency_code || currency;
  const salesChannelRows = Array.isArray(salesByChannel?.channels) ? salesByChannel.channels : [];
  const salesChannelTotal = Number(salesByChannel?.total_sales || 0);
  const salesChannelOrderTotal = Number(salesByChannel?.total_orders || 0);
  const inventoryThreshold = Number(data?.inventory_health_threshold || 10);
  const inventoryHealthProducts = Array.isArray(data?.inventory_health_products)
    ? data.inventory_health_products.slice(0, 5)
    : [];
  const inventoryHealthCount = Number(data?.inventory_health_count ?? inventoryHealthProducts.length);

  const revenue = Number(data?.revenue || 0);
  const monthlyRevenue = Number(data?.monthly_revenue || 0);
  const orders = Number(data?.orders || 0);
  const customers = Number(data?.customers || 0);
  const avgOrder = Number(data?.avg_order_value || 0);
  const conversion = Number(data?.payment_success_rate ?? data?.conversion_rate ?? 0);
  const abandonment = Number(data?.abandonment_rate || 0);
  const repeat = Number(data?.repeat_rate || 0);
  const deltaLabel = String(data?.delta_label || "vs last period");

  const revDelta = fmtDelta(data?.revenue_delta, deltaLabel);
  const ordDelta = fmtDelta(data?.orders_delta, deltaLabel);
  const cusDelta = fmtDelta(data?.customers_delta, deltaLabel);
  const abnDelta = fmtDelta(data?.abandonment_delta ?? null, deltaLabel);
  // For non-deltaed metrics we don't fake a number — fmtDelta(null) returns the "—" string.
  const avgDelta = fmtDelta(data?.avg_order_value_delta ?? null, deltaLabel);
  const convDelta = fmtDelta(data?.payment_success_delta ?? data?.conversion_delta ?? null, deltaLabel);
  const repDelta = fmtDelta(data?.repeat_delta ?? null, deltaLabel);

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
      delta: fmtDelta(null, deltaLabel),
      spark: revSeries,
      tone: "revenue",
    },
    {
      key: "monthly",
      icon: "coin",
      label: "Period Revenue",
      value: fmtMoney(monthlyRevenue, currency),
      delta: revDelta,
      spark: revSeries.slice(-6),
      tone: "monthly",
    },
    {
      key: "orders",
      icon: "bag",
      label: "Paid Orders",
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
      label: "Payment Success Rate",
      value: fmtPct(conversion),
      delta: convDelta,
      spark: [],
      tone: "conversion",
    },
    {
      key: "abandonment",
      icon: "cartX",
      label: "Checkout Abandonment Rate",
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

  const selectedMarketValue = filters?.topMarket || data?.top_products_market || "all";
  const selectedDateValue = filters?.topDateRange || data?.top_products_date_range || "all_time";
  const selectedMarketLabel =
    TOP_PRODUCT_MARKET_OPTIONS.find((opt) => opt.value === selectedMarketValue)?.label || "All Markets";
  const selectedDateLabel =
    TOP_PRODUCT_DATE_OPTIONS.find((opt) => opt.value === selectedDateValue)?.label || "All Time";

  const conversionBreakdown = data?.conversion_breakdown || {};
  const conversionSteps = Array.isArray(conversionBreakdown.steps) && conversionBreakdown.steps.length
    ? conversionBreakdown.steps
    : [
        { key: "sessions", label: "Sessions", count: 0, rate: 0, delta: null },
        { key: "added_to_cart", label: "Added to cart", count: 0, rate: 0, delta: null },
        { key: "checkout", label: "Reached checkout", count: 0, rate: 0, delta: null },
        { key: "completed", label: "Completed", count: 0, rate: 0, delta: null },
      ];
  const overallConversion = Number(conversionBreakdown.overall_rate || 0);
  const overallConversionDelta = conversionBreakdown.overall_delta;
  const revenueTrendRows = Array.isArray(data?.revenue_trend) ? data.revenue_trend : [];
  const statusMix = Array.isArray(data?.status_mix) ? data.status_mix : [];
  const statusTotal = statusMix.reduce((sum, item) => sum + Number(item?.count || 0), 0);
  const STATUS_COLORS = ["#c9a84c", "#92ab69", "#607a42", "#62b5e8", "#df5750", "#8a82ff"];
  const statusLegend = statusMix.map((item, i) => ({
    label: String(item?.status || "unknown")
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
    count: Number(item?.count || 0),
    color: STATUS_COLORS[i % STATUS_COLORS.length],
    pct: statusTotal ? Math.round((Number(item?.count || 0) / statusTotal) * 100) : 0,
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
          ? `Revenue is up ${stripDeltaContext(revDelta.text)} ${deltaLabel.toLowerCase()}.`
          : `Revenue is down ${stripDeltaContext(revDelta.text).replace("+", "")} ${deltaLabel.toLowerCase()}.`,
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

  return (
    <div className="admin-dashboard">
      <div className="admin-dash-header">
        <div>
          <h2 className="admin-dash-title">Dashboard Overview</h2>
          <p className="admin-dash-subtitle">Real-time store performance and health</p>
        </div>
        <div className="admin-dash-toolbar">
          <div className="admin-dash-period">
            <span className="admin-dash-period-icon" aria-hidden="true">
              <Icon name="calendar" size={15} />
            </span>
            <select
              className="admin-dash-period-select"
              value={filters?.topDateRange || "all_time"}
              onChange={(e) => onFiltersChange?.({ topDateRange: e.target.value })}
              aria-label="Dashboard date filter"
            >
              {TOP_PRODUCT_DATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          {filters?.topDateRange === "custom_date" ? (
            <div className="admin-dash-custom-dates">
              <input
                type="date"
                className="admin-filter-date"
                value={filters?.customStartDate || ""}
                onChange={(e) => onFiltersChange?.({ customStartDate: e.target.value })}
                aria-label="Custom start date"
              />
              <input
                type="date"
                className="admin-filter-date"
                value={filters?.customEndDate || ""}
                onChange={(e) => onFiltersChange?.({ customEndDate: e.target.value })}
                aria-label="Custom end date"
              />
            </div>
          ) : null}
          <div className="admin-dash-period">
            <span className="admin-dash-period-icon" aria-hidden="true">
              <Icon name="globe" size={15} />
            </span>
            <select
              className="admin-dash-period-select"
              value={filters?.topMarket || "all"}
              onChange={(e) => onFiltersChange?.({ topMarket: e.target.value })}
              aria-label="Dashboard market filter"
            >
              {TOP_PRODUCT_MARKET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="admin-dash-refresh"
            title="Refresh"
            aria-label="Refresh dashboard"
            onClick={onRefresh}
          >
            <Icon name="refresh" size={16} />
          </button>
        </div>
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

      <div className="admin-chart-row admin-chart-row--rev-conv">
        <section className="admin-chart-card admin-chart-card--full">
          <div className="admin-chart-card-head">
            <h3>Revenue Trend</h3>
            <span className="admin-chart-chip">
              <Icon name="chartLine" size={14} />
              {selectedDateLabel}
            </span>
          </div>
          <div className="admin-revenue-summary">
            <div className="admin-revenue-headline">
              <span>Current Period</span>
              <strong>{fmtMoney(monthlyRevenue, currency)}</strong>
            </div>
            <div className="admin-revenue-list">
              {revenueTrendRows.length ? revenueTrendRows.map((item, index) => {
                const isLast = index === revenueTrendRows.length - 1;
                return (
                  <div key={`${item.label}-${index}`} className={`admin-revenue-row ${isLast ? "is-current" : ""}`}>
                    <span className="admin-revenue-label">{item.label}</span>
                    <strong className="admin-revenue-value">{fmtMoney(item.value, currency)}</strong>
                  </div>
                );
              }) : (
                <EmptyState title="No revenue data yet" message="Revenue will appear here once orders start coming in." />
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="admin-chart-row">
        <section className="admin-chart-card admin-chart-card--full admin-conv-card">
          <div className="admin-chart-card-head">
            <h3>Conversion Breakdown</h3>
            <span className="admin-chart-chip admin-chart-chip--scope" title={`${selectedMarketLabel} • ${selectedDateLabel}`}>
              <Icon name="clock" size={14} />
              {selectedMarketLabel} • {selectedDateLabel}
            </span>
          </div>
          <div className="admin-conv-overview">
            <strong>{overallConversion.toFixed(2)}%</strong>
            <span className={`admin-conv-delta ${overallConversionDelta === null || overallConversionDelta === undefined ? "flat" : overallConversionDelta >= 0 ? "up" : "down"}`}>
              {formatStepDelta(overallConversionDelta)}
            </span>
          </div>
          {conversionBreakdown?.note ? (
            <p className="admin-chart-note" style={{ margin: "0 0 10px", color: "var(--text-soft)", fontSize: "0.82rem" }}>
              {conversionBreakdown.note}
            </p>
          ) : null}
          <div className="admin-conv-grid">
            {conversionSteps.map((step, i) => (
              <article key={step.key || i} className="admin-conv-col">
                <span className="admin-conv-label">{step.label}</span>
                <strong className="admin-conv-rate">{Number(step.rate || 0).toFixed(2)}%</strong>
                <span className="admin-conv-count">{Number(step.count || 0).toLocaleString()}</span>
                <span className={`admin-conv-step-delta ${step.delta === null || step.delta === undefined ? "flat" : step.delta >= 0 ? "up" : "down"}`}>
                  {formatStepDelta(step.delta)}
                </span>
                <div className="admin-conv-bar-track">
                  <div className="admin-conv-bar" style={{ height: `${Math.max(8, Number(step.rate || 0))}%` }} />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="admin-chart-row">
        <section className="admin-chart-card admin-chart-card--full admin-sales-channel-card">
          <div className="admin-chart-card-head">
            <h3>Total Sales by Sales Channel</h3>
            <span className="admin-chart-chip admin-chart-chip--scope" title={`${selectedMarketLabel} • ${selectedDateLabel}`}>
              <Icon name="clock" size={14} />
              {selectedMarketLabel} • {selectedDateLabel}
            </span>
          </div>
          <div className="admin-sales-channel-layout">
            <div className="admin-sales-channel-donut-wrap">
              <SalesChannelDonut
                channels={salesChannelRows}
                totalSales={salesChannelTotal}
                currency={salesChannelCurrency}
              />
            </div>
            <div className="admin-sales-channel-list">
              {salesChannelRows.length ? (
                salesChannelRows.map((channel) => (
                  <div key={channel.key} className="admin-sales-channel-row">
                    <span className="admin-sales-channel-label">
                      <span className="admin-sales-channel-dot" style={{ background: channel.color || "#20aeea" }} />
                      <span>{channel.label}</span>
                    </span>
                    <strong>{fmtMoney(channel.sales, salesChannelCurrency)}</strong>
                    <span className="admin-sales-channel-meta">
                      {Number(channel.orders || 0).toLocaleString()} orders · {Number(channel.share || 0).toFixed(1)}%
                    </span>
                    <span className={`admin-sales-channel-delta ${channel.delta === null || channel.delta === undefined ? "flat" : channel.delta >= 0 ? "up" : "down"}`}>
                      {formatStepDelta(channel.delta)}
                    </span>
                  </div>
                ))
              ) : (
                <EmptyState title="No sales yet" message="Sales channel data will appear here once transactions are recorded." />
              )}
            </div>
          </div>
          <div className="admin-sales-channel-footnote">
            <span>Online Store means customer checkout on the website.</span>
            <span>Draft Orders means staff-created orders on a customer&apos;s behalf.</span>
            <strong>{salesChannelOrderTotal.toLocaleString()} total orders</strong>
          </div>
        </section>
      </div>

      <div className="admin-chart-row">
        <section className="admin-chart-card admin-chart-card--full admin-status-mix-card">
          <div className="admin-chart-card-head">
            <h3>Order Status Mix</h3>
            <span className="admin-chart-chip admin-chart-chip--scope" title={`${selectedMarketLabel} • ${selectedDateLabel}`}>
              <Icon name="clock" size={14} />
              {selectedMarketLabel} • {selectedDateLabel}
            </span>
          </div>
          <div className="admin-status-mix-layout">
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
                <li className="admin-donut-empty">
                  <EmptyState title="No orders yet" message="Status mix will appear here once orders are placed." />
                </li>
              )}
            </ul>
            <div className="admin-status-mix-donut">
              <DonutChart values={statusMix} />
            </div>
          </div>
        </section>
      </div>

      <div className="admin-chart-row">
        <section className="admin-chart-card admin-chart-card--full">
          <div className="admin-chart-card-head admin-chart-card-head--filters">
            <h3>Top Products</h3>
            <div className="admin-top-products-filters">
              <span className="admin-chart-chip admin-chart-chip--scope">
                <Icon name="clock" size={14} />
                {selectedDateLabel}
              </span>
              <span className="admin-chart-chip admin-chart-chip--scope">
                <Icon name="globe" size={14} />
                {selectedMarketLabel}
              </span>
              <label className="admin-chart-chip admin-top-products-chip">
                <Icon name="star" size={14} />
                <select
                  className="admin-top-products-chip-select"
                  value={filters?.topMetric || "rating"}
                  onChange={(e) => onFiltersChange?.({ topMetric: e.target.value })}
                  aria-label="Top products metric filter"
                >
                  {TOP_PRODUCT_METRIC_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="admin-list-sm">
            {(data?.top_products || []).length ? (
              data.top_products.map((p, i) => (
                <div key={p.slug || i} className="admin-list-sm-item">
                  <span className="admin-list-sm-rank">{i + 1}</span>
                  <span className="admin-list-sm-name" title={p.name_en}>{p.name_en}</span>
                  <strong>{formatTopProductMetricValue(p, topProductsCurrency)}</strong>
                </div>
              ))
            ) : (
              <EmptyState title="No products yet" message="Top products will appear here based on the selected metric and date range." />
            )}
          </div>
        </section>
      </div>

      <div className="admin-chart-row admin-chart-row--2">
        <section className="admin-chart-card admin-chart-card--full admin-inventory-health-card">
          <div className="admin-chart-card-head">
            <h3>Inventory Health ({inventoryHealthCount.toLocaleString()})</h3>
            <span className="admin-chart-chip">
              <Icon name="box" size={14} />
              ≤ {inventoryThreshold} units
            </span>
          </div>
          {inventoryHealthCount > 0 ? (
            <>
              <div className="admin-inventory-health-list">
                {inventoryHealthProducts.map((product) => (
                  <div key={product.slug || product.id} className="admin-inventory-health-row">
                    <div className="admin-inventory-health-product">
                      {product.image ? (
                        <img className="admin-inventory-health-thumb" src={product.image} alt="" loading="lazy" />
                      ) : (
                        <span className="admin-inventory-health-thumb admin-inventory-health-thumb--empty" />
                      )}
                      <div className="admin-inventory-health-meta">
                        <strong title={product.name_en}>{product.name_en}</strong>
                        <span>{Number(product.stock_quantity || 0).toLocaleString()} units remaining</span>
                      </div>
                    </div>
                    <span className={`admin-badge ${getInventoryTone(product)}`}>{product.status_label || "Low Stock"}</span>
                    <button type="button" className="admin-btn-sm" onClick={() => onRestock?.(product)}>
                      Restock
                    </button>
                  </div>
                ))}
              </div>
              <div className="admin-inventory-health-footer">
                <button type="button" className="admin-btn-outline" onClick={onViewAllInventory}>
                  View All
                </button>
              </div>
            </>
          ) : (
            <div className="admin-inventory-health-empty">
              <EmptyState icon="✓" title="All products are healthy" message="No restocking needed right now. Great job keeping inventory in check!" />
            </div>
          )}
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

      <div className="admin-chart-row admin-chart-row--2">
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
              <EmptyState title="No customers yet" message="New customers will appear here as they register." />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
