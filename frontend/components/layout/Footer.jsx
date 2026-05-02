import { uiText } from "@/lib/storefront";

export default function Footer({ locale, navigation }) {
  const t = uiText(locale);

  return (
    <footer className="site-footer">
      <div className="container footer-panel">
        <div className="footer-column footer-brand">
          <div className="footer-brand-lockup">
            <img src="/enfant/enfant-logo.png" alt="Enfant Organics" className="footer-logo" />
            <div>
              <h4>ENFANT ORGANICS</h4>
              <span>{locale === "en" ? "Pure • Gentle • Safe" : "نقي • لطيف • آمن"}</span>
            </div>
          </div>
          <p>{navigation.settings.footer_about}</p>
        </div>

        <div className="footer-column">
          <h5>{locale === "en" ? "Policies & Guidelines" : "السياسات والإرشادات"}</h5>
          <div className="footer-links">
            {navigation.settings.policy_links.map((item) => (
              <a key={item.label} href={item.href}>
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div className="footer-column">
          <h5>{locale === "en" ? "Contact Us" : "اتصل بنا"}</h5>
          <div className="footer-links">
            <span>{navigation.current_region.contact_phone}</span>
            <span>{navigation.current_region.contact_email}</span>
            <span>{navigation.current_region.address}</span>
          </div>
        </div>
      </div>
      <div className="container footer-bottom">
        <div className="footer-chip-row">
          <span>{t.freeShipping}</span>
          <span>{t.originalProducts}</span>
          <span>{t.securePayment}</span>
        </div>
        <div className="footer-chip-row">
          {navigation.regions.map((region) => (
            <span key={region.code} className="footer-currency-chip">
              {region.currency_code}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
