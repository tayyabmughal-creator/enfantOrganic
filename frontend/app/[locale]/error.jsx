"use client";

export default function Error({ error, reset }) {
  return (
    <main className="error-boundary-container">
      <section className="error-boundary-card">
        <div className="error-boundary-icon">⚠</div>
        <h2>Something went wrong</h2>
        <p>{error?.message || "An unexpected error occurred while loading this page."}</p>
        <button onClick={() => reset()} className="error-boundary-btn">
          Try again
        </button>
      </section>
      <style jsx>{`
        .error-boundary-container {
          min-height: 60vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }
        .error-boundary-card {
          text-align: center;
          max-width: 480px;
          padding: 2.5rem;
          background: rgba(255, 255, 255, 0.85);
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);
        }
        .error-boundary-icon {
          font-size: 2.5rem;
          margin-bottom: 1rem;
        }
        h2 {
          font-size: 1.25rem;
          color: #1a1a1a;
          margin-bottom: 0.5rem;
        }
        p {
          color: #666;
          font-size: 0.9rem;
          line-height: 1.6;
          margin-bottom: 1.5rem;
        }
        .error-boundary-btn {
          background: var(--brand, #4b6043);
          color: #fff;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-size: 0.9rem;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .error-boundary-btn:hover {
          opacity: 0.9;
        }
      `}</style>
    </main>
  );
}
