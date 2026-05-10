"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE    = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api";
const TOKEN_KEY   = "enfhant-admin-token";
const REFRESH_KEY = "enfhant-admin-refresh";

// ─── Navigation ───────────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: "Store",
    items: [
      { key: "dashboard",  label: "Dashboard",   icon: "⊞", endpoint: "/admin/dashboard/",  desc: "Live store signals and KPIs." },
      { key: "orders",     label: "Orders",       icon: "▤", endpoint: "/admin/orders/",      desc: "Manage and fulfil customer orders." },
      { key: "customers",  label: "Customers",    icon: "♙", endpoint: "/admin/customers/",   desc: "Customer accounts and history." },
    ],
  },
  {
    label: "Catalog",
    items: [
      { key: "products",   label: "Products",    icon: "◇", endpoint: "/admin/products/",    desc: "Create and manage product listings." },
      { key: "categories", label: "Categories",  icon: "☰", endpoint: "/admin/categories/",  desc: "Organise products into categories." },
      { key: "inventory",  label: "Inventory",   icon: "▦", endpoint: "/admin/products/",    desc: "Stock levels and reorder alerts." },
    ],
  },
  {
    label: "Content",
    items: [
      { key: "blog",       label: "Blog",        icon: "✍", endpoint: "/admin/blog-posts/",  desc: "Articles, guides, and brand stories." },
      { key: "homepage",   label: "Homepage",    icon: "⌂", endpoint: "/admin/settings/",    desc: "Hero cards, footer, and announcements." },
      { key: "seo",        label: "SEO",         icon: "◎", endpoint: null,                  desc: "Meta tags, sitemap, and indexing." },
    ],
  },
  {
    label: "Marketing",
    items: [
      { key: "deals",      label: "Promotions",     icon: "✺", endpoint: "/admin/promotions/", desc: "Coupons, codes, and deals." },
      { key: "giftcards",  label: "Gift Cards",     icon: "◈", endpoint: null,                 desc: "Issue and track gift cards." },
      { key: "abandoned",  label: "Abandoned Cart", icon: "◷", endpoint: null,                 desc: "Recover abandoned checkouts." },
      { key: "newsletter", label: "Newsletter",     icon: "▢", endpoint: "/admin/moderation/", desc: "Subscribers and campaigns." },
    ],
  },
  {
    label: "Analytics",
    items: [
      { key: "analytics",  label: "Analytics",  icon: "▥", endpoint: "/admin/dashboard/",  desc: "Revenue, funnels, and trends." },
      { key: "insights",   label: "Insights",   icon: "◑", endpoint: "/admin/customers/",   desc: "Segments, LTV, and cohorts." },
      { key: "reports",    label: "Reports",    icon: "⇩", endpoint: "/admin/moderation/",  desc: "CSV exports and health checks." },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "reviews",  label: "Reviews",  icon: "★", endpoint: "/admin/reviews/", desc: "Approve and moderate reviews." },
      { key: "returns",  label: "Returns",  icon: "↩", endpoint: null,               desc: "Return requests and refunds." },
      { key: "shipping", label: "Shipping", icon: "◁", endpoint: null,               desc: "Zones, carriers, and rates." },
    ],
  },
  {
    label: "Integrations",
    items: [
      { key: "social",          label: "Social Media",    icon: "◉", endpoint: null, desc: "Facebook, TikTok, and Instagram." },
      { key: "marketing_tools", label: "Marketing Tools", icon: "⊗", endpoint: null, desc: "Google Ads, Analytics, and email." },
      { key: "apps",            label: "App Store",       icon: "⊕", endpoint: null, desc: "Third-party apps and extensions." },
    ],
  },
  {
    label: "Settings",
    items: [
      { key: "payments", label: "Payments", icon: "▭", endpoint: "/admin/payments/", desc: "Providers and transactions." },
      { key: "taxes",    label: "Taxes",    icon: "◫", endpoint: null,               desc: "Tax zones and VAT compliance." },
      { key: "staff",    label: "Staff",    icon: "⚙", endpoint: null,               desc: "Accounts, roles, and permissions." },
      { key: "regions",  label: "Regions",  icon: "◌", endpoint: null,               desc: "Currencies and locale config." },
    ],
  },
];

const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);

// ─── Field configs ─────────────────────────────────────────────────────────────

const ORDER_STATUS    = [["pending","Pending"],["confirmed","Confirmed"],["preparing","Preparing"],["ready","Ready"],["out_for_delivery","Out for delivery"],["delivered","Delivered"],["cancelled","Cancelled"]];
const PAYMENT_STATUS  = [["unpaid","Unpaid"],["review","Needs review"],["paid","Paid"],["refunded","Refunded"]];
const PAYMENT_METHOD  = [["cod","Cash on delivery"],["whatsapp","WhatsApp"],["bank_transfer","Bank transfer"],["online","Online"]];
const PAYMENT_PROVIDER = [["cod","Cash on delivery"],["whatsapp","WhatsApp"],["bank_transfer","Bank transfer"],["online","Online"],["stripe","Stripe"],["tap","Tap"],["paytabs","PayTabs"],["hyperpay","HyperPay"],["checkout_com","Checkout.com"]];

const FIELD_CONFIGS = {
  products: [
    ["slug","Slug","text"],["name_en","Name EN","text"],["name_ar","Name AR","text"],
    ["brand","Brand","text"],["unit","Unit / weight","text"],["category","Category ID","number"],
    ["vendor_en","Vendor EN","text"],["vendor_ar","Vendor AR","text"],
    ["short_description_en","Short description EN","textarea"],["short_description_ar","Short description AR","textarea"],
    ["description_en","Description EN","textarea"],["description_ar","Description AR","textarea"],
    ["ingredients_en","Ingredients EN","textarea"],["ingredients_ar","Ingredients AR","textarea"],
    ["usage_instructions_en","Usage EN","textarea"],["usage_instructions_ar","Usage AR","textarea"],
    ["origin_source_en","Origin EN","text"],["origin_source_ar","Origin AR","text"],
    ["organic_certification_name","Certification","text"],["shelf_life","Shelf life","text"],
    ["expiry_date","Expiry date","date"],["badge_en","Badge EN","text"],["badge_ar","Badge AR","text"],
    ["review_count","Review count","number"],["rating","Rating","number"],
    ["image","Image URL","text"],["image_file","Image File","file"],
    ["hover_image","Hover image URL","text"],["hover_image_file","Hover Image File","file"],
    ["gallery","Gallery JSON","json"],["option_groups_en","Options EN JSON","json"],["option_groups_ar","Options AR JSON","json"],
    ["details_en","Details EN JSON","json"],["details_ar","Details AR JSON","json"],
    ["dietary_tags","Dietary tags JSON","json"],["stock_quantity","Stock","number"],
    ["track_inventory","Track inventory","checkbox"],["show_in_new_arrivals","New arrivals","checkbox"],
    ["show_in_baby_sets","Baby sets","checkbox"],["show_in_top_choices","Top choices","checkbox"],
    ["is_published","Active","checkbox"],["is_featured","Featured","checkbox"],["sort_order","Sort order","number"],
  ],
  categories: [
    ["slug","Slug","text"],["name_en","Name EN","text"],["name_ar","Name AR","text"],
    ["description_en","Description EN","textarea"],["description_ar","Description AR","textarea"],
    ["image","Image URL","text"],["image_file","Image File","file"],["sort_order","Sort order","number"],
  ],
  deals: [
    ["code","Code","text"],["description","Description","textarea"],
    ["discount_type","Discount type","select",[["percentage","Percentage"],["fixed","Fixed amount"],["free_shipping","Free shipping"]]],
    ["value","Value","number"],["minimum_subtotal","Minimum subtotal","number"],
    ["max_uses","Usage limit","number"],["starts_at","Starts at","datetime-local"],
    ["ends_at","Ends at","datetime-local"],["is_active","Active","checkbox"],
  ],
  orders: [
    ["status","Order status","select",ORDER_STATUS],
    ["payment_method","Payment method","select",PAYMENT_METHOD],
    ["payment_status","Payment status","select",PAYMENT_STATUS],
    ["tracking_number","Tracking number","text"],["tracking_url","Tracking URL","text"],
    ["notes","Notes","textarea"],
  ],
  payments: [
    ["order","Order ID","number"],["provider","Provider","select",PAYMENT_PROVIDER],
    ["provider_reference","Provider reference","text"],["amount","Amount","number"],
    ["currency_code","Currency","text"],
    ["status","Payment status","select",[["pending","Pending"],["authorized","Authorized"],["paid","Paid"],["failed","Failed"],["cancelled","Cancelled"],["refunded","Refunded"]]],
    ["raw_response","Raw response JSON","json"],
  ],
  customers: [
    ["username","Username","text"],["email","Email","email"],["password","Password","password"],
    ["first_name","First name","text"],["last_name","Last name","text"],
    ["is_active","Active","checkbox"],["is_staff","Staff access","checkbox"],
  ],
  reviews: [
    ["product","Product ID","number"],["order","Order ID","number"],
    ["customer_name","Customer name","text"],["rating","Rating","number"],
    ["title","Title","text"],["comment","Comment","textarea"],
    ["is_verified_purchase","Verified purchase","checkbox"],["is_approved","Approved","checkbox"],
  ],
  blog: [
    ["slug","Slug","text"],["title_en","Title EN","text"],["title_ar","Title AR","text"],
    ["excerpt_en","Excerpt EN","textarea"],["excerpt_ar","Excerpt AR","textarea"],
    ["body_en","Body EN","textarea"],["body_ar","Body AR","textarea"],
    ["image","Cover image URL","text"],["image_file","Cover image file","file"],
    ["category_en","Category EN","text"],["category_ar","Category AR","text"],
    ["published_at","Publish date","date"],["is_published","Published","checkbox"],
    ["sort_order","Sort order","number"],
  ],
  homepage: [
    ["brand_name","Brand name","text"],
    ["announcement_en","Announcement EN","text"],["announcement_ar","Announcement AR","text"],
    ["footer_about_en","Footer about EN","textarea"],["footer_about_ar","Footer about AR","textarea"],
    ["newsletter_title_en","Newsletter title EN","text"],["newsletter_title_ar","Newsletter title AR","text"],
    ["newsletter_subtitle_en","Newsletter subtitle EN","textarea"],["newsletter_subtitle_ar","Newsletter subtitle AR","textarea"],
    ["instagram_title_en","Instagram title EN","text"],["instagram_title_ar","Instagram title AR","text"],
    ["instagram_cta_en","Instagram CTA EN","text"],["instagram_cta_ar","Instagram CTA AR","text"],
    ["blog_title_en","Blog title EN","text"],["blog_title_ar","Blog title AR","text"],
    ["free_gift_title_en","Free gift title EN","text"],["free_gift_title_ar","Free gift title AR","text"],
    ["free_gift_subtitle_en","Free gift subtitle EN","textarea"],["free_gift_subtitle_ar","Free gift subtitle AR","textarea"],
    ["why_choose_links","Why choose links JSON","json"],["policy_links","Policy links JSON","json"],
    ["static_links","Static links JSON","json"],
  ],
};

const CREATE_DEFAULTS = {
  products:   { slug:"",name_en:"",name_ar:"",brand:"Enfant",unit:"",category:"",image:"",hover_image:"",dietary_tags:[],gallery:[],details_en:[],details_ar:[],option_groups_en:[],option_groups_ar:[],stock_quantity:0,rating:5,review_count:0,track_inventory:false,is_published:true,is_featured:false,sort_order:0 },
  categories: { slug:"",name_en:"",name_ar:"",description_en:"",description_ar:"",image:"",sort_order:0 },
  deals:      { code:"",description:"",discount_type:"fixed",value:0,minimum_subtotal:0,max_uses:"",starts_at:"",ends_at:"",is_active:true },
  customers:  { username:"",email:"",password:"",first_name:"",last_name:"",is_active:true,is_staff:false },
  payments:   { order:"",provider:"cod",provider_reference:"",amount:0,currency_code:"OMR",status:"pending",raw_response:{} },
  reviews:    { product:"",order:"",customer_name:"",rating:5,title:"",comment:"",is_verified_purchase:false,is_approved:false },
  blog:       { slug:"",title_en:"",title_ar:"",excerpt_en:"",excerpt_ar:"",body_en:"",body_ar:"",image:"",category_en:"",category_ar:"",published_at:"",is_published:false,sort_order:0 },
};

const CRUD_KEYS     = ["products","categories","deals","customers","payments","reviews","blog"];
const DELETABLE     = ["products","categories","deals","customers","payments","reviews","blog"];
const REPORT_TYPES  = ["orders","customers","inventory","low-stock"];

// ─── Placeholder configs ───────────────────────────────────────────────────────

const PLACEHOLDER_CONFIGS = {
  seo: {
    icon: "◎", badge: "Coming Soon", title: "SEO Manager",
    description: "Control how your storefront appears in search results. Configure meta titles, Open Graph tags, structured data, and sitemap generation per page, product, and collection.",
    features: ["Page-level meta title & description","Open Graph and Twitter card settings","Product JSON-LD structured data","Auto-generated XML sitemap","Canonical URL management","Robots.txt control","301/302 redirect manager"],
  },
  giftcards: {
    icon: "◈", badge: "Planned", title: "Gift Cards",
    description: "Issue digital gift cards with custom denominations. Track balances, expiry dates, and redemption history across customer accounts.",
    features: ["Custom denomination gift cards","Single-use or reloadable codes","Expiry date configuration","Balance tracking per customer","Bulk issuance for campaigns","Redemption history and audit log"],
  },
  abandoned: {
    icon: "◷", badge: "Planned", title: "Abandoned Cart Recovery",
    description: "Identify customers who left items in their cart and automatically trigger recovery emails or WhatsApp messages to bring them back.",
    features: ["Real-time abandoned cart list","Customer contact details and cart summary","Automated recovery email sequences","WhatsApp message templates","Discount code injection in recovery","Configurable abandonment threshold","Recovery rate and revenue analytics"],
  },
  returns: {
    icon: "↩", badge: "Planned", title: "Returns & Refunds",
    description: "Process return requests, issue full or partial refunds, and track returned inventory. Complete audit trail of all return operations.",
    features: ["Return request submission portal","Approve / reject / escalate workflow","Full and partial refund processing","Auto-restock returned inventory","Return reason analytics","Customer notification on status change","Payment provider refund integration"],
  },
  shipping: {
    icon: "◁", badge: "Planned", title: "Shipping & Delivery",
    description: "Define shipping zones, carriers, and rate tables. Set flat-rate, weight-based, or free-shipping thresholds per region and product category.",
    features: ["Multi-region zones (GCC, MENA, Global)","Flat-rate, weight-based, and free-shipping rules","Carrier integrations (Aramex, DHL, SMSA, Fetchr)","Real-time rate calculation at checkout","Estimated delivery time display","Click & collect support","White-label tracking page"],
  },
  taxes: {
    icon: "◫", badge: "Planned", title: "Tax & VAT Configuration",
    description: "Configure tax rates per region, product category, and customer type. Ensure VAT compliance across GCC countries with automatic rate calculation.",
    features: ["Regional tax zones (UAE 5%, Saudi 15%)","Product category tax overrides","Tax-inclusive vs exclusive pricing","B2B customer exemptions","Tax invoice generation","VAT registration threshold alerts","ZATCA e-invoicing compliance (KSA)"],
  },
  staff: {
    icon: "⚙", badge: "Planned", title: "Staff & Permissions",
    description: "Manage team members with role-based access control. Define custom roles with fine-grained permissions per module and audit all staff actions.",
    features: ["Custom roles (Manager, Editor, Viewer)","Per-module read/write/delete permissions","Two-factor authentication enforcement","Staff activity audit log","Login IP allowlist","Session timeout config","Invitation-based onboarding"],
  },
  regions: {
    icon: "◌", badge: "Configured in Code", title: "Regions & Currencies",
    description: "Multi-region store configuration, supported currencies, and locale-specific pricing. Arabic and English content routing per region.",
    features: ["Active: Oman (OM), UAE (AE), Saudi Arabia (SA)","Locales: English (en), Arabic (ar)","Per-region currency and pricing","Regional product availability","Locale-aware URL routing","Currency formatting (OMR, AED, SAR)","Region auto-detection from IP"],
  },
};

// ─── Integration configs ──────────────────────────────────────────────────────

const SOCIAL_INTEGRATIONS = [
  { name: "Meta / Facebook",    abbr: "f",  color: "#1877F2", desc: "Facebook Pixel, Catalogue, and Ads Manager.",     status: "available" },
  { name: "TikTok",             abbr: "T",  color: "#010101", desc: "TikTok Pixel and Shopping integration.",           status: "available" },
  { name: "Instagram Shopping", abbr: "◉",  color: "#C13584", desc: "Tag products in posts and stories.",               status: "available" },
  { name: "Snapchat",           abbr: "S",  color: "#FFFC00", iconColor: "#000", desc: "Snap Pixel and Dynamic Ads.",   status: "coming_soon" },
  { name: "Pinterest",          abbr: "P",  color: "#E60023", desc: "Pinterest Tag and Product Pins.",                  status: "coming_soon" },
  { name: "Twitter / X",        abbr: "X",  color: "#000000", desc: "Twitter Pixel and Shopping.",                      status: "coming_soon" },
];

const MARKETING_INTEGRATIONS = [
  { name: "Google Analytics 4", abbr: "GA", color: "#E37400", desc: "GA4 events, e-commerce tracking, and conversions.", status: "available" },
  { name: "Google Ads",         abbr: "Ads",color: "#4285F4", desc: "Conversion tracking and remarketing audiences.",     status: "available" },
  { name: "Klaviyo",            abbr: "K",  color: "#2D2D2D", desc: "Email flows, segments, and abandoned cart.",         status: "available" },
  { name: "Mailchimp",          abbr: "M",  color: "#FFE01B", iconColor: "#000", desc: "Email campaigns and automations.", status: "available" },
  { name: "WhatsApp Business",  abbr: "W",  color: "#25D366", desc: "Order notifications via WhatsApp API.",              status: "coming_soon" },
  { name: "Zendesk",            abbr: "Z",  color: "#03363D", desc: "Support ticketing and live chat.",                   status: "coming_soon" },
];

const APP_INTEGRATIONS = [
  { name: "Expo Push Notifications", abbr: "E",  color: "#000020", desc: "Mobile push for orders, promos, and restocks.", status: "active" },
  { name: "Cloudinary",              abbr: "CL", color: "#3448C5", desc: "Auto-optimised image hosting.",                 status: "available" },
  { name: "Algolia Search",          abbr: "Al", color: "#003DFF", desc: "Lightning-fast search and faceting.",           status: "coming_soon" },
  { name: "Stripe",                  abbr: "S",  color: "#635BFF", desc: "Online payment processing.",                    status: "coming_soon" },
  { name: "Tap Payments",            abbr: "Tp", color: "#F90000", desc: "GCC-native payment gateway.",                   status: "coming_soon" },
  { name: "Shippo",                  abbr: "Sh", color: "#16283C", desc: "Multi-carrier label printing.",                 status: "coming_soon" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function titleFor(item, key) {
  return item?.order_number || item?.name_en || item?.title_en || item?.code || item?.email || item?.username || item?.provider_reference || item?.provider || `${key} item`;
}

function metaFor(item) {
  if (!item) return "";
  return item.customer_name || item.brand || item.status || item.payment_status || item.discount_type || item.currency_code || (item.is_approved === false ? "Pending moderation" : item.is_published !== undefined ? (item.is_published ? "Published" : "Draft") : "Ready");
}

function labelFor(key) {
  if (key === "deals") return "promotions";
  if (key === "homepage") return "settings";
  return key;
}

function statusTone(value = "") {
  const v = String(value).toLowerCase();
  if (["paid","delivered","active","ready","approved","confirmed","published"].some((s) => v.includes(s))) return "success";
  if (["pending","review","preparing","unpaid","draft"].some((s) => v.includes(s))) return "warning";
  if (["cancelled","failed","inactive","rejected","hidden"].some((s) => v.includes(s))) return "danger";
  return "neutral";
}

function stringify(value, type) {
  if (type === "json") return typeof value === "string" ? value : JSON.stringify(value ?? [], null, 2);
  if (type === "datetime-local" && value) return String(value).slice(0, 16);
  if (type === "date" && value) return String(value).slice(0, 10);
  return value ?? "";
}

function getFieldType(name, key) {
  return (FIELD_CONFIGS[key] || []).find(([n]) => n === name)?.[2];
}

function buildPayload(editor, key) {
  const hasFile = Object.values(editor).some((v) => v instanceof File);
  if (hasFile) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(editor)) {
      if (v === "" || v === null || v === undefined) continue;
      if (k === "password" && !v) continue;
      const type = getFieldType(k, key);
      if (type === "json") fd.append(k, JSON.stringify(typeof v === "string" ? JSON.parse(v || "null") : v));
      else if (v instanceof File) fd.append(k, v);
      else fd.append(k, v);
    }
    return fd;
  }
  const payload = {};
  for (const [k, v] of Object.entries(editor)) {
    const type = getFieldType(k, key);
    if (v === "" || v === null || v === undefined) continue;
    if (k === "password" && !v) continue;
    if (type === "json") payload[k] = typeof v === "string" ? JSON.parse(v || "null") : v;
    else payload[k] = v;
  }
  return payload;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminPanelClient() {
  const [token, setToken]           = useState("");
  const [login, setLogin]           = useState({ username: "", password: "" });
  const [activeKey, setActiveKey]   = useState("dashboard");
  const [data, setData]             = useState(null);
  const [selected, setSelected]     = useState(null);
  const [editor, setEditor]         = useState({});
  const [mode, setMode]             = useState("view");
  const [formOpen, setFormOpen]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [toast, setToast]           = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const active    = ALL_NAV.find((n) => n.key === activeKey) || ALL_NAV[0];
  const canCreate = CRUD_KEYS.includes(activeKey);
  const canDelete = DELETABLE.includes(activeKey);

  const authHeaders = useMemo(() => ({
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  }), [token]);

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3600);
  }, []);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY) || "");
  }, []);

  useEffect(() => {
    if (token) loadScreen(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeKey]);

  async function request(path, options = {}) {
    const isFormData = options.body instanceof FormData;
    const reqHeaders = { ...authHeaders, ...(options.headers || {}) };
    if (isFormData) delete reqHeaders["Content-Type"];
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers: reqHeaders });
    if (res.status === 204) return null;
    if (res.status === 401) {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(REFRESH_KEY);
      setToken("");
      setData(null);
      return null;
    }
    const text = await res.text();
    const payload = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(payload?.detail || JSON.stringify(payload) || "Request failed");
    return payload;
  }

  async function signIn(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(login),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.detail || "Login failed");
      window.localStorage.setItem(TOKEN_KEY, payload.access);
      window.localStorage.setItem(REFRESH_KEY, payload.refresh);
      setToken(payload.access);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    const refresh = window.localStorage.getItem(REFRESH_KEY);
    if (refresh) await fetch(`${API_BASE}/auth/token/logout/`, { method: "POST", headers: authHeaders, body: JSON.stringify({ refresh }) }).catch(() => {});
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    setToken("");
    setData(null);
    closeForm();
  }

  async function loadScreen(screen = active) {
    if (!screen.endpoint) { setData(null); setLoading(false); return; }
    setLoading(true);
    closeForm();
    try {
      setData(await request(screen.endpoint));
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function detailPath(item = selected) {
    if (!item) return "";
    if (activeKey === "products")   return `/admin/products/${item.slug}/`;
    if (activeKey === "categories") return `/admin/categories/${item.slug}/`;
    if (activeKey === "deals")      return `/admin/promotions/${item.id}/`;
    if (activeKey === "orders")     return `/admin/orders/${item.order_number}/`;
    if (activeKey === "payments")   return `/admin/payments/${item.id}/`;
    if (activeKey === "customers")  return `/admin/customers/${item.id}/`;
    if (activeKey === "reviews")    return `/admin/reviews/${item.id}/`;
    if (activeKey === "blog")       return `/admin/blog-posts/${item.slug || item.id}/`;
    return "";
  }

  async function openDetail(item) {
    setMode("edit");
    setSelected(item);
    setEditor(makeEditor(item));
    setFormOpen(true);
    const path = detailPath(item);
    if (!path) return;
    try {
      const payload = await request(path);
      setSelected(payload);
      setEditor(makeEditor(payload));
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function makeEditor(item, key = activeKey) {
    const out = {};
    (FIELD_CONFIGS[key] || []).forEach(([name, , type]) => {
      out[name] = type === "checkbox" ? Boolean(item?.[name]) : stringify(item?.[name], type);
    });
    return out;
  }

  function startCreate() {
    setMode("create");
    setSelected(null);
    setEditor(makeEditor(CREATE_DEFAULTS[activeKey] || {}, activeKey));
    setFormOpen(true);
  }

  function openHomepageSettings() {
    setMode("edit");
    setSelected(data || {});
    setEditor(makeEditor(data || {}, "homepage"));
    setFormOpen(true);
  }

  function closeForm() {
    setSelected(null);
    setEditor({});
    setMode("view");
    setFormOpen(false);
  }

  async function saveRecord() {
    setLoading(true);
    try {
      const path = mode === "create" ? active.endpoint : activeKey === "homepage" ? active.endpoint : detailPath();
      const method = mode === "create" ? "POST" : "PATCH";
      const payload = buildPayload(editor, activeKey);
      await request(path, { method, body: payload instanceof FormData ? payload : JSON.stringify(payload) });
      showToast(mode === "create" ? "Created successfully." : "Saved successfully.", "success");
      await loadScreen(active);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function deleteRecord(item = selected) {
    if (!item || !canDelete) return;
    const confirmed = window.confirm(`Delete ${titleFor(item, activeKey)}? This cannot be undone.`);
    if (!confirmed) return;
    setLoading(true);
    try {
      await request(detailPath(item), { method: "DELETE" });
      showToast("Deleted successfully.", "success");
      await loadScreen(active);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function downloadReport(type) {
    try {
      const res = await fetch(`${API_BASE}/admin/reports/${type}/`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Report download failed");
      const blob = await res.blob();
      const href = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${type}.csv`;
      a.click();
      window.URL.revokeObjectURL(href);
      showToast(`${type} report downloaded.`, "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function navigate(key) {
    setActiveKey(key);
    setSidebarOpen(false);
  }

  // ─── Login screen ─────────────────────────────────────────────────────────

  if (!token) {
    return (
      <main className="admin-login-page">
        {toast ? <AdminToast toast={toast} /> : null}
        <div className="admin-login-ambient" />
        <section className="admin-login-card">
          <div className="admin-login-brand">
            <span className="admin-logo-orb">E</span>
          </div>
          <p className="admin-login-eyebrow">Management Portal</p>
          <h1 className="admin-login-title">Enfant Organics</h1>
          <p className="admin-login-sub">Secure staff access for store operations.</p>
          <form onSubmit={signIn} className="admin-form admin-login-form">
            <label className="admin-label">
              Username
              <input className="admin-input" autoComplete="username" value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} />
            </label>
            <label className="admin-label">
              Password
              <input className="admin-input" type="password" autoComplete="current-password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} />
            </label>
            <button type="submit" className="admin-btn-primary admin-login-submit" disabled={loading}>
              {loading ? <span className="admin-spinner" /> : null}
              {loading ? "Signing in…" : "Sign in to Admin"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  // ─── Authenticated shell ───────────────────────────────────────────────────

  return (
    <div className="admin-shell">
      {toast ? <AdminToast toast={toast} /> : null}
      {sidebarOpen ? <div className="admin-overlay" role="presentation" onClick={() => setSidebarOpen(false)} /> : null}

      {/* ── Sidebar ── */}
      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="admin-sidebar-header">
          <div className="admin-sidebar-logo">
            <span className="admin-logo-orb">E</span>
            <div>
              <strong>Enfant</strong>
              <span>Admin Console</span>
            </div>
          </div>
        </div>

        <nav className="admin-nav-scroll">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="admin-nav-group">
              <span className="admin-nav-group-label">{group.label}</span>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`admin-nav-item ${activeKey === item.key ? "active" : ""}`}
                  onClick={() => navigate(item.key)}
                >
                  <span className="admin-nav-icon">{item.icon}</span>
                  <span className="admin-nav-label">{item.label}</span>
                  {!item.endpoint ? <span className="admin-soon-dot" /> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-user">
            <div className="admin-avatar">A</div>
            <div>
              <strong>Admin</strong>
              <span>Store Manager</span>
            </div>
          </div>
          <button type="button" className="admin-signout-btn" onClick={logout}>Sign out</button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="admin-main">
        <header className="admin-topbar">
          <button type="button" className="admin-menu-toggle" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>
            <span /><span /><span />
          </button>
          <div className="admin-topbar-title">
            <h1>{active.label}</h1>
            <p>{active.desc}</p>
          </div>
          {canCreate ? (
            <button type="button" className="admin-btn-primary admin-topbar-cta" onClick={startCreate}>
              + {activeKey === "blog" ? "New article" : activeKey === "deals" ? "Add deal" : `Add ${activeKey.slice(0, -1)}`}
            </button>
          ) : null}
        </header>

        <div className="admin-content">
          {loading
            ? <div className="admin-loading"><span className="admin-spinner" /> Loading {active.label.toLowerCase()}…</div>
            : renderSection()}
        </div>
      </main>

      {formOpen ? (
        <CrudFormModal
          activeKey={activeKey}
          mode={mode}
          selected={selected}
          editor={editor}
          setEditor={setEditor}
          canDelete={canDelete && mode === "edit"}
          onClose={closeForm}
          onSave={saveRecord}
          onDelete={() => deleteRecord(selected)}
        />
      ) : null}
    </div>
  );

  function renderSection() {
    if (PLACEHOLDER_CONFIGS[activeKey])         return <PlaceholderModule config={PLACEHOLDER_CONFIGS[activeKey]} />;
    if (activeKey === "social")                 return <IntegrationsHub title="Social Media" integrations={SOCIAL_INTEGRATIONS} />;
    if (activeKey === "marketing_tools")        return <IntegrationsHub title="Marketing Tools" integrations={MARKETING_INTEGRATIONS} />;
    if (activeKey === "apps")                   return <IntegrationsHub title="Apps & Extensions" integrations={APP_INTEGRATIONS} />;
    if (activeKey === "dashboard")              return <DashboardView data={data} />;
    if (activeKey === "analytics")              return <AnalyticsView data={data} />;
    if (activeKey === "inventory")              return <InventoryView rows={Array.isArray(data) ? data : []} />;
    if (activeKey === "insights")               return <InsightsView rows={Array.isArray(data) ? data : []} />;
    if (activeKey === "newsletter")             return <NewsletterPanel data={data} />;
    if (activeKey === "reports")               return <Reports data={data} onDownload={downloadReport} />;
    if (activeKey === "homepage")               return <SettingsPanel data={data} onEdit={openHomepageSettings} />;
    return (
      <CrudPanel
        rows={Array.isArray(data) ? data : []}
        activeKey={activeKey}
        canCreate={canCreate}
        canDelete={canDelete}
        onCreate={startCreate}
        onEdit={openDetail}
        onDelete={deleteRecord}
      />
    );
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function AdminToast({ toast }) {
  const icons = { success: "✓", error: "✕", info: "●" };
  return (
    <div className={`admin-toast toast-${toast.type}`} role="alert">
      <span className="toast-icon">{icons[toast.type] || "●"}</span>
      {toast.message}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function DashboardView({ data }) {
  const kpis = [
    { label: "Total Revenue",    value: `OMR ${Number(data?.revenue || 0).toLocaleString()}`,          tone: "gold",   delta: "+12.4%", up: true },
    { label: "Monthly Revenue",  value: `OMR ${Number(data?.monthly_revenue || 0).toLocaleString()}`,  tone: "green",  delta: "+8.1%",  up: true },
    { label: "Total Orders",     value: data?.orders ?? 0,                                             tone: "blue",   delta: "+5.3%",  up: true },
    { label: "Customers",        value: data?.customers ?? 0,                                          tone: "violet", delta: "+22.7%", up: true },
    { label: "Avg Order Value",  value: `OMR ${Number(data?.avg_order_value || 0).toFixed(2)}`,        tone: "amber",  delta: "+3.9%",  up: true },
    { label: "Conversion Rate",  value: `${Number(data?.conversion_rate || 0).toFixed(1)}%`,          tone: "teal",   delta: "+0.8%",  up: true },
    { label: "Cart Abandonment", value: `${Number(data?.abandonment_rate || 68).toFixed(1)}%`,        tone: "rose",   delta: "-2.1%",  up: false },
    { label: "Repeat Purchase",  value: `${Number(data?.repeat_rate || 0).toFixed(1)}%`,              tone: "indigo", delta: "+4.2%",  up: true },
  ];

  return (
    <div className="admin-dashboard">
      <div className="admin-kpi-grid">
        {kpis.map((k) => (
          <article key={k.label} className="admin-kpi-card">
            <span className="admin-kpi-label">{k.label}</span>
            <strong className="admin-kpi-value">{k.value}</strong>
            <span className={`admin-kpi-delta ${k.up ? "up" : "down"}`}>{k.delta} vs last period</span>
          </article>
        ))}
      </div>

      <div className="admin-chart-row">
        <section className="admin-chart-card span-2">
          <h3>Revenue Trend</h3>
          <RevenueChart values={data?.revenue_trend || []} />
        </section>
        <section className="admin-chart-card">
          <h3>Order Status Mix</h3>
          <DonutChart values={data?.status_mix || []} />
        </section>
      </div>

      <div className="admin-data-row">
        <section className="admin-data-card">
          <div className="admin-data-head"><h3>Recent Orders</h3></div>
          <div className="admin-record-list compact">
            {(data?.recent_orders || []).length
              ? data.recent_orders.map((o) => (
                  <div key={o.order_number} className="admin-record-row">
                    <div className="admin-record-info">
                      <strong>{o.order_number}</strong>
                      <span>{o.customer_name} · {o.grand_total} {o.currency_code}</span>
                    </div>
                    <span className={`admin-badge ${statusTone(o.status)}`}>{o.status}</span>
                  </div>
                ))
              : <AdminEmpty label="recent orders" />}
          </div>
        </section>

        <section className="admin-data-card">
          <div className="admin-data-head"><h3>Top Products</h3></div>
          <div className="admin-record-list compact">
            {(data?.top_products || []).length
              ? data.top_products.map((p, i) => (
                  <div key={p.name || i} className="admin-record-row">
                    <div className="admin-record-info">
                      <strong>{p.name || p.name_en}</strong>
                      <span>OMR {p.revenue || 0}</span>
                    </div>
                    <span className="admin-badge success">{p.units_sold || p.orders || 0} sold</span>
                  </div>
                ))
              : <AdminEmpty label="product data" />}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────────

function AnalyticsView({ data }) {
  const funnel = [
    { label: "Store Visitors", value: data?.visitors       || 8420, pct: 100 },
    { label: "Product Views",  value: data?.product_views  || 5130, pct: 61 },
    { label: "Add to Cart",    value: data?.cart_adds      || 2840, pct: 34 },
    { label: "Checkout",       value: data?.checkouts      || 1560, pct: 19 },
    { label: "Orders",         value: data?.orders         || 890,  pct: 11 },
  ];
  const regions = [
    { label: "Oman",         value: data?.region_om || 43, color: "var(--brand)" },
    { label: "UAE",          value: data?.region_ae || 33, color: "var(--brand-dark)" },
    { label: "Saudi Arabia", value: data?.region_sa || 24, color: "#c9a84c" },
  ];
  const acqBars = [40, 55, 30, 70, 60, 85];
  const acqLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

  return (
    <div className="admin-analytics">
      <div className="admin-chart-row">
        <section className="admin-chart-card span-2">
          <h3>Revenue Analytics</h3>
          <RevenueChart values={data?.revenue_trend || []} />
        </section>
        <section className="admin-chart-card">
          <h3>Regional Revenue Split</h3>
          <div className="admin-regional">
            {regions.map((r) => (
              <div key={r.label} className="admin-regional-row">
                <span>{r.label}</span>
                <div className="admin-regional-track">
                  <div className="admin-regional-fill" style={{ width: `${r.value}%`, background: r.color }} />
                </div>
                <strong>{r.value}%</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="admin-chart-row">
        <section className="admin-chart-card">
          <h3>Conversion Funnel</h3>
          <div className="admin-funnel">
            {funnel.map((step, i) => (
              <div key={step.label} className="admin-funnel-step">
                <div className="admin-funnel-bar" style={{ "--fw": `${step.pct}%` }}>
                  <span>{step.label}</span>
                  <strong>{step.value.toLocaleString()}</strong>
                </div>
                {i < funnel.length - 1
                  ? <div className="admin-funnel-rate">{((funnel[i + 1].value / step.value) * 100).toFixed(1)}% pass-through</div>
                  : null}
              </div>
            ))}
          </div>
        </section>

        <section className="admin-chart-card">
          <h3>Order Status Distribution</h3>
          <DonutChart values={data?.status_mix || []} />
        </section>
      </div>

      <section className="admin-chart-card">
        <h3>Customer Acquisition (6 months)</h3>
        <div className="admin-bar-chart">
          {acqBars.map((h, i) => (
            <div key={acqLabels[i]} className="admin-bar-col">
              <div className="admin-bar" style={{ "--bh": `${h}%` }}>
                <span className="admin-bar-val">{Math.round(h * 1.2)}</span>
              </div>
              <span className="admin-bar-label">{acqLabels[i]}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Inventory ────────────────────────────────────────────────────────────────

function InventoryView({ rows }) {
  const sorted   = [...rows].sort((a, b) => (a.stock_quantity || 0) - (b.stock_quantity || 0));
  const low      = sorted.filter((p) => (p.stock_quantity || 0) < 10 && (p.stock_quantity || 0) > 0 && p.track_inventory);
  const out      = sorted.filter((p) => (p.stock_quantity || 0) === 0 && p.track_inventory);
  const healthy  = sorted.filter((p) => (p.stock_quantity || 0) >= 10);

  return (
    <div className="admin-inventory">
      <div className="admin-kpi-grid four-col">
        <article className="admin-kpi-card"><span className="admin-kpi-label">Total SKUs</span><strong className="admin-kpi-value">{rows.length}</strong></article>
        <article className="admin-kpi-card kpi-success"><span className="admin-kpi-label">In Stock</span><strong className="admin-kpi-value">{healthy.length}</strong></article>
        <article className="admin-kpi-card kpi-warning"><span className="admin-kpi-label">Low Stock</span><strong className="admin-kpi-value">{low.length}</strong></article>
        <article className="admin-kpi-card kpi-danger"><span className="admin-kpi-label">Out of Stock</span><strong className="admin-kpi-value">{out.length}</strong></article>
      </div>

      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <h3>Stock Levels</h3>
          <span>{rows.length} products</span>
        </div>
        <div className="admin-inv-table">
          <div className="admin-inv-head">
            <span>Product</span><span>SKU</span><span>Qty</span><span>Status</span>
          </div>
          {sorted.map((p) => {
            const qty   = p.stock_quantity || 0;
            const tone  = qty === 0 ? "danger" : qty < 10 ? "warning" : "success";
            const label = qty === 0 ? "Out of stock" : qty < 10 ? "Low stock" : "In stock";
            return (
              <div key={p.slug || p.id} className="admin-inv-row">
                <div className="admin-inv-product">
                  {p.image
                    ? <img src={p.image} alt="" className="admin-inv-thumb" />
                    : <div className="admin-inv-thumb-ph" />}
                  <span>{p.name_en}</span>
                </div>
                <span className="admin-inv-sku">{p.slug || "—"}</span>
                <strong>{qty}</strong>
                <span className={`admin-badge ${tone}`}>{label}</span>
              </div>
            );
          })}
          {!rows.length ? <AdminEmpty label="products" /> : null}
        </div>
      </section>
    </div>
  );
}

// ─── Customer Insights ────────────────────────────────────────────────────────

function InsightsView({ rows }) {
  const active = rows.filter((c) => c.is_active !== false).length;
  const staff  = rows.filter((c) => c.is_staff).length;
  return (
    <div className="admin-insights">
      <div className="admin-kpi-grid four-col">
        <article className="admin-kpi-card"><span className="admin-kpi-label">Total Customers</span><strong className="admin-kpi-value">{rows.length}</strong></article>
        <article className="admin-kpi-card kpi-success"><span className="admin-kpi-label">Active</span><strong className="admin-kpi-value">{active}</strong></article>
        <article className="admin-kpi-card"><span className="admin-kpi-label">Staff Accounts</span><strong className="admin-kpi-value">{staff}</strong></article>
        <article className="admin-kpi-card"><span className="admin-kpi-label">New (30 days)</span><strong className="admin-kpi-value">—</strong></article>
      </div>

      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <h3>Customer List</h3>
          <span>{rows.length} customers</span>
        </div>
        <div className="admin-record-list">
          {rows.length ? (
            <>
              <div className="admin-list-head"><span>Customer</span><span>Status</span></div>
              {rows.map((c) => (
                <div key={c.id || c.email} className="admin-record-row">
                  <div className="admin-record-info with-avatar">
                    <div className="admin-avatar-sm">{(c.first_name || c.username || "?")[0].toUpperCase()}</div>
                    <div>
                      <strong>{c.first_name && c.last_name ? `${c.first_name} ${c.last_name}` : c.username || c.email}</strong>
                      <span>{c.email}</span>
                    </div>
                  </div>
                  <span className={`admin-badge ${c.is_active !== false ? "success" : "neutral"}`}>{c.is_active !== false ? "Active" : "Inactive"}</span>
                </div>
              ))}
            </>
          ) : <AdminEmpty label="customers" />}
        </div>
      </section>
    </div>
  );
}

// ─── Newsletter ───────────────────────────────────────────────────────────────

function NewsletterPanel({ data }) {
  return (
    <div className="admin-newsletter">
      <div className="admin-kpi-grid four-col">
        <article className="admin-kpi-card"><span className="admin-kpi-label">Push Devices</span><strong className="admin-kpi-value">{data?.active_push_devices ?? "—"}</strong></article>
        <article className="admin-kpi-card"><span className="admin-kpi-label">Failures</span><strong className="admin-kpi-value">{data?.notification_failures ?? "—"}</strong></article>
        <article className="admin-kpi-card"><span className="admin-kpi-label">Push Events</span><strong className="admin-kpi-value">4</strong></article>
        <article className="admin-kpi-card"><span className="admin-kpi-label">Campaigns</span><strong className="admin-kpi-value">—</strong></article>
      </div>
      <PlaceholderModule config={{
        icon: "▢", badge: "Planned", title: "Email Campaign Builder",
        description: "Design and schedule email campaigns to your subscriber list. Set up automated flows for welcome series, order follow-ups, and re-engagement.",
        features: ["Drag-and-drop email editor","Subscriber segments and lists","Welcome series automation","Post-purchase follow-up flows","A/B subject line testing","Open rate and click analytics","Unsubscribe management"],
      }} />
    </div>
  );
}

// ─── Placeholder ──────────────────────────────────────────────────────────────

function PlaceholderModule({ config }) {
  return (
    <section className="admin-placeholder">
      <div className="admin-placeholder-icon">{config.icon}</div>
      <span className="admin-placeholder-badge">{config.badge}</span>
      <h2>{config.title}</h2>
      <p>{config.description}</p>
      <ul className="admin-placeholder-features">
        {config.features.map((f) => (
          <li key={f}><span className="feature-check">✓</span>{f}</li>
        ))}
      </ul>
    </section>
  );
}

// ─── Integrations Hub ─────────────────────────────────────────────────────────

function IntegrationsHub({ title, integrations }) {
  return (
    <div className="admin-integrations">
      <p className="admin-int-note">Connect third-party platforms. Your developer handles the API keys — this panel shows connection status and configuration options.</p>
      <div className="admin-int-grid">
        {integrations.map((int) => (
          <article key={int.name} className="admin-int-card">
            <div className="admin-int-logo" style={{ background: int.color, color: int.iconColor || "#fff" }}>
              {int.abbr}
            </div>
            <div className="admin-int-info">
              <strong>{int.name}</strong>
              <p>{int.desc}</p>
            </div>
            <div className="admin-int-action">
              {int.status === "active"
                ? <span className="admin-badge success">Active</span>
                : int.status === "available"
                ? <button type="button" className="admin-btn-outline">Connect</button>
                : <span className="admin-badge neutral">Coming soon</span>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

// ─── CRUD Panel ───────────────────────────────────────────────────────────────

function CrudPanel({ rows, activeKey, canCreate, canDelete, onCreate, onEdit, onDelete }) {
  const label = labelFor(activeKey);
  return (
    <section className="admin-panel-card">
      <div className="admin-panel-head">
        <div>
          <h3>{activeKey === "deals" ? "Promotions" : activeKey === "blog" ? "Blog Articles" : activeKey.charAt(0).toUpperCase() + activeKey.slice(1)}</h3>
          <span>{rows.length} record{rows.length === 1 ? "" : "s"}</span>
        </div>
        {canCreate ? (
          <button type="button" className="admin-btn-primary" onClick={onCreate}>
            + {activeKey === "blog" ? "New article" : `Add ${activeKey === "deals" ? "deal" : activeKey.slice(0, -1)}`}
          </button>
        ) : null}
      </div>
      <div className="admin-record-list">
        {rows.length ? (
          <>
            <div className="admin-list-head"><span>Record</span><span>Status</span><span>Actions</span></div>
            {rows.map((item) => {
              const meta = metaFor(item);
              return (
                <div key={item.id || item.slug || item.order_number || item.email} className="admin-record-row">
                  <button type="button" className="admin-record-main" onClick={() => onEdit(item)}>
                    {item.image ? <img src={item.image} alt="" className="admin-record-thumb" /> : null}
                    <div>
                      <strong>{titleFor(item, activeKey)}</strong>
                      <span>{item.email || item.customer_phone || item.currency_code || item.slug || "—"}</span>
                    </div>
                  </button>
                  <span className={`admin-badge ${statusTone(meta)}`}>{meta || "—"}</span>
                  <div className="admin-row-actions">
                    <button type="button" className="admin-btn-sm" onClick={() => onEdit(item)}>Edit</button>
                    {canDelete ? <button type="button" className="admin-btn-sm danger" onClick={() => onDelete(item)}>Delete</button> : null}
                  </div>
                </div>
              );
            })}
          </>
        ) : <AdminEmpty label={label} />}
      </div>
    </section>
  );
}

// ─── CRUD Form Modal ──────────────────────────────────────────────────────────

function CrudFormModal({ activeKey, mode, selected, editor, setEditor, canDelete, onClose, onSave, onDelete }) {
  const fields = FIELD_CONFIGS[activeKey] || [];
  const title  = mode === "create"
    ? `Add ${activeKey === "deals" ? "promotion" : activeKey === "blog" ? "article" : activeKey.slice(0, -1)}`
    : titleFor(selected, activeKey);

  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="admin-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="admin-modal-head">
          <div>
            <p className="admin-modal-eyebrow">{mode === "create" ? "Create record" : "Edit record"}</p>
            <h2>{title}</h2>
            {selected ? <span className="admin-modal-meta">{metaFor(selected)}</span> : null}
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {activeKey === "orders" && selected ? <OrderSnapshot order={selected} /> : null}

        <div className="admin-modal-form">
          {fields.map((field) => (
            <FormField key={field[0]} field={field} value={editor[field[0]]} editor={editor} setEditor={setEditor} />
          ))}
          <div className="admin-modal-actions">
            <button type="button" className="admin-btn-primary" onClick={onSave}>Save changes</button>
            {canDelete ? <button type="button" className="admin-btn-danger" onClick={onDelete}>Delete</button> : null}
            <button type="button" className="admin-btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Order Snapshot ───────────────────────────────────────────────────────────

function OrderSnapshot({ order }) {
  const cells = [
    ["Customer", order.customer_name || "—", order.customer_email || order.customer_phone || "—"],
    ["Address",  order.city || "—",          [order.address_line_1, order.address_line_2, order.country].filter(Boolean).join(", ") || "—"],
    ["Totals",   `${order.shipping_total} ${order.currency_code}`, `Grand total: ${order.grand_total} ${order.currency_code}`],
    ["Payment",  order.payment_status || "—", order.payment_method || "—"],
  ];
  return (
    <div className="admin-order-snapshot">
      {cells.map(([label, main, sub]) => (
        <div key={label} className="admin-snapshot-cell">
          <span>{label}</span>
          <strong>{main}</strong>
          <p>{sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Form Field ───────────────────────────────────────────────────────────────

function FormField({ field, value, editor, setEditor }) {
  const [name, label, type, options] = field;

  if (type === "checkbox") {
    return (
      <label className="admin-label admin-check-label">
        <input type="checkbox" className="admin-checkbox" checked={Boolean(value)} onChange={(e) => setEditor({ ...editor, [name]: e.target.checked })} />
        <span>{label}</span>
      </label>
    );
  }
  if (type === "select") {
    return (
      <label className="admin-label">
        {label}
        <select className="admin-input" value={value || ""} onChange={(e) => setEditor({ ...editor, [name]: e.target.value })}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
    );
  }
  if (type === "textarea" || type === "json") {
    return (
      <label className="admin-label full-width">
        {label}
        <textarea className="admin-input admin-textarea" value={value || ""} onChange={(e) => setEditor({ ...editor, [name]: e.target.value })} />
      </label>
    );
  }
  if (type === "file") {
    return (
      <label className="admin-label">
        {label}
        <input type="file" className="admin-input" onChange={(e) => setEditor({ ...editor, [name]: e.target.files[0] })} />
        {value instanceof File ? <span className="admin-file-name">{value.name}</span> : null}
      </label>
    );
  }
  return (
    <label className="admin-label">
      {label}
      <input
        type={type}
        className="admin-input"
        value={value ?? ""}
        onChange={(e) => setEditor({ ...editor, [name]: type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })}
      />
    </label>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel({ data, onEdit }) {
  const rows = [
    ["Brand name",            data?.brand_name             || "Enfant Organics"],
    ["Announcement (EN)",     data?.announcement_en        || "Not configured"],
    ["Newsletter title (EN)", data?.newsletter_title_en    || "Not configured"],
    ["Footer about (EN)",     data?.footer_about_en        || "Not configured"],
    ["Instagram title (EN)",  data?.instagram_title_en     || "Not configured"],
    ["Blog title (EN)",       data?.blog_title_en          || "Not configured"],
  ];
  return (
    <section className="admin-panel-card admin-settings-card">
      <div className="admin-panel-head">
        <div>
          <h3>Homepage Settings</h3>
          <span>Storefront content, footer, newsletter, and link groups.</span>
        </div>
        <button type="button" className="admin-btn-primary" onClick={onEdit}>Edit settings</button>
      </div>
      <div className="admin-settings-preview">
        {rows.map(([label, val]) => (
          <div key={label} className="admin-settings-row">
            <strong>{label}</strong>
            <span>{val}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Reports ──────────────────────────────────────────────────────────────────

function Reports({ data, onDownload }) {
  return (
    <div className="admin-reports">
      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <h3>CSV Exports</h3>
          <span>Download reports as comma-separated files.</span>
        </div>
        <div className="admin-report-grid">
          {REPORT_TYPES.map((type) => (
            <button key={type} type="button" className="admin-report-btn" onClick={() => onDownload(type)}>
              <span className="admin-report-icon">⇩</span>
              <div>
                <strong>{type.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</strong>
                <span>Download as CSV</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="admin-panel-card">
        <div className="admin-panel-head">
          <h3>Push Notifications</h3>
          <span>Expo mobile push delivery status.</span>
        </div>
        <div className="admin-push-stats">
          <div className="admin-push-row"><span>Active devices</span><strong>{data?.active_push_devices ?? "—"}</strong></div>
          <div className="admin-push-row"><span>Delivery failures</span><strong>{data?.notification_failures ?? "—"}</strong></div>
        </div>
        <div className="admin-push-events">
          <p className="admin-push-events-label">Tracked push events</p>
          {["New order placed","Order payment confirmed","Payment review needed","Low stock alert"].map((ev) => (
            <div key={ev} className="admin-push-event"><span className="admin-badge success">Active</span> {ev}</div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function AdminEmpty({ label }) {
  return (
    <div className="admin-empty">
      <strong>No {label} yet</strong>
      <span>Records will appear here with status labels and quick actions.</span>
    </div>
  );
}

// ─── Revenue Chart ────────────────────────────────────────────────────────────

function RevenueChart({ values }) {
  const fallback = [{ label: "Feb", value: 0 }, { label: "Mar", value: 4200 }, { label: "Apr", value: 2800 }, { label: "May", value: 6100 }];
  const pts  = values.length ? values : fallback;
  const max  = Math.max(...pts.map((p) => p.value), 1);
  const step = 300 / Math.max(pts.length - 1, 1);
  const coords = pts.map((p, i) => `${40 + i * step},${180 - (p.value / max) * 150}`).join(" ");
  const last = 40 + (pts.length - 1) * step;

  return (
    <svg className="admin-line-chart" viewBox="0 0 380 220" role="img" aria-label="Revenue trend chart">
      {[30, 80, 130, 180].map((y) => <line key={y} x1="38" x2="350" y1={y} y2={y} />)}
      <defs>
        <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={`40,180 ${coords} ${last},180`} fill="url(#rev-grad)" />
      <polyline points={coords} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={p.label}>
          <circle cx={40 + i * step} cy={180 - (p.value / max) * 150} r="4" fill="var(--brand)" />
          <text x={40 + i * step} y="210">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────

function DonutChart({ values }) {
  const items  = values.length ? values : [{ status: "pending", count: 4 }, { status: "delivered", count: 2 }, { status: "confirmed", count: 1 }];
  const total  = items.reduce((s, i) => s + i.count, 0) || 1;
  const colors = ["#c9a84c", "#92ab69", "#607a42", "#62b5e8", "#df5750", "#8a82ff"];
  let offset   = 25;
  return (
    <svg className="admin-donut-chart" viewBox="0 0 220 220" role="img" aria-label="Order status donut chart">
      <circle cx="110" cy="110" r="66" fill="none" stroke="#f0f3ed" strokeWidth="28" />
      {items.map((item, i) => {
        const len = (item.count / total) * 315;
        const el  = (
          <circle key={item.status} cx="110" cy="110" r="66"
            fill="none" stroke={colors[i % colors.length]} strokeWidth="28"
            strokeDasharray={`${len} 315`} strokeDashoffset={-offset}
            style={{ transform: "rotate(-90deg)", transformOrigin: "110px 110px" }}
          />
        );
        offset += len;
        return el;
      })}
      <text x="110" y="105" textAnchor="middle" fill="#65705f" fontSize="13" fontWeight="700">Orders</text>
      <text x="110" y="124" textAnchor="middle" fill="#191817" fontSize="26" fontWeight="800">{total}</text>
    </svg>
  );
}
