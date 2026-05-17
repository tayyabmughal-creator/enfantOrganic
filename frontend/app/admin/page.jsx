import AdminPanelClient from "@/components/admin/AdminPanelClient";

export const metadata = {
  title: "Admin | EnfhantOrganic",
  description: "EnfhantOrganic staff operations panel.",
};

import ErrorBoundary from "@/components/ErrorBoundary";

export default function AdminPage() {
  return (
    <ErrorBoundary>
      <AdminPanelClient />
    </ErrorBoundary>
  );
}
