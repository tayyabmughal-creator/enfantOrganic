import Link from "next/link";

export const metadata = {
  title: "Offline | Enfant Organics",
};

export default function OfflinePage() {
  return (
    <main className="section container" style={{ minHeight: "70vh", display: "grid", placeItems: "center" }}>
      <div style={{ maxWidth: "560px", textAlign: "center", display: "grid", gap: "12px" }}>
        <h1 style={{ margin: 0 }}>You are offline</h1>
        <p style={{ margin: 0, color: "var(--text-soft)" }}>
          Please reconnect and try again.
        </p>
        <p style={{ margin: 0, color: "var(--text-soft)" }}>
          أنت غير متصل بالإنترنت، يرجى إعادة الاتصال والمحاولة مرة أخرى.
        </p>
        <div style={{ marginTop: "8px" }}>
          <Link className="primary-action" href="/en?region=om">
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
