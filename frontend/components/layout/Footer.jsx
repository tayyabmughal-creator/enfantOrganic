import { uiText } from "@/lib/storefront";
import { resolveNavigationHref } from "@/lib/navigationLinks";
import FooterCurrencyChips from "./FooterCurrencyChips";

const SOCIAL_ICONS = {
  facebook_url:  { label: "Facebook",  svg: "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" },
  instagram_url: { label: "Instagram", svg: "M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37zM17.5 6.5h.01M6.5 2h11A4.5 4.5 0 0 1 22 6.5v11a4.5 4.5 0 0 1-4.5 4.5h-11A4.5 4.5 0 0 1 2 17.5v-11A4.5 4.5 0 0 1 6.5 2z" },
  twitter_url:   { label: "X / Twitter", svg: "M4 4l16 16M4 20 20 4" },
  youtube_url:   { label: "YouTube",  svg: "M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" },
  tiktok_url:    { label: "TikTok",   svg: "M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" },
  whatsapp_number: { label: "WhatsApp", svg: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" },
};

function SocialLink({ href, icon }) {
  const url = icon.label === "WhatsApp" ? `https://wa.me/${href.replace(/\D/g, "")}` : href;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="footer-social-link" aria-label={icon.label}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={icon.svg} />
      </svg>
    </a>
  );
}

export default function Footer({ locale, navigation }) {
  const t = uiText(locale);
  const s = navigation.settings;
  const logoSrc = s.logo_url || "/enfant/enfant-logo.png";
  const tagline = s.tagline || (locale === "en" ? "Pure • Gentle • Safe" : "نقي • لطيف • آمن");
  const copyright = s.copyright || (locale === "en" ? `© ${new Date().getFullYear()} Enfant Organics` : `© ${new Date().getFullYear()} إنفانت أورغانيكس`);

  const contactPhone = s.contact_phone || navigation.current_region?.contact_phone;
  const contactEmail = s.contact_email || navigation.current_region?.contact_email;
  const address = s.address || navigation.current_region?.address;
  const region = navigation.current_region?.code || "om";

  const socialLinks = Object.entries(SOCIAL_ICONS).filter(([key]) => s[key]);

  return (
    <footer className="site-footer">
      <div className="container footer-panel">
        <div className="footer-column footer-brand">
          <div className="footer-brand-lockup">
            <img src={logoSrc} alt={s.brand_name || "Enfant Organics"} className="footer-logo" />
            <div>
              <h4>{(s.brand_name || "ENFANT ORGANICS").toUpperCase()}</h4>
              <span>{tagline}</span>
            </div>
          </div>
          <p>{s.footer_about}</p>
          {socialLinks.length > 0 && (
            <div className="footer-social-row">
              {socialLinks.map(([key, icon]) => (
                <SocialLink key={key} href={s[key]} icon={icon} />
              ))}
            </div>
          )}
        </div>

        <div className="footer-column">
          <h5>{locale === "en" ? "Policies & Guidelines" : "السياسات والإرشادات"}</h5>
          <div className="footer-links">
            {s.policy_links.map((item) => (
              <a
                key={item.label}
                href={resolveNavigationHref(item.href, { locale, region })}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div className="footer-column">
          <h5>{locale === "en" ? "Contact Us" : "اتصل بنا"}</h5>
          <div className="footer-links">
            {contactPhone && <span>{contactPhone}</span>}
            {contactEmail && <span>{contactEmail}</span>}
            {address && <span>{address}</span>}
          </div>
        </div>
      </div>
      <div className="container footer-bottom">
        <div className="footer-chip-row">
          <span>{t.freeShipping}</span>
          <span>{t.originalProducts}</span>
          <span>{t.securePayment}</span>
        </div>
        <div className="footer-chip-row footer-copyright-row">
          <FooterCurrencyChips regions={navigation.regions} currentRegionCode={region} />
          <span className="footer-copyright">{copyright}</span>
        </div>
      </div>
    </footer>
  );
}
