import FloatingWhatsApp from "@/components/layout/FloatingWhatsApp";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import DiscountPopup from "@/components/store/DiscountPopup";
import AnalyticsConsentBanner from "@/components/store/analytics/AnalyticsConsentBanner";
import AnalyticsScripts from "@/components/store/analytics/AnalyticsScripts";

export default function StorefrontShell({ children, locale, navigation }) {
  return (
    <div className="storefront-shell">
      <AnalyticsScripts settings={navigation?.settings} />
      <Header navigation={navigation} />
      <main className="storefront-main">{children}</main>
      <Footer locale={locale} navigation={navigation} />
      <FloatingWhatsApp locale={locale} navigation={navigation} />
      <DiscountPopup locale={locale} navigation={navigation} />
      <AnalyticsConsentBanner locale={locale} />
    </div>
  );
}
