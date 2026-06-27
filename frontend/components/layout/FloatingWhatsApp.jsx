export default function FloatingWhatsApp({ locale = "en", navigation }) {
  const raw =
    navigation?.current_region?.whatsapp_phone ||
    navigation?.settings?.whatsapp_number ||
    "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;

  const label = locale === "ar" ? "تواصل عبر واتساب" : "Chat on WhatsApp";

  return (
    <a
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noopener noreferrer"
      className="floating-whatsapp"
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 48 48" width="32" height="32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="24" cy="24" r="22" fill="#25D366" />
        <path
          fill="white"
          d="M24 11C16.8 11 11 16.8 11 24c0 2.3.6 4.4 1.6 6.3L11 37l6.9-1.6c1.8.9 3.8 1.4 5.9 1.4 7.2 0 13-5.8 13-13S31.2 11 24 11zm0 23.8c-2 0-3.9-.5-5.5-1.4l-.4-.2-3.8.9 1-3.7-.3-.4c-1-1.7-1.6-3.7-1.6-5.8 0-5.9 4.8-10.7 10.7-10.7S34.8 18.1 34.8 24 30 34.8 24 34.8zm5.9-7.9c-.3-.2-1.8-.9-2.1-1s-.5-.2-.7.2-.8 1-1 1.2-.4.3-.7.1c-1.9-.9-3.2-1.7-4.4-3.8-.3-.6.3-.5.9-1.7.1-.2.1-.4-.1-.6l-1.5-3.7c-.4-.9-.8-.8-1.1-.8h-.9c-.3 0-.7.1-1.1.5-.4.4-1.4 1.3-1.4 3.2s1.4 3.7 1.6 4 2.8 4.2 6.7 5.9c2.5 1 3.4 1.1 4.7.9.7-.1 2.3-1 2.6-1.9.3-.9.3-1.7.2-1.9 0-.2-.3-.3-.6-.5z"
        />
      </svg>
    </a>
  );
}
