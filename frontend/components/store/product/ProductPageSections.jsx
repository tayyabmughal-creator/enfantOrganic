import SiteImage from "@/components/ui/SiteImage";
import ProductHowItWorksRail from "@/components/store/product/ProductHowItWorksRail";

const ICON_PATHS = {
  leaf: <path d="M17 8C8 10 5.9 16.17 3.82 22a10.94 10.94 0 0 0 3.33-4.26C7.86 21.5 12 22 14 20c6-5 4-14 3-16z" />,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  drop: <path d="M12 2.5s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 9.5 12 2.5 12 2.5z" />,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" />,
  sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  check: <polyline points="20 6 9 17 4 12" />,
  star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </>
  ),
};

// Headline with its last word(s) sitting on a soft highlighter stroke.
export function MarkedTitle({ text }) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return <>{text}</>;
  const marked = words.length <= 3 ? 1 : 2;
  return (
    <>
      {words.slice(0, -marked).join(" ")} <span className="product-title-mark">{words.slice(-marked).join(" ")}</span>
    </>
  );
}

function FeatureIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name] || ICON_PATHS.leaf}
    </svg>
  );
}

export function ProductFeaturesSection({ features, productName }) {
  if (!features?.items?.length) return null;
  return (
    <section className={`product-extra-section product-features-section${features.image ? " has-media" : ""}`}>
      {features.title ? (
        <h3 className="product-section-heading product-features-title">
          <MarkedTitle text={features.title} />
        </h3>
      ) : null}
      {features.image ? (
        <div className="product-features-media">
          <SiteImage src={features.image} alt={features.title || productName || ""} width={900} height={900} sizes="(max-width: 900px) 100vw, 560px" />
        </div>
      ) : null}
      <ul className="product-features-grid">
        {features.items.map((item, index) => (
          <li key={`${item.title}-${index}`} className="product-feature">
            <span className="product-feature-icon">
              <FeatureIcon name={item.icon} />
            </span>
            <strong className="product-feature-title">{item.title}</strong>
            {item.text ? <p className="product-feature-text">{item.text}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProductHowItWorksSection({ section, proofItems, isAr }) {
  if (!section?.steps?.length) return null;
  const proof = Array.isArray(proofItems) ? proofItems.filter((item) => item?.value || item?.text) : [];
  const heading = section.title || (isAr ? "كيف يعمل" : "How it works");
  return (
    <section className="product-extra-section product-hiw-section">
      <h3 className="product-section-heading product-hiw-heading">
        <MarkedTitle text={heading} />
      </h3>
      {section.subtitle ? <p className="product-extra-subtitle">{section.subtitle}</p> : null}
      <ProductHowItWorksRail steps={section.steps} heading={heading} isAr={isAr} />
      {proof.length ? (
        <div className="product-proof-ticker">
          <div className="product-proof-track">
            {[0, 1].map((copy) => (
              <ul key={copy} className="product-proof-list" aria-hidden={copy === 1 ? "true" : undefined}>
                {proof.map((item, index) => (
                  <li key={`${copy}-${index}`} className="product-proof-item">
                    <strong>{item.value || item.text}</strong>
                    {item.label ? <span>{item.label}</span> : null}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ComparisonCell({ value, highlighted, isAr }) {
  if (typeof value === "string" && value) {
    return <span className="product-compare-text">{value}</span>;
  }
  const yes = value === true;
  return (
    <span
      className={`product-compare-mark ${yes ? "is-yes" : "is-no"}${highlighted ? " is-brand" : ""}`}
      role="img"
      aria-label={yes ? (isAr ? "نعم" : "Yes") : (isAr ? "لا" : "No")}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {yes ? <polyline points="20 6 9 17 4 12" /> : <path d="M6 6l12 12M18 6L6 18" />}
      </svg>
    </span>
  );
}

export function ProductComparisonSection({ section, isAr }) {
  if (!section?.rows?.length) return null;
  const heading = section.title || (isAr ? "كيف نتفوق" : "How we stack up");
  return (
    <section className="product-extra-section product-compare-section">
      <h3 className="product-section-heading product-compare-heading">
        <MarkedTitle text={heading} />
      </h3>
      {section.subtitle ? <p className="product-extra-subtitle">{section.subtitle}</p> : null}
      <div className="product-compare-table" role="table" aria-label={heading}>
        <div className="product-compare-row product-compare-head" role="row">
          <span className="product-compare-cell" role="columnheader" />
          <span className="product-compare-cell product-compare-us" role="columnheader">
            <em className="product-compare-badge">{isAr ? "موصى به" : "RECOMMENDED"}</em>
            <strong>{section.us_label || (isAr ? "نحن" : "Us")}</strong>
          </span>
          <span className="product-compare-cell product-compare-other" role="columnheader">
            <strong>{section.other_label || (isAr ? "الآخرون" : "Others")}</strong>
          </span>
        </div>
        {section.rows.map((row, index) => (
          <div key={`${row.label}-${index}`} className="product-compare-row" role="row">
            <span className="product-compare-cell product-compare-label" role="rowheader">{row.label}</span>
            <span className="product-compare-cell product-compare-us" role="cell">
              <ComparisonCell value={row.us} highlighted isAr={isAr} />
            </span>
            <span className="product-compare-cell product-compare-other" role="cell">
              <ComparisonCell value={row.other} isAr={isAr} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
