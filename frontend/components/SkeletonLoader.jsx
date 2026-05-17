"use client";

export default function SkeletonLoader({ count = 3, type = "list" }) {
  if (type === "grid") {
    return (
      <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div className="skeleton-pulse" style={{ width: "100%", aspectRatio: "1", borderRadius: "8px", background: "var(--surface-color, #f0f3ed)" }} />
            <div className="skeleton-pulse" style={{ width: "80%", height: "1.25rem", borderRadius: "4px", background: "var(--surface-color, #f0f3ed)" }} />
            <div className="skeleton-pulse" style={{ width: "40%", height: "1rem", borderRadius: "4px", background: "var(--surface-color, #f0f3ed)" }} />
          </div>
        ))}
      </div>
    );
  }

  // default: list
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <div className="skeleton-pulse" style={{ width: "48px", height: "48px", borderRadius: "8px", background: "var(--surface-color, #f0f3ed)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1 }}>
            <div className="skeleton-pulse" style={{ width: "40%", height: "1.25rem", borderRadius: "4px", background: "var(--surface-color, #f0f3ed)" }} />
            <div className="skeleton-pulse" style={{ width: "20%", height: "1rem", borderRadius: "4px", background: "var(--surface-color, #f0f3ed)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
