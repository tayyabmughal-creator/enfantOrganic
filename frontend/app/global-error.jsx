"use client";

export default function GlobalError({ error, reset }) {
  return (
    <html>
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, -apple-system, sans-serif",
            background: "#fafaf8",
            padding: "2rem",
          }}
        >
          <section style={{ textAlign: "center", maxWidth: 480 }}>
            <h1 style={{ fontSize: "1.5rem", color: "#1a1a1a", marginBottom: "0.75rem" }}>
              Something went wrong
            </h1>
            <p style={{ color: "#666", fontSize: "0.95rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>
              An unexpected error occurred. This has been logged automatically.
            </p>
            <button
              onClick={() => reset()}
              style={{
                background: "#4b6043",
                color: "#fff",
                border: "none",
                padding: "0.75rem 1.5rem",
                borderRadius: "8px",
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
