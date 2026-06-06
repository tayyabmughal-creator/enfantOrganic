export function statusTone(value = "") {
  const v = String(value).toLowerCase();
  if (["paid", "delivered", "confirmed", "approved", "active", "true"].includes(v)) return "success";
  if (["pending", "processing", "review"].includes(v)) return "warning";
  if (["failed", "cancelled", "returned", "refunded", "false"].includes(v)) return "danger";
  return "neutral";
}

export function AdminEmpty({ label }) {
  return (
    <div className="admin-empty">
      <strong>No {label} yet</strong>
      <span>Records will appear here with status labels and quick actions.</span>
    </div>
  );
}

export function EmptyState({ icon, title, message }) {
  return (
    <div className="admin-empty-state">
      {icon ? <span className="admin-empty-state-icon">{icon}</span> : null}
      {title ? <strong>{title}</strong> : null}
      {message ? <span>{message}</span> : null}
    </div>
  );
}

export function AdminToast({ toast }) {
  const icons = { success: "✓", error: "✕", info: "●" };
  return (
    <div className={`admin-toast toast-${toast.type}`} role="alert">
      <span className="toast-icon">{icons[toast.type] || "●"}</span>
      {toast.message}
    </div>
  );
}

export function RevenueChart({ values }) {
  const fallback = [{ label: "Feb", value: 0 }, { label: "Mar", value: 4200 }, { label: "Apr", value: 2800 }, { label: "May", value: 6100 }];
  const pts  = values?.length ? values : fallback;
  const max  = Math.max(...pts.map((p) => p.value), 1);
  const step = 300 / Math.max(pts.length - 1, 1);
  const coords = pts.map((p, i) => `${40 + i * step},${180 - (p.value / max) * 150}`).join(" ");
  const last = 40 + (pts.length - 1) * step;

  return (
    <svg className="admin-line-chart" viewBox="0 0 380 220" role="img" aria-label="Revenue trend chart">
      {[30, 80, 130, 180].map((y) => <line key={y} x1="38" x2="350" y1={y} y2={y} />)}
      <defs>
        <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={`40,180 ${coords} ${last},180`} fill="url(#rev-grad)" />
      <polyline points={coords} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={p.label}>
          <circle cx={40 + i * step} cy={180 - (p.value / max) * 150} r="4" fill="var(--brand)" />
          <text x={40 + i * step} y="210">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

export function DonutChart({ values }) {
  const items = Array.isArray(values)
    ? values.filter((item) => Number(item?.count || 0) > 0)
    : [];
  const total = items.reduce((sum, item) => sum + Number(item?.count || 0), 0);
  const colors = ["#c9a84c", "#92ab69", "#607a42", "#62b5e8", "#df5750", "#8a82ff"];
  const totalText = total.toLocaleString();
  const totalFontSize = totalText.length > 5 ? 22 : totalText.length > 3 ? 24 : 28;
  let offset = 25;
  return (
    <svg className="admin-donut-chart" viewBox="0 0 220 220" role="img" aria-label="Order status donut chart">
      <circle cx="110" cy="110" r="66" fill="none" stroke="#f0f3ed" strokeWidth="28" />
      {total > 0
        ? items.map((item, i) => {
            const len = (Number(item.count || 0) / total) * 315;
            const el = (
              <circle
                key={item.status || i}
                cx="110"
                cy="110"
                r="66"
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth="28"
                strokeDasharray={`${len} 315`}
                strokeDashoffset={-offset}
                style={{ transform: "rotate(-90deg)", transformOrigin: "110px 110px" }}
              />
            );
            offset += len;
            return el;
          })
        : null}
      <text x="110" y="97" textAnchor="middle" className="admin-donut-center-label">Orders</text>
      <text
        x="110"
        y="128"
        textAnchor="middle"
        className="admin-donut-center-value"
        style={{ fontSize: `${totalFontSize}px` }}
      >
        {totalText}
      </text>
    </svg>
  );
}
