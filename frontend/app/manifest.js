export default function manifest() {
  return {
    name: "Enfant Organics",
    short_name: "Enfant",
    description: "Regional bilingual baby-care storefront for Oman, UAE, and KSA.",
    start_url: "/en?region=om",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f8f9f4",
    lang: "en",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
