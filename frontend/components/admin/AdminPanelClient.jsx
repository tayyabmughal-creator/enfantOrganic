"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardView from "./DashboardView";
import AnalyticsView from "./AnalyticsView";
import { SettingsPanel, Reports, AuditLogsPanel, IntegrationsHub, InventoryView, InsightsView, NewsletterPanel, PlaceholderModule } from "./OtherViews";
import { CrudPanel, CrudFormModal } from "./CrudViews";
import { AdminToast } from "./SharedUI";
import SkeletonLoader from "../SkeletonLoader";
import { API_BASE_URL, ADMIN_TOKEN_KEY, ADMIN_REFRESH_KEY } from "@/lib/config";

const API_BASE    = API_BASE_URL;
const TOKEN_KEY   = ADMIN_TOKEN_KEY;
const REFRESH_KEY = ADMIN_REFRESH_KEY;

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
      { key: "audit_logs", label: "Audit Logs", icon: "⌁", endpoint: "/admin/audit-logs/",  desc: "Sensitive action timeline and traceability." },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "reviews",  label: "Reviews",  icon: "★", endpoint: "/admin/reviews/", desc: "Approve and moderate reviews." },
      { key: "returns",  label: "Returns",  icon: "↩", endpoint: null,               desc: "Return requests and refunds." },
      { key: "shipping", label: "Shipping", icon: "◁", endpoint: "/admin/shipping-rules/", desc: "Rules-based rates and delivery ETA." },
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

const NAV_READ_CAPABILITY = {
  dashboard: "dashboard.view",
  orders: "orders.view",
  customers: "customers.view",
  products: "products.view",
  categories: "categories.view",
  inventory: "inventory.view",
  blog: "content.view",
  homepage: "content.view",
  seo: "content.view",
  deals: "coupons.view",
  giftcards: "coupons.view",
  abandoned: "coupons.view",
  newsletter: "moderation.view",
  analytics: "dashboard.view",
  insights: "customers.view",
  reports: "reports.view",
  audit_logs: "audit.view",
  reviews: "reviews.view",
  returns: "returns.view",
  shipping: "shipping.view",
  social: "content.view",
  marketing_tools: "content.view",
  apps: "content.view",
  payments: "payments.view",
  taxes: "regions.view",
  staff: "staff.manage",
  regions: "regions.view",
};

const NAV_WRITE_CAPABILITY = {
  orders: "orders.edit",
  customers: "customers.edit",
  products: "products.edit",
  categories: "categories.edit",
  inventory: "inventory.edit",
  blog: "content.edit",
  homepage: "content.edit",
  deals: "coupons.edit",
  reviews: "reviews.edit",
  returns: "returns.edit",
  shipping: "shipping.edit",
  payments: "payments.edit",
  staff: "staff.manage",
  regions: "regions.edit",
};

// ─── Field configs ─────────────────────────────────────────────────────────────

const ORDER_STATUS    = [["pending","Pending"],["confirmed","Confirmed"],["paid","Paid"],["processing","Processing"],["shipped","Shipped"],["delivered","Delivered"],["cancelled","Cancelled"],["returned","Returned"],["refunded","Refunded"],["failed","Failed"]];
const PAYMENT_STATUS  = [["unpaid","Unpaid"],["review","Needs review"],["paid","Paid"],["refunded","Refunded"]];
const PAYMENT_METHOD  = [["cod","Cash on delivery"],["whatsapp","WhatsApp"],["bank_transfer","Bank transfer"],["online","Online"]];
const SHIPMENT_STATUS = [["pending","Pending"],["created","Created"],["in_transit","In transit"],["delivered","Delivered"],["failed","Failed"],["manual","Manual"]];
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
    ["status_note","Status note","textarea"],
    ["payment_method","Payment method","select",PAYMENT_METHOD],
    ["payment_status","Payment status","select",PAYMENT_STATUS],
    ["carrier","Carrier","text"],
    ["shipment_status","Shipment status","select",SHIPMENT_STATUS],
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
  shipping: [
    ["region","Region ID","number"],
    ["city","City","text"],
    ["area","Area","text"],
    ["min_order_value","Min order value","number"],
    ["max_order_value","Max order value","number"],
    ["shipping_fee","Shipping fee","number"],
    ["free_shipping_threshold","Free shipping threshold","number"],
    ["eta_min_days","ETA min days","number"],
    ["eta_max_days","ETA max days","number"],
    ["carrier_name","Carrier name","text"],
    ["active","Active","checkbox"],
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
  shipping:   { region:"",city:"",area:"",min_order_value:0,max_order_value:"",shipping_fee:0,free_shipping_threshold:0,eta_min_days:"",eta_max_days:"",carrier_name:"",active:true },
  blog:       { slug:"",title_en:"",title_ar:"",excerpt_en:"",excerpt_ar:"",body_en:"",body_ar:"",image:"",category_en:"",category_ar:"",published_at:"",is_published:false,sort_order:0 },
};

const CRUD_KEYS     = ["products","categories","deals","customers","payments","reviews","shipping","blog"];
const DELETABLE     = ["products","categories","deals","customers","payments","reviews","shipping","blog"];
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
  if (["paid","delivered","active","approved","confirmed","published","shipped","processing"].some((s) => v.includes(s))) return "success";
  if (["pending","review","unpaid","draft","returned"].some((s) => v.includes(s))) return "warning";
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
  const [adminMe, setAdminMe]       = useState(null);
  const [meLoading, setMeLoading]   = useState(false);
  const [activeKey, setActiveKey]   = useState("dashboard");
  const [data, setData]             = useState(null);
  const [selected, setSelected]     = useState(null);
  const [editor, setEditor]         = useState({});
  const [mode, setMode]             = useState("view");
  const [formOpen, setFormOpen]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [toast, setToast]           = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const capabilitySet = useMemo(() => new Set(adminMe?.capabilities || []), [adminMe]);

  const hasCapability = useCallback((capability) => {
    if (!capability) return true;
    if (adminMe?.is_superuser) return true;
    return capabilitySet.has(capability);
  }, [adminMe?.is_superuser, capabilitySet]);

  const canViewKey = useCallback((key) => hasCapability(NAV_READ_CAPABILITY[key]), [hasCapability]);
  const canWriteKey = useCallback((key) => hasCapability(NAV_WRITE_CAPABILITY[key]), [hasCapability]);

  const visibleNavGroups = useMemo(() => (
    NAV_GROUPS
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => canViewKey(item.key)),
      }))
      .filter((group) => group.items.length)
  ), [canViewKey]);

  const visibleNavItems = useMemo(
    () => visibleNavGroups.flatMap((group) => group.items),
    [visibleNavGroups],
  );

  const active    = visibleNavItems.find((n) => n.key === activeKey) || visibleNavItems[0] || null;
  const canCreate = Boolean(active && CRUD_KEYS.includes(activeKey) && canWriteKey(activeKey));
  const canDelete = Boolean(active && DELETABLE.includes(activeKey) && canWriteKey(activeKey));
  const canEdit   = Boolean(active && canWriteKey(activeKey));

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
    if (!token) {
      setAdminMe(null);
      return;
    }
    void loadAdminMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!active && visibleNavItems.length) {
      setActiveKey(visibleNavItems[0].key);
    }
  }, [active, visibleNavItems]);

  useEffect(() => {
    if (token && adminMe && active) loadScreen(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, adminMe, activeKey]);

  async function request(path, options = {}, _isRetry = false) {
    const isFormData = options.body instanceof FormData;
    const currentToken = window.localStorage.getItem(TOKEN_KEY) || token;
    const reqHeaders = { "Content-Type": "application/json", Authorization: currentToken ? `Bearer ${currentToken}` : "", ...(options.headers || {}) };
    if (isFormData) delete reqHeaders["Content-Type"];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, { ...options, headers: reqHeaders, signal: controller.signal });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") throw new Error("Request timed out. Please try again.");
      throw err;
    }
    clearTimeout(timeoutId);
    if (res.status === 204) return null;
    if (res.status === 401 && !_isRetry) {
      const refreshed = await attemptTokenRefresh();
      if (refreshed) return request(path, options, true);
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(REFRESH_KEY);
      setToken("");
      setData(null);
      return null;
    }
    if (res.status === 401) {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(REFRESH_KEY);
      setToken("");
      setData(null);
      return null;
    }
    let payload = null;
    try {
      const text = await res.text();
      payload = text ? JSON.parse(text) : null;
    } catch { payload = null; }
    if (!res.ok) throw new Error(payload?.detail || JSON.stringify(payload) || "Request failed");
    return payload;
  }

  async function attemptTokenRefresh() {
    const refresh = window.localStorage.getItem(REFRESH_KEY);
    if (!refresh) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (!res.ok) return false;
      const payload = await res.json();
      if (payload.access) {
        window.localStorage.setItem(TOKEN_KEY, payload.access);
        if (payload.refresh) window.localStorage.setItem(REFRESH_KEY, payload.refresh);
        setToken(payload.access);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async function loadAdminMe() {
    setMeLoading(true);
    try {
      const payload = await request("/admin/me/");
      if (!payload) {
        setAdminMe(null);
        return;
      }
      setAdminMe(payload);
    } catch (err) {
      showToast(err.message || "You do not have admin access.", "error");
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(REFRESH_KEY);
      setToken("");
      setData(null);
      setAdminMe(null);
    } finally {
      setMeLoading(false);
    }
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
    setAdminMe(null);
    closeForm();
  }

  async function loadScreen(screen = active) {
    if (!screen || !screen.endpoint) { setData(null); setLoading(false); return; }
    setLoading(true);
    closeForm();
    try {
      const raw = await request(screen.endpoint);
      // Handle DRF paginated response {count, next, previous, results}
      if (raw && typeof raw === "object" && Array.isArray(raw.results)) {
        setData(raw.results);
      } else {
        setData(raw);
      }
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
    if (activeKey === "shipping")   return `/admin/shipping-rules/${item.id}/`;
    if (activeKey === "blog")       return `/admin/blog-posts/${item.slug || item.id}/`;
    return "";
  }

  async function openDetail(item) {
    if (!canEdit) {
      showToast("You can view this section but cannot edit it.", "info");
      return;
    }
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
    if (!canWriteKey(activeKey)) {
      showToast("You do not have permission to create records in this section.", "error");
      return;
    }
    setMode("create");
    setSelected(null);
    setEditor(makeEditor(CREATE_DEFAULTS[activeKey] || {}, activeKey));
    setFormOpen(true);
  }

  function openHomepageSettings() {
    if (!canWriteKey("homepage")) {
      showToast("You do not have permission to edit homepage settings.", "error");
      return;
    }
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
    if (!canWriteKey(activeKey)) {
      showToast("You do not have permission to save changes in this section.", "error");
      return;
    }
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
    if (!canViewKey("reports")) {
      showToast("You do not have permission to download reports.", "error");
      return;
    }
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

  async function downloadOrderInvoice(order) {
    if (!order?.order_number) return;
    try {
      const res = await fetch(`${API_BASE}/admin/orders/${order.order_number}/invoice/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        let detail = "Invoice download failed";
        try {
          const payload = await res.json();
          detail = payload?.detail || detail;
        } catch {}
        throw new Error(detail);
      }
      const blob = await res.blob();
      const href = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${order.invoice_number || order.order_number}.pdf`;
      a.click();
      window.URL.revokeObjectURL(href);
      showToast("Invoice downloaded.", "success");
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function navigate(key) {
    if (!canViewKey(key)) {
      showToast("You do not have access to this section.", "error");
      return;
    }
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

  if (meLoading) {
    return (
      <main className="admin-login-page">
        {toast ? <AdminToast toast={toast} /> : null}
        <section className="admin-login-card">
          <h1 className="admin-login-title">Enfant Organics</h1>
          <p className="admin-login-sub">Loading admin permissions…</p>
        </section>
      </main>
    );
  }

  if (!visibleNavItems.length) {
    return (
      <main className="admin-login-page">
        {toast ? <AdminToast toast={toast} /> : null}
        <section className="admin-login-card">
          <h1 className="admin-login-title">No Admin Modules</h1>
          <p className="admin-login-sub">Your account is authenticated but has no assigned admin role.</p>
          <button type="button" className="admin-btn-primary admin-login-submit" onClick={logout}>
            Sign out
          </button>
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
          {visibleNavGroups.map((group) => (
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
              <strong>{adminMe?.full_name || adminMe?.username || "Admin"}</strong>
              <span>{adminMe?.roles?.[0] || "Staff"}</span>
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
              + {activeKey === "blog" ? "New article" : activeKey === "deals" ? "Add deal" : activeKey === "shipping" ? "Add rule" : `Add ${activeKey.slice(0, -1)}`}
            </button>
          ) : null}
        </header>

        <div className="admin-content">
          {loading
            ? <div className="admin-loading" style={{ padding: "2rem" }}><SkeletonLoader count={5} type={activeKey === "dashboard" || activeKey === "analytics" ? "grid" : "list"} /></div>
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
          onDownloadInvoice={downloadOrderInvoice}
          titleFor={titleFor}
          metaFor={metaFor}
          fields={FIELD_CONFIGS[activeKey]}
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
    if (activeKey === "audit_logs")            return <AuditLogsPanel rows={Array.isArray(data) ? data : []} />;
    if (activeKey === "homepage")               return <SettingsPanel data={data} onEdit={openHomepageSettings} canEdit={canWriteKey("homepage")} />;
    return (
      <CrudPanel
        rows={Array.isArray(data) ? data : []}
        activeKey={activeKey}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        onCreate={startCreate}
        onEdit={openDetail}
        onDelete={deleteRecord}
        onDownloadInvoice={downloadOrderInvoice}
        titleFor={titleFor}
        metaFor={metaFor}
        labelFor={labelFor}
      />
    );
  }
}

