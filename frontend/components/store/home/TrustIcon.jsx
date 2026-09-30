const INK = "#1f2a1c";

const ICONS = {
  truck: (
    <>
      <rect x="4" y="16" width="34" height="24" rx="3" fill="#f6c76b" stroke={INK} strokeWidth="2.4" />
      <rect x="15" y="16" width="9" height="8" fill="#e8534a" stroke={INK} strokeWidth="2.4" />
      <path d="M38 24h10l8 9v7H38z" fill="#4fa3d9" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M43 28h5l3 4h-8z" fill="#dff1fb" />
      <path d="M10 30h10M10 35h7" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="17" cy="42" r="5" fill="#4a5a44" stroke={INK} strokeWidth="2.4" />
      <circle cx="46" cy="42" r="5" fill="#4a5a44" stroke={INK} strokeWidth="2.4" />
    </>
  ),
  shield: (
    <>
      <path d="M32 6l18 6v14c0 13-8 23-18 28C22 49 14 39 14 26V12z" fill="#f6b73c" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M32 12l12 4v10c0 9-5 16-12 20z" fill="#fbd575" />
      <path d="M23 29l7 7 12-14" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  leaf: (
    <>
      <path d="M12 52C10 30 24 12 52 10c2 26-12 42-34 42z" fill="#7fbf5a" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M32 10c6 4 12 6 20 0C49 26 40 38 26 46z" fill="#a4d67f" />
      <path d="M12 52C22 40 32 30 44 20" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  star: (
    <>
      <path d="M32 6l7.6 16.2 17.6 2.2-13 12.2 3.4 17.6L32 45.6 16.4 54.2 19.8 36.6 6.8 24.4l17.6-2.2z" fill="#f9cf4a" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M32 14l4.6 10 10.8 1.4-8 7.4 2.1 10.8L32 37.8z" fill="#fde58f" />
    </>
  ),
  check: (
    <>
      <circle cx="32" cy="32" r="24" fill="#7fbf5a" stroke={INK} strokeWidth="2.4" />
      <circle cx="32" cy="32" r="17" fill="#a4d67f" />
      <path d="M21 33l8 8 15-17" fill="none" stroke={INK} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export default function TrustIcon({ name, image }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" width={64} height={64} loading="lazy" className="home-trust-image" />;
  }
  const shapes = ICONS[name];
  if (!shapes) return null;
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false">
      {shapes}
    </svg>
  );
}
