import { redirect } from "next/navigation";

import { buildStorePath, DEFAULT_LOCALE, DEFAULT_REGION } from "@/lib/storefront";

// Middleware normally redirects "/" to the visitor's saved storefront before this
// renders; this is the fallback for when it doesn't run, and it matches x-default.
export default function RootPage() {
  redirect(buildStorePath(DEFAULT_LOCALE, "", DEFAULT_REGION));
}
