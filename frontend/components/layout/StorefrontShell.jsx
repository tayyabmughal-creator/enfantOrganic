import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import { isRtl } from "@/lib/storefront";

export default function StorefrontShell({
  children,
  locale,
  navigation,
}) {
  return (
    <div className="storefront-shell" dir={isRtl(locale) ? "rtl" : "ltr"}>
      <Header locale={locale} navigation={navigation} />
      <main className="storefront-main">{children}</main>
      <Footer locale={locale} navigation={navigation} />
    </div>
  );
}
