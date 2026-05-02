import StoreProvider from "@/components/store/cart/StoreProvider";

import "./globals.css";

export const metadata = {
  title: "Enfant Organics",
  description: "Regional bilingual baby-care storefront built with Next.js and Django.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
