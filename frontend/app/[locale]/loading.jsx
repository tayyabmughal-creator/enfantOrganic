"use client";

export default function Loading() {
  return (
    <main className="page-loading-container">
      <div className="page-loading-spinner" />
      <style jsx>{`
        .page-loading-container {
          min-height: 60vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .page-loading-spinner {
          width: 36px;
          height: 36px;
          border: 3px solid rgba(75, 96, 67, 0.15);
          border-top-color: var(--brand, #4b6043);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}
