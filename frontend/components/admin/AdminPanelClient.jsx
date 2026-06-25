"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardView from "./DashboardView";
import AnalyticsView from "./AnalyticsView";
import { StoreSettingsSection, SettingsPanel, Reports, AuditLogsPanel, IntegrationsView, PaymentGatewaysView, InventoryView, InsightsView, NewsletterPanel, RegionsView, InstagramPostsPanel, PlaceholderModule } from "./OtherViews";
import { CrudPanel, CrudFormModal } from "./CrudViews";
import DraftOrderComposer from "./DraftOrderComposer";
import { AdminToast } from "./SharedUI";
import SkeletonLoader from "../SkeletonLoader";
import Icon from "../icons/Icon";
import { API_BASE_URL, ADMIN_TOKEN_KEY, ADMIN_REFRESH_KEY } from "@/lib/config";

const API_BASE    = API_BASE_URL;
const TOKEN_KEY   = ADMIN_TOKEN_KEY;
const REFRESH_KEY = ADMIN_REFRESH_KEY;
const SIDEBAR_COLLAPSED_KEY = "enfhant-admin-sidebar-collapsed";
const DEFAULT_ADMIN_PAGE_SIZE = 25;
const INVENTORY_PAGE_SIZE = 100;

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { key: "dashboard",  label: "Dashboard",   icon: "dashboard",  endpoint: "/admin/dashboard/",    desc: "Live store signals and KPIs." },
      { key: "analytics",  label: "Analytics",   icon: "chartLine",  endpoint: "/admin/analytics/",    desc: "Revenue, funnels, and trends." },
      { key: "audit_logs", label: "Audit Logs",  icon: "activity",   endpoint: "/admin/audit-logs/",   desc: "Sensitive action timeline and traceability." },
    ],
  },
  {
    label: "Orders & Customers",
    items: [
      { key: "orders",       label: "Orders",               icon: "clipboard",   endpoint: "/admin/orders/",         desc: "Manage orders, draft orders, and abandoned checkouts." },
      { key: "draft_orders", label: "Draft Orders",         icon: "clipboard",   endpoint: "/admin/orders/",         showInSidebar: false, desc: "Create and manage admin-created draft orders." },
      { key: "abandoned",    label: "Abandoned Checkouts",  icon: "cartX",       endpoint: "/admin/abandoned-carts/",showInSidebar: false, desc: "Recover abandoned checkouts." },
      { key: "returns",      label: "Returns",              icon: "returnArrow", endpoint: "/admin/returns/",        desc: "Return requests and refunds." },
      { key: "customers",    label: "Customers",            icon: "user",        endpoint: "/admin/customers/",      desc: "Customer accounts, history, and lifetime value." },
    ],
  },
  {
    label: "Catalog & Inventory",
    items: [
      { key: "products",   label: "Products",   icon: "tag",      endpoint: "/admin/products/",   desc: "Create and manage product listings." },
      { key: "categories", label: "Categories", icon: "folder",   endpoint: "/admin/categories/", desc: "Organise products into categories." },
      { key: "inventory",  label: "Inventory",  icon: "box",      endpoint: "/admin/products/",   desc: "Stock levels, warehouse breakdown, and demand alerts." },
      { key: "warehouses", label: "Warehouses", icon: "building", endpoint: "/admin/warehouses/", desc: "Fulfilment centres and regions." },
    ],
  },
  {
    label: "Marketing & Content",
    items: [
      { key: "deals",           label: "Promotions",     icon: "percent",   endpoint: "/admin/promotions/",              desc: "Coupons, codes, and deals." },
      { key: "giftcards",       label: "Gift Cards",     icon: "gift",      endpoint: "/admin/gift-cards/",              desc: "Issue and track gift cards." },
      { key: "newsletter",      label: "Newsletter",     icon: "mail",      endpoint: "/admin/newsletter-subscribers/",  desc: "Subscribers and campaigns." },
      { key: "blog",            label: "Blog",           icon: "edit",      endpoint: "/admin/blog-posts/",              desc: "Articles, guides, and brand stories." },
      { key: "pages",           label: "Pages",          icon: "edit",      endpoint: "/admin/cms-pages/",               desc: "CMS-managed policy and static content pages." },
      { key: "hero_cards",      label: "Hero Cards",     icon: "image",     endpoint: "/admin/hero-promo-cards/",        desc: "Homepage hero promo cards and visuals." },
      { key: "instagram_posts", label: "Instagram Grid", icon: "instagram", endpoint: "/admin/instagram-posts/",        desc: "Instagram feed photos shown on the homepage." },
      { key: "homepage",        label: "Content",        icon: "home",      endpoint: "/admin/settings/",               desc: "Announcements, newsletter, and homepage sections." },
    ],
  },
  {
    label: "Finance",
    items: [
      { key: "payments", label: "Payments", icon: "creditCard", endpoint: "/admin/payments/",  desc: "Payment transactions — read-only audit view." },
      { key: "reports",  label: "Reports",  icon: "download",   endpoint: "/admin/moderation/", desc: "CSV exports: orders, customers, inventory, sales." },
    ],
  },
  {
    label: "Settings & Integrations",
    items: [
      { key: "regions",             label: "Regions",           icon: "globe",     endpoint: "/admin/regions/",   desc: "Active regions, currencies, and locale config." },
      { key: "taxes",               label: "Taxes",             icon: "receipt",   endpoint: "/admin/tax-rates/", desc: "Tax zones, VAT rates, and inclusive/exclusive pricing." },
      { key: "shipping",            label: "Shipping",          icon: "truck",     endpoint: "/admin/shipping-rules/", desc: "Rules-based rates and delivery ETA." },
      { key: "cart_milestones",     label: "Cart Milestones",   icon: "gift",      endpoint: "/admin/cart-milestones/", desc: "Free-shipping and discount rewards unlocked by cart total." },
      { key: "staff",               label: "Staff",             icon: "users",     endpoint: "/admin/staff/",     desc: "Team accounts, roles, and permissions." },
      { key: "reviews",             label: "Reviews",           icon: "star",      endpoint: "/admin/reviews/",   desc: "Approve and moderate reviews." },
      { key: "branding",            label: "Branding",          icon: "palette",   endpoint: "/admin/settings/",  desc: "Logo, colors, tagline, and store identity." },
      { key: "nav_settings",        label: "Navigation",        icon: "menu",      endpoint: "/admin/settings/",  desc: "Header nav links and utility menu." },
      { key: "footer_social",       label: "Footer & Social",   icon: "link",      endpoint: "/admin/settings/",  desc: "Footer content, social media, and contact info." },
      { key: "seo_legal",           label: "SEO & Legal",       icon: "search",    endpoint: "/admin/settings/",  desc: "Meta tags, Open Graph, return policy, privacy." },
      { key: "payment_setup",       label: "Payment Setup",     icon: "settings",  endpoint: "/admin/settings/",  desc: "Configure payment gateway credentials." },
      { key: "inventory_settings",  label: "Inventory Settings",icon: "box",       endpoint: "/admin/settings/",  desc: "Inventory alert thresholds and restock signals." },
      { key: "social",              label: "Social Media",      icon: "share",     endpoint: "/admin/settings/",  desc: "Facebook, TikTok, Snapchat, and Pinterest pixels." },
      { key: "marketing_tools",     label: "Marketing Tools",   icon: "megaphone", endpoint: "/admin/settings/",  desc: "GA4, Google Ads, GTM, Klaviyo, and Mailchimp." },
      { key: "apps",                label: "App Store",         icon: "apps",      endpoint: "/admin/settings/",  desc: "Push notifications, search, and fulfilment apps." },
    ],
  },
];

const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);
const ORDER_SECTION_KEYS = new Set(["orders", "draft_orders", "abandoned"]);
const ORDER_SECTION_TABS = [
  { key: "orders", label: "Orders" },
  { key: "draft_orders", label: "Draft Orders" },
  { key: "abandoned", label: "Abandoned Checkouts" },
];

const NAV_READ_CAPABILITY = {
  dashboard: "dashboard.view",
  orders: "orders.view",
  draft_orders: "orders.view",
  customers: "customers.view",
  products: "products.view",
  categories: "categories.view",
  inventory: "inventory.view",
  warehouses: "inventory.view",
  blog: "content.view",
  pages: "content.view",
  hero_cards: "content.view",
  instagram_posts: "content.view",
  homepage: "content.view",
  branding: "content.view",
  nav_settings: "content.view",
  footer_social: "content.view",
  seo_legal: "content.view",
  deals: "coupons.view",
  giftcards: "coupons.view",
  abandoned: "abandoned.view",
  newsletter: "moderation.view",
  analytics: "dashboard.view",
  insights: "customers.view", // legacy key kept for backward compat
  reports: "reports.view",
  audit_logs: "audit.view",
  reviews: "reviews.view",
  returns: "returns.view",
  shipping: "shipping.view",
  cart_milestones: "shipping.view",
  social: "content.view",
  marketing_tools: "content.view",
  apps: "content.view",
  payments: "payments.view",
  payment_setup: "payments.view",
  inventory_settings: "inventory.view",
  taxes: "regions.view",
  staff: "staff.manage",
  regions: "regions.view",
};

const NAV_WRITE_CAPABILITY = {
  orders: "orders.edit",
  draft_orders: "orders.edit",
  customers: "customers.edit",
  products: "products.edit",
  categories: "categories.edit",
  inventory: "inventory.edit",
  warehouses: "inventory.edit",
  blog: "content.edit",
  pages: "content.edit",
  hero_cards: "content.edit",
  instagram_posts: "content.edit",
  homepage: "content.edit",
  branding: "content.edit",
  nav_settings: "content.edit",
  footer_social: "content.edit",
  seo_legal: "content.edit",
  deals: "coupons.edit",
  giftcards: "giftcards.edit",
  abandoned: "abandoned.edit",
  reviews: "reviews.edit",
  returns: "returns.edit",
  shipping: "shipping.edit",
  cart_milestones: "shipping.edit",
  regions: "regions.edit",
  taxes: "regions.edit",
  payments: "payments.edit",
  payment_setup: "payments.edit",
  inventory_settings: "inventory.edit",
  staff: "staff.manage",
  social: "content.edit",
  marketing_tools: "content.edit",
  apps: "content.edit",
};

// ─── Field configs ─────────────────────────────────────────────────────────────

const ORDER_STATUS    = [["pending","Pending"],["confirmed","Confirmed"],["paid","Paid"],["processing","Processing"],["shipped","Shipped"],["delivered","Delivered"],["cancelled","Cancelled"],["returned","Returned"],["refunded","Refunded"],["failed","Failed"]];
const PAYMENT_STATUS  = [["unpaid","Unpaid"],["review","Needs review"],["paid","Paid"],["refunded","Refunded"]];
const PAYMENT_METHOD  = [["cod","Cash on delivery"],["whatsapp","WhatsApp"],["bank_transfer","Bank transfer"],["online","Online"]];
const SHIPMENT_STATUS = [["pending","Pending"],["created","Created"],["in_transit","In transit"],["delivered","Delivered"],["failed","Failed"],["manual","Manual"]];
const PAYMENT_PROVIDER = [["cod","Cash on delivery"],["whatsapp","WhatsApp"],["bank_transfer","Bank transfer"],["online","Online"],["paymob","Paymob"],["paytabs","PayTabs"],["hyperpay","HyperPay"],["telr","Telr"],["thawani","Thawani"],["omannet","OmanNet"]];
const SALES_CHANNEL = [["online_store","Online Store"],["draft_order","Draft Orders"]];

const FIELD_CONFIGS = {
  products: [
    ["slug","Slug","text"],["name_en","Name EN","text"],["name_ar","Name AR","text"],
    ["base_price","Price (OMR, base)","number"],["base_compare_at_price","Compare-at price (OMR)","number"],
    ["brand","Brand","text"],["unit","Unit / weight","text"],["categories","Categories","categories-select"],
    ["vendor_en","Vendor EN","text"],["vendor_ar","Vendor AR","text"],
    ["short_description_en","Short description EN","textarea"],["short_description_ar","Short description AR","textarea"],
    ["description_en","Description EN","richtext"],["description_ar","Description AR","richtext"],
    ["ingredients_en","Ingredients EN","textarea"],["ingredients_ar","Ingredients AR","textarea"],
    ["usage_instructions_en","Usage EN","textarea"],["usage_instructions_ar","Usage AR","textarea"],
    ["origin_source_en","Origin EN","text"],["origin_source_ar","Origin AR","text"],
    ["organic_certification_name","Certification","text"],["shelf_life","Shelf life","text"],
    ["expiry_date","Expiry date","date"],["badge_en","Badge EN","text"],["badge_ar","Badge AR","text"],
    ["review_count","Review count","number"],["rating","Rating","number"],
    ["image","Image URL","text"],["image_file","Image File","file"],
    ["hover_image","Hover image URL","text"],["hover_image_file","Hover Image File","file"],
    ["gallery","Gallery images","gallery"],["variants","Variants","product-variants"],["option_groups_en","Options EN","option-groups"],["option_groups_ar","Options AR","option-groups"],
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
    ["sales_channel","Sales channel","select",SALES_CHANNEL],
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
  cart_milestones: [
    ["region","Region ID","number"],
    ["reward_type","Reward","select",[["free_shipping","Free shipping"],["discount_percent","Discount (%)"]]],
    ["threshold","Cart total to unlock (in region currency)","number"],
    ["discount_value","Discount % (only for Discount type, e.g. 10)","number"],
    ["label_en","Label EN (e.g. Free Shipping, 10% Off)","text"],
    ["label_ar","Label AR","text"],
    ["sort_order","Sort order","number"],
    ["is_active","Active","checkbox"],
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
  pages: [
    ["slug","Slug","text"],
    ["region","Region ID (optional)","number"],
    ["title_en","Title EN","text"],["title_ar","Title AR","text"],
    ["body_en","Body EN","textarea"],["body_ar","Body AR","textarea"],
    ["seo_title_en","SEO title EN","text"],["seo_title_ar","SEO title AR","text"],
    ["seo_description_en","SEO description EN","textarea"],["seo_description_ar","SEO description AR","textarea"],
    ["is_published","Published","checkbox"],
  ],
  hero_cards: [
    ["title_en","Title EN","text"],["title_ar","Title AR","text"],
    ["eyebrow_en","Eyebrow label EN (small text above title)","text"],["eyebrow_ar","Eyebrow label AR","text"],
    ["subtitle_en","Subtitle EN","textarea"],["subtitle_ar","Subtitle AR","textarea"],
    ["cta_en","CTA EN","text"],["cta_ar","CTA AR","text"],
    ["href","Link destination","combobox",[
      ["/collections","All Collections"],
      ["/collections?category=baby-sets","Gift Sets"],
      ["/collections?category=bath-body","Bath & Body"],
      ["/collections?category=bedding","Bedtime Care"],
      ["/collections?category=baby-oil","Relaxing Care"],
      ["/collections?category=wardrobe","Daily Essentials"],
      ["/collections?category=baby-lotions","Baby Lotions"],
      ["/collections?category=feeding","On-the-Go Care"],
      ["/collections?category=cotton-buds","Sensitive Skin Care"],
      ["/collections?category=baby-powder","Daily Moisture"],
      ["/collections?category=nurturing-balm","Complete Care Cream"],
      ["/collections?category=baby-conditioners","Comfort Care"],
      ["/collections?category=shampoo-body-wash","Bath & Shampoo"],
      ["/collections?category=baby-mosquito-repellents","Outdoor Protection"],
      ["/collections?category=baby-safe-cleaning","Baby Wipes"],
      ["/collections?category=toothpaste-oral-care","Sun Protection"],
      ["/collections?ordering=-rating","Best Rated"],
      ["/collections?ordering=-id","New Arrivals"],
      ["/product/extra-mild-moisture-lotion","Product: Extra Mild Moisture Lotion"],
      ["/product/sweet-dreams-baby-powder","Product: Double Moisture Lotion 250ml"],
      ["/product/serene-knit-organic-blanket","Product: Relax Moisturizing Lotion"],
      ["/product/organic-kids-toothpaste","Product: Face & Body Sunscreen"],
      ["/product/shea-butter-nurturing-baby-balm","Product: Complete Care Cream"],
      ["/product/newborn-gift-set-sweet-dream","Product: Newborn Gift Set"],
      ["/product/ultimate-organic-newborn-essential-kit","Product: Newborn Essential Kit"],
      ["/product/cotton-ritual-basket","Product: Cotton Ritual Gift Basket"],
      ["/product/cloud-wash-duo","Product: Cloud Wash Duo"],
      ["/product/golden-hour-sleepsuit","Product: Golden Hour Daily Care Set"],
      ["/product/natural-mosquito-repellent-spray","Product: Bye Bye Insect Repellent"],
      ["/product/extra-mild-baby-wipes","Product: Extra Mild Baby Wipes"],
      ["/product/sweet-dream-foam-mousse-400ml","Product: Moisture Shampoo 300ml"],
    ]],
    ["size","Card size","select",[["large","Large — main hero (2-col width)"],["small","Small — tile grid card"]]],
    ["accent","Preset label (used only if Eyebrow is empty)","select",[
      ["none","— No eyebrow label —"],
      ["gift","Exclusive Offer"],
      ["soft","Best Seller"],
      ["sets","Curated Sets"],
      ["moisture","Top Rated"],
      ["choice","Mom's Favourite"],
      ["relax","Night Routine"],
      ["new","New Arrival"],
      ["sun","Daily Care"],
    ]],
    ["sort_order","Sort order","number"],
    ["is_visible","Visible on homepage","checkbox"],
    ["image","Image URL (desktop / web)","text"],["image_file","Upload image (desktop / web)","file"],
    ["image_mobile","Mobile image URL (optional)","text"],["image_file_mobile","Upload mobile image (optional)","file"],
  ],
  homepage: [
    ["announcement_en","Announcement EN","text"],["announcement_ar","Announcement AR","text"],
    ["newsletter_title_en","Newsletter title EN","text"],["newsletter_title_ar","Newsletter title AR","text"],
    ["newsletter_subtitle_en","Newsletter subtitle EN","textarea"],["newsletter_subtitle_ar","Newsletter subtitle AR","textarea"],
    ["instagram_title_en","Instagram title EN","text"],["instagram_title_ar","Instagram title AR","text"],
    ["instagram_cta_en","Instagram CTA EN","text"],["instagram_cta_ar","Instagram CTA AR","text"],
    ["blog_title_en","Blog title EN","text"],["blog_title_ar","Blog title AR","text"],
    ["free_gift_title_en","Free gift title EN","text"],["free_gift_title_ar","Free gift title AR","text"],
    ["free_gift_subtitle_en","Free gift subtitle EN","textarea"],["free_gift_subtitle_ar","Free gift subtitle AR","textarea"],
    ["why_choose_links","Why choose links (JSON)","json"],
  ],
  branding: [
    ["brand_name","Brand name","text"],
    ["logo_url","Logo image URL","text"],
    ["favicon_url","Favicon URL","text"],
    ["tagline_en","Tagline EN","text"],["tagline_ar","Tagline AR","text"],
    ["primary_color","Primary color (hex, e.g. #4a7c59)","text"],
    ["accent_color","Accent color (hex)","text"],
  ],
  nav_settings: [
    ["nav_links","Nav links JSON — [{\"label_en\":\"Home\",\"label_ar\":\"الرئيسية\",\"href\":\"/\"}]","json"],
    ["static_links","Static/utility links JSON","json"],
  ],
  footer_social: [
    ["footer_about_en","Footer about EN","textarea"],["footer_about_ar","Footer about AR","textarea"],
    ["copyright_en","Copyright text EN","text"],["copyright_ar","Copyright text AR","text"],
    ["policy_links","Policy links JSON — [{\"label_en\":\"Privacy\",\"label_ar\":\"الخصوصية\",\"href\":\"/privacy\"}]","json"],
    ["facebook_url","Facebook URL","text"],
    ["instagram_url","Instagram URL","text"],
    ["twitter_url","Twitter / X URL","text"],
    ["youtube_url","YouTube URL","text"],
    ["tiktok_url","TikTok URL","text"],
    ["whatsapp_number","WhatsApp number (digits only)","text"],
    ["contact_email","Contact email","text"],
    ["contact_phone","Contact phone","text"],
    ["address_en","Address EN","text"],["address_ar","Address AR","text"],
  ],
  seo_legal: [
    ["seo_title_en","SEO meta title EN","text"],["seo_title_ar","SEO meta title AR","text"],
    ["seo_description_en","SEO meta description EN","textarea"],["seo_description_ar","SEO meta description AR","textarea"],
    ["og_image_url","Open Graph image URL","text"],
    ["return_policy_en","Return policy EN","textarea"],["return_policy_ar","Return policy AR","textarea"],
    ["privacy_policy_en","Privacy policy EN","textarea"],["privacy_policy_ar","Privacy policy AR","textarea"],
  ],
  inventory_settings: [
    ["inventory_low_stock_threshold","Inventory health threshold","number"],
  ],
  returns: [
    ["status","Status","select",[["requested","Requested"],["approved","Approved"],["rejected","Rejected"],["refunded","Refunded"]]],
    ["admin_note","Admin note","textarea"],
  ],
  taxes: [
    ["label","Label (e.g. VAT Oman)","text"],
    ["region","Region ID","number"],
    ["country_code","Country code (e.g. OM)","text"],
    ["rate","Rate (decimal, e.g. 0.05 for 5%)","number"],
    ["is_inclusive","Tax-inclusive pricing","checkbox"],
    ["applies_to_shipping","Apply tax to shipping","checkbox"],
    ["is_active","Active","checkbox"],
    ["effective_from","Effective from","date"],
    ["effective_to","Effective to (blank = no end)","date"],
  ],
  staff: [
    ["email","Email","email"],
    ["username","Username","text"],
    ["password","Password","password"],
    ["first_name","First name","text"],
    ["last_name","Last name","text"],
    ["role","Role","select",[
      ["Owner/Super Admin","Owner / Super Admin"],
      ["Manager","Manager"],
      ["Product Editor","Product Editor"],
      ["Order Support","Order Support"],
      ["Finance","Finance"],
      ["Marketing","Marketing"],
    ]],
    ["is_active","Active","checkbox"],
    ["is_staff","Staff access","checkbox"],
  ],
  warehouses: [
    ["code","Code","text"],
    ["name_en","Name EN","text"],
    ["name_ar","Name AR","text"],
    ["region","Region ID","number"],
    ["fulfillment_regions","Fulfilment region IDs (comma-separated)","text"],
    ["active","Active","checkbox"],
  ],
  giftcards: [
    ["code","Code","text"],
    ["initial_balance","Initial balance","number"],
    ["remaining_balance","Remaining balance","number"],
    ["currency_code","Currency","text"],
    ["region","Region ID","number"],
    ["recipient_name","Recipient name","text"],
    ["recipient_email","Recipient email","email"],
    ["recipient_phone","Recipient phone","text"],
    ["sender_name","Sender name","text"],
    ["message","Message","textarea"],
    ["status","Status","select",[["active","Active"],["redeemed","Redeemed"],["expired","Expired"],["cancelled","Cancelled"]]],
    ["expiry_date","Expiry date","datetime-local"],
  ],
  abandoned: [
    ["customer_name","Customer name","text"],
    ["customer_email","Customer email","email"],
    ["customer_phone","Customer phone","text"],
    ["subtotal","Subtotal","number"],
    ["currency_code","Currency","text"],
    ["region","Region ID","number"],
    ["locale","Locale","text"],
    ["status","Status","select",[["abandoned","Abandoned"],["contacted","Contacted"],["recovered","Recovered"],["lost","Lost"]]],
    ["recovery_sent_count","Recovery sent count","number"],
    ["recovery_notes","Recovery notes","textarea"],
  ],
};

const CREATE_DEFAULTS = {
  products:   { slug:"",name_en:"",name_ar:"",brand:"Enfant",unit:"",categories:[],image:"",hover_image:"",dietary_tags:[],gallery:[],variants:[],details_en:[],details_ar:[],option_groups_en:[],option_groups_ar:[],stock_quantity:0,rating:5,review_count:0,track_inventory:false,is_published:true,is_featured:false,sort_order:0 },
  categories: { slug:"",name_en:"",name_ar:"",description_en:"",description_ar:"",image:"",sort_order:0 },
  deals:      { code:"",description:"",discount_type:"fixed",value:0,minimum_subtotal:0,max_uses:"",starts_at:"",ends_at:"",is_active:true },
  customers:  { username:"",email:"",password:"",first_name:"",last_name:"",is_active:true,is_staff:false },
  payments:   { order:"",provider:"cod",provider_reference:"",amount:0,currency_code:"OMR",status:"pending",raw_response:{} },
  reviews:    { product:"",order:"",customer_name:"",rating:5,title:"",comment:"",is_verified_purchase:false,is_approved:false },
  shipping:   { region:"",city:"",area:"",min_order_value:0,max_order_value:"",shipping_fee:0,free_shipping_threshold:0,eta_min_days:"",eta_max_days:"",carrier_name:"",active:true },
  cart_milestones: { region:"",reward_type:"free_shipping",threshold:0,discount_value:0,label_en:"",label_ar:"",sort_order:0,is_active:true },
  blog:       { slug:"",title_en:"",title_ar:"",excerpt_en:"",excerpt_ar:"",body_en:"",body_ar:"",image:"",category_en:"",category_ar:"",published_at:"",is_published:false,sort_order:0 },
  pages:      { slug:"",region:"",title_en:"",title_ar:"",body_en:"",body_ar:"",seo_title_en:"",seo_title_ar:"",seo_description_en:"",seo_description_ar:"",is_published:true },
  hero_cards: { title_en:"",title_ar:"",eyebrow_en:"",eyebrow_ar:"",subtitle_en:"",subtitle_ar:"",cta_en:"Shop now",cta_ar:"تسوق الآن",href:"/collections",size:"small",accent:"soft",sort_order:0,is_visible:true,image:"",image_mobile:"" },
  taxes:      { label:"VAT",region:"",country_code:"",rate:0.05,is_inclusive:false,applies_to_shipping:true,is_active:true,effective_from:"",effective_to:"" },
  staff:      { email:"",username:"",password:"",first_name:"",last_name:"",role:"Manager",is_active:true,is_staff:true },
  warehouses: { code:"",name_en:"",name_ar:"",region:"",fulfillment_regions:"",active:true },
  giftcards:  { code:"",initial_balance:0,remaining_balance:0,currency_code:"OMR",region:"",recipient_name:"",recipient_email:"",recipient_phone:"",sender_name:"",message:"",status:"active",expiry_date:"" },
};

const SETTINGS_KEYS = new Set(["homepage","branding","nav_settings","footer_social","seo_legal","social","marketing_tools","apps","payment_setup","inventory_settings"]);
const DASHBOARD_FILTER_DEFAULTS = {
  topMetric: "rating",
  topDateRange: "all_time",
  topMarket: "all",
  customStartDate: "",
  customEndDate: "",
};
const ORDER_FILTER_DEFAULTS = {
  dateRange: "all",
  customStartDate: "",
  customEndDate: "",
  market: "all",
};
const DASHBOARD_REFRESH_INTERVAL_MS = 10000;
const CRUD_KEYS     = ["products","categories","deals","customers","payments","reviews","shipping","cart_milestones","blog","pages","hero_cards","taxes","staff","warehouses","giftcards"];
const DELETABLE     = ["products","categories","deals","customers","payments","reviews","shipping","cart_milestones","blog","pages","hero_cards","taxes","staff","warehouses","giftcards"];
const REPORT_TYPES  = ["orders","customers","inventory","low-stock","sales","abandoned-carts"];

// ─── Placeholder configs ───────────────────────────────────────────────────────

const PLACEHOLDER_CONFIGS = {
  seo: {
    icon: "◎", badge: "Coming Soon", title: "SEO Manager",
    description: "Control how your storefront appears in search results. Configure meta titles, Open Graph tags, structured data, and sitemap generation per page, product, and collection.",
    features: ["Page-level meta title & description","Open Graph and Twitter card settings","Product JSON-LD structured data","Auto-generated XML sitemap","Canonical URL management","Robots.txt control","301/302 redirect manager"],
  },
};

// ─── Integration configs ──────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SETTINGS_TITLES = {
  homepage:      "Content Sections",
  branding:      "Branding & Identity",
  nav_settings:  "Navigation Links",
  footer_social: "Footer & Social Media",
  seo_legal:     "SEO & Legal Pages",
};

function titleFor(item, key) {
  if (SETTINGS_TITLES[key])  return SETTINGS_TITLES[key];
  if (key === "returns")     return `Return — ${item?.order_number || item?.id}`;
  if (key === "regions")     return item?.name || item?.code || `Region ${item?.id}`;
  if (key === "taxes")       return item?.label ? `${item.label}${item.rate_pct != null ? ` (${item.rate_pct}%)` : ""}` : `Tax rate ${item?.id}`;
  if (key === "staff")       return item?.email || item?.username || `Staff ${item?.id}`;
  if (key === "giftcards")   return item?.code || `Gift card ${item?.id}`;
  if (key === "abandoned")   return item?.customer_email || item?.customer_name || `Abandoned cart ${item?.id}`;
  if (key === "hero_cards")  return item?.title_en || item?.title_ar || `Hero card ${item?.id}`;
  if (key === "cart_milestones") return item?.label_en || (item?.reward_type === "discount_percent" ? `${item?.discount_value}% off` : "Free shipping");
  if (key === "pages")       return item?.title_en || item?.title_ar || item?.slug || `Page ${item?.id}`;
  return item?.order_number || item?.name_en || item?.title_en || item?.code || item?.email || item?.username || item?.provider_reference || item?.provider || `${key} item`;
}

function metaFor(item, key) {
  if (!item) return "";
  if (key === "returns") return `${item.customer_name || item.customer_email || "Customer"} · ${item.status}`;
  if (key === "regions") return `${item.currency_code || ""} · ${item.is_active ? "Active" : "Inactive"}`;
  if (key === "taxes")   return `${item.region_code || "Global"} · ${item.is_active ? "Active" : "Inactive"}`;
  if (key === "staff")   return `${item.roles?.[0] || "No role"} · ${item.is_active ? "Active" : "Inactive"}`;
  if (key === "giftcards") return `${item.currency_code || ""} · ${item.initial_balance} / ${item.remaining_balance} · ${item.status}`;
  if (key === "abandoned") return `${item.currency_code || ""} · ${item.subtotal} · ${item.status}`;
  if (key === "hero_cards") return `${item.size || "small"} · sort ${item.sort_order ?? 0} · ${item.is_visible === false ? "hidden" : "visible"}`;
  if (key === "cart_milestones") return `@ ${item.threshold} ${item.region_currency || ""} · ${item.region_code || `region ${item.region}`} · ${item.is_active ? "Active" : "Inactive"}`;
  if (key === "pages") return `${item.slug || ""} · ${item.region_code || "Global"} · ${item.is_published ? "Published" : "Draft"}`;
  return item.customer_name || item.brand || item.status || item.payment_status || item.discount_type || item.currency_code || (item.is_approved === false ? "Pending moderation" : item.is_published !== undefined ? (item.is_published ? "Published" : "Draft") : "Ready");
}

function labelFor(key) {
  if (key === "deals") return "promotions";
  if (key === "homepage") return "settings";
  return key;
}

function statusTone(value = "") {
  const v = String(value).toLowerCase();
  if (["paid","delivered","active","approved","confirmed","published","shipped","processing","recovered"].some((s) => v.includes(s))) return "success";
  if (["pending","review","unpaid","draft","returned","abandoned","contacted"].some((s) => v.includes(s))) return "warning";
  if (["cancelled","failed","inactive","rejected","hidden","expired","lost"].some((s) => v.includes(s))) return "danger";
  return "neutral";
}

function stringify(value, type) {
  if (type === "gallery") return Array.isArray(value) ? value : [];
  if (type === "product-variants") return Array.isArray(value) ? value : [];
  if (type === "option-groups") return Array.isArray(value) ? value : [];
  if (type === "categories-select") return Array.isArray(value) ? value : [];
  if (type === "json") return typeof value === "string" ? value : JSON.stringify(value ?? [], null, 2);
  if (type === "datetime-local" && value) return String(value).slice(0, 16);
  if (type === "date" && value) return String(value).slice(0, 10);
  return value ?? "";
}

function getFieldType(name, key) {
  return (FIELD_CONFIGS[key] || []).find(([n]) => n === name)?.[2];
}

function cleanOptionGroups(value) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw || "[]");
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((group) => ({
      name: String(group?.name || "").trim(),
      values: Array.isArray(group?.values)
        ? group.values.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
    }))
    .filter((group) => group.name && group.values.length);
}

function cleanProductVariants(value) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw || "[]");
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((variant, index) => {
      const options = variant?.options && typeof variant.options === "object" && !Array.isArray(variant.options)
        ? Object.fromEntries(
            Object.entries(variant.options)
              .map(([key, val]) => [String(key || "").trim(), String(val || "").trim()])
              .filter(([key, val]) => key && val),
          )
        : {};
      const titleEn = String(variant?.title_en || "").trim();
      const titleAr = String(variant?.title_ar || "").trim();
      const sku = String(variant?.sku || "").trim();
      const fallbackId = sku || titleEn || Object.values(options).join("-") || `variant-${index + 1}`;
      return {
        id: String(variant?.id || fallbackId)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || `variant-${index + 1}`,
        sku,
        title_en: titleEn,
        title_ar: titleAr,
        options,
        price: variant?.price === "" || variant?.price === null || variant?.price === undefined ? "" : String(variant.price),
        compare_at_price: variant?.compare_at_price === "" || variant?.compare_at_price === null || variant?.compare_at_price === undefined ? "" : String(variant.compare_at_price),
        image: String(variant?.image || "").trim(),
        stock_quantity: variant?.stock_quantity === "" || variant?.stock_quantity === null || variant?.stock_quantity === undefined ? "" : Number(variant.stock_quantity),
        is_active: variant?.is_active !== false,
      };
    })
    .filter((variant) => variant.title_en || Object.keys(variant.options).length || variant.price);
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildOrdersDateFilterParams(filters) {
  const dateRange = filters?.dateRange || "all";
  if (dateRange === "custom") {
    return {
      dateFrom: filters?.customStartDate || "",
      dateTo: filters?.customEndDate || "",
    };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dateRange === "today") {
    const value = formatLocalDate(today);
    return { dateFrom: value, dateTo: value };
  }
  if (dateRange === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const value = formatLocalDate(yesterday);
    return { dateFrom: value, dateTo: value };
  }
  if (dateRange === "last_7_days") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { dateFrom: formatLocalDate(start), dateTo: formatLocalDate(today) };
  }
  if (dateRange === "last_30_days") {
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    return { dateFrom: formatLocalDate(start), dateTo: formatLocalDate(today) };
  }
  return { dateFrom: "", dateTo: "" };
}

function buildPayload(editor, key, mode) {
  // On edit we must transmit cleared text fields (empty string) so the admin can
  // actually blank out a value; on create we omit empties so model defaults apply.
  const isEdit = mode === "edit";
  const shouldSkip = (k, v, type) => {
    if (k === "password" && !v) return true;
    // Never re-submit an existing file path as a string (backend FileField rejects it).
    if (type === "file" && !(v instanceof File)) return true;
    if (v === null || v === undefined) return true;
    if (v === "" && !isEdit) return true;
    return false;
  };
  const hasFile = Object.values(editor).some((v) => v instanceof File);
  if (hasFile) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(editor)) {
      const type = getFieldType(k, key);
      if (shouldSkip(k, v, type)) continue;
      if (type === "product-variants") fd.append(k, JSON.stringify(cleanProductVariants(v)));
      else if (type === "option-groups") fd.append(k, JSON.stringify(cleanOptionGroups(v)));
      else if (type === "json" || type === "gallery") fd.append(k, JSON.stringify(typeof v === "string" ? JSON.parse(v || "null") : v));
      else if (type === "categories-select") { const ids = Array.isArray(v) ? v : []; ids.forEach((id) => fd.append(k, id)); if (ids.length === 0) fd.append(k, ""); }
      else if (v instanceof File) fd.append(k, v);
      else fd.append(k, v);
    }
    return fd;
  }
  const payload = {};
  for (const [k, v] of Object.entries(editor)) {
    const type = getFieldType(k, key);
    if (shouldSkip(k, v, type)) continue;
    if (type === "product-variants") payload[k] = cleanProductVariants(v);
    else if (type === "option-groups") payload[k] = cleanOptionGroups(v);
    else if (type === "json" || type === "gallery") payload[k] = typeof v === "string" ? JSON.parse(v || "null") : v;
    else if (type === "categories-select") payload[k] = Array.isArray(v) ? v : [];
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
  const [draftComposerOpen, setDraftComposerOpen] = useState(false);
  const [draftComposerOrder, setDraftComposerOrder] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [toast, setToast]           = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [dashboardFilters, setDashboardFilters] = useState(DASHBOARD_FILTER_DEFAULTS);
  const [orderFilters, setOrderFilters] = useState(ORDER_FILTER_DEFAULTS);
  const [inventoryThreshold, setInventoryThreshold] = useState(10);
  const [inventoryFocusSlug, setInventoryFocusSlug] = useState("");
  const [warehouseStocks, setWarehouseStocks] = useState([]);
  const [demandAlerts, setDemandAlerts] = useState([]);
  const [auditFilters, setAuditFilters] = useState({ action: "", resource_type: "" });
  const [customersTab, setCustomersTab] = useState("list");

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
  const sidebarNavGroups = useMemo(() => (
    visibleNavGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => (
          item.showInSidebar !== false
          || (ORDER_SECTION_KEYS.has(item.key) && !canViewKey("orders"))
        )),
      }))
      .filter((group) => group.items.length)
  ), [visibleNavGroups, canViewKey]);

  const active    = visibleNavItems.find((n) => n.key === activeKey) || visibleNavItems[0] || null;
  const canCreate = Boolean(
    active && (
      (CRUD_KEYS.includes(activeKey) && canWriteKey(activeKey))
      || (activeKey === "draft_orders" && canWriteKey("draft_orders"))
    )
  );
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

  const isOrdersSectionActive = useCallback((key) => {
    if (key === "orders") return ORDER_SECTION_KEYS.has(activeKey);
    return activeKey === key;
  }, [activeKey]);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY) || "");
    setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

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
    let rawText = "";
    try {
      rawText = await res.text();
      payload = rawText ? JSON.parse(rawText) : null;
    } catch { payload = null; }
    if (!res.ok) {
      const fallbackDetail = typeof rawText === "string" ? rawText.trim() : "";
      throw new Error(payload?.detail || payload?.error || fallbackDetail || "Request failed");
    }
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

  async function loadScreen(screen = active, options = {}) {
    if (!screen || !screen.endpoint) { setData(null); setLoading(false); return; }
    if (!options.silent) setLoading(true);
    if (mode !== "edit" && !options.silent) closeForm();
    try {
      let url = screen.endpoint;
      const screenKey = screen?.key || activeKey;
      const filterSource = options.dashboardFilters || dashboardFilters;
      const params = new URLSearchParams();
      let requestedPageSize = DEFAULT_ADMIN_PAGE_SIZE;
      if ((CRUD_KEYS.includes(screenKey) || screenKey === "orders" || screenKey === "draft_orders" || screenKey === "abandoned") && debouncedSearchQuery) {
        params.set("search", debouncedSearchQuery);
      }
      if (page > 1 && (CRUD_KEYS.includes(screenKey) || screenKey === "abandoned")) {
        params.set("page", String(page));
      }
      if (screenKey === "dashboard") {
        params.set("top_metric", filterSource.topMetric);
        params.set("top_date_range", filterSource.topDateRange);
        params.set("top_market", filterSource.topMarket);
        if (filterSource.topDateRange === "custom_date") {
          if (filterSource.customStartDate) params.set("top_start_date", filterSource.customStartDate);
          if (filterSource.customEndDate) params.set("top_end_date", filterSource.customEndDate);
        }
      }
      if (screenKey === "inventory") {
        requestedPageSize = INVENTORY_PAGE_SIZE;
        params.set("page_size", String(requestedPageSize));
      }
      if (screenKey === "orders" || screenKey === "draft_orders") {
        const orderFilterSource = options.orderFilters || orderFilters;
        if (screenKey === "orders") params.set("sales_channel", "online_store");
        if (screenKey === "draft_orders") params.set("sales_channel", "draft_order");
        if (orderFilterSource.market && orderFilterSource.market !== "all") {
          params.set("market", orderFilterSource.market);
        }
        const { dateFrom, dateTo } = buildOrdersDateFilterParams(orderFilterSource);
        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);
      }
      const qs = params.toString();
      const raw = await request(qs ? `${url}?${qs}` : url);
      if (screenKey === "dashboard" && raw?.inventory_health_threshold !== undefined) {
        setInventoryThreshold(Number(raw.inventory_health_threshold || 10));
      }
      if (screenKey === "inventory") {
        const [settingsPayload, warehousePayload, demandPayload] = await Promise.all([
          request("/admin/settings/"),
          request("/admin/product-stocks/?page_size=500"),
          request("/admin/back-in-stock-requests/?page_size=500"),
        ]);
        setInventoryThreshold(Number(settingsPayload?.inventory_low_stock_threshold || 10));
        setWarehouseStocks(Array.isArray(warehousePayload?.results) ? warehousePayload.results : []);
        setDemandAlerts(Array.isArray(demandPayload?.results) ? demandPayload.results : []);
      }
      if (raw && typeof raw === "object" && Array.isArray(raw.results)) {
        setData(raw.results);
        if (typeof raw.count === "number") {
          const apiPageSize = Number(raw.page_size);
          const pageSize = Number.isFinite(apiPageSize) && apiPageSize > 0 ? apiPageSize : requestedPageSize;
          setTotalPages(Math.max(1, Math.ceil(raw.count / pageSize)));
        }
      } else if (raw && typeof raw === "object" && "count" in raw && Array.isArray(raw.results)) {
        setData(raw.results);
        const totalCount = Number(raw.count);
        const apiPageSize = Number(raw.page_size);
        const pageSize = Number.isFinite(apiPageSize) && apiPageSize > 0 ? apiPageSize : requestedPageSize;
        setTotalPages(Number.isFinite(totalCount) ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1);
      } else {
        setData(raw);
        setTotalPages(1);
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      if (!options.silent) setLoading(false);
    }
  }

  async function handleRefundOrder(order) {
    if (!order?.order_number) return;
    if (!window.confirm(`Issue refund for order ${order.order_number}? This will process a refund and may update inventory.`)) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/orders/${order.order_number}/refund/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      let payload = null;
      if (!res.ok) {
        let detail = "Refund failed";
        try { payload = await res.json(); detail = payload?.detail || payload?.error || detail; } catch {}
        throw new Error(detail);
      }
      payload = await res.json();
      if (payload?.order) {
        setSelected(payload.order);
        setEditor(makeEditor(payload.order, activeKey));
      }
      showToast("Refund processed successfully.", "success");
      await loadScreen(active);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateShipment(order) {
    if (!order?.order_number) return;
    if (!window.confirm(`Create shipment for order ${order.order_number}?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/orders/${order.order_number}/shipment/create/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      let payload = null;
      if (!res.ok) {
        let detail = "Shipment creation failed";
        try { payload = await res.json(); detail = payload?.detail || payload?.error || detail; } catch {}
        throw new Error(detail);
      }
      payload = await res.json();
      if (payload?.order) {
        setSelected(payload.order);
        setEditor(makeEditor(payload.order, activeKey));
      }
      showToast("Shipment created successfully.", "success");
      await loadScreen(active);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteOrder(order) {
    if (!order?.order_number) return;
    const confirmed = window.confirm(
      `Delete order ${order.order_number} (${order.customer_name || "customer"})?\n\nThis permanently removes the order and releases any reserved inventory. This cannot be undone.`
    );
    if (!confirmed) return;
    setLoading(true);
    try {
      await request(`/admin/orders/${order.order_number}/`, { method: "DELETE" });
      closeForm();
      showToast(`Order ${order.order_number} deleted.`, "success");
      await loadScreen(active);
    } catch (err) {
      showToast(err.message || "Delete failed.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleRollbackOrderStatus(order) {
    if (!order?.order_number) return;
    setLoading(true);
    try {
      const latestOrder = await request(`/admin/orders/${order.order_number}/`);
      const previousLabel = latestOrder?.previous_status_label || latestOrder?.previous_status || "previous status";
      if (!latestOrder?.can_revert_status) {
        throw new Error(latestOrder?.revert_status_helper || "No previous order status is available for rollback.");
      }

      const promptValue = window.prompt(`Revert order ${order.order_number} to ${previousLabel}?\nOptional note:`);
      if (promptValue === null) return;

      const rollbackPath = latestOrder?.rollback_action?.url || `/admin/orders/${order.order_number}/status-rollback/`;
      const normalizedRollbackPath = String(rollbackPath).replace(/^https?:\/\/[^/]+\/api/, "").replace(/^\/api/, "");
      const payload = await request(normalizedRollbackPath, {
        method: "POST",
        body: JSON.stringify({ admin_note: promptValue }),
      });
      const refreshedOrder = payload?.order_number ? await request(`/admin/orders/${payload.order_number}/`) : payload;
      if (refreshedOrder && typeof refreshedOrder === "object") {
        setSelected(refreshedOrder);
        setEditor(makeEditor(refreshedOrder, activeKey));
      }
      showToast(`Order reverted to ${previousLabel}.`, "success");
      await loadScreen(active);
    } catch (err) {
      showToast(err.message || "Status rollback failed", "error");
    } finally {
      setLoading(false);
    }
  }

  function detailPath(item = selected, key = activeKey) {
    if (!item) return "";
    if (key === "products")   return `/admin/products/${item.slug}/`;
    if (key === "categories") return `/admin/categories/${item.slug}/`;
    if (key === "deals")      return `/admin/promotions/${item.id}/`;
    if (key === "orders")     return `/admin/orders/${item.order_number}/`;
    if (key === "draft_orders") return `/admin/orders/${item.order_number}/`;
    if (key === "payments")   return `/admin/payments/${item.id}/`;
    if (key === "customers")  return `/admin/customers/${item.id}/`;
    if (key === "reviews")    return `/admin/reviews/${item.id}/`;
    if (key === "shipping")   return `/admin/shipping-rules/${item.id}/`;
    if (key === "cart_milestones") return `/admin/cart-milestones/${item.id}/`;
    if (key === "blog")       return `/admin/blog-posts/${item.slug || item.id}/`;
    if (key === "pages")      return `/admin/cms-pages/${item.id}/`;
    if (key === "hero_cards") return `/admin/hero-promo-cards/${item.id}/`;
    if (key === "returns")    return `/admin/returns/${item.id}/`;
    if (key === "taxes")      return `/admin/tax-rates/${item.id}/`;
    if (key === "staff")      return `/admin/staff/${item.id}/`;
    if (key === "giftcards")  return `/admin/gift-cards/${item.id}/`;
    if (key === "abandoned")  return `/admin/abandoned-carts/${item.id}/`;
    return "";
  }

  async function openDetail(item) {
    if (activeKey === "draft_orders") {
      await openDraftOrderEditor(item);
      return;
    }
    if (!canEdit) {
      showToast("You can view this section but cannot edit it.", "info");
      return;
    }
    const path = detailPath(item);
    setLoading(true);
    try {
      const payload = path ? await request(path) : item;
      setMode("edit");
      setSelected(payload);
      setEditor(makeEditor(payload));
      setFormOpen(true);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function openDraftOrderEditor(item) {
    if (!item?.order_number) return;
    if (!canWriteKey("draft_orders")) {
      showToast("You can view drafts but cannot edit them.", "info");
      return;
    }
    setLoading(true);
    try {
      const payload = await request(`/admin/orders/${item.order_number}/`);
      setDraftComposerOrder(payload || item);
      setDraftComposerOpen(true);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function openProductEditor(product) {
    if (!product?.slug) {
      navigate("inventory");
      return;
    }
    if (!canViewKey("products")) {
      showToast("You do not have access to product records.", "error");
      return;
    }
    if (!canWriteKey("products")) {
      showToast("You can view products but cannot edit stock.", "info");
      navigate("inventory", { focusProductSlug: product.slug });
      return;
    }

    setActiveKey("products");
    setPage(1);
    setSearchQuery("");
    setInventoryFocusSlug("");
    setSidebarOpen(false);
    setMode("edit");
    setSelected(product);
    setEditor(makeEditor(product, "products"));
    setFormOpen(true);

    try {
      const payload = await request(detailPath(product, "products"));
      setSelected(payload);
      setEditor(makeEditor(payload, "products"));
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
    if (activeKey === "draft_orders") {
      if (!canWriteKey("draft_orders")) {
        showToast("You do not have permission to create draft orders.", "error");
        return;
      }
      setDraftComposerOrder(null);
      setDraftComposerOpen(true);
      return;
    }
    if (!canWriteKey(activeKey)) {
      showToast("You do not have permission to create records in this section.", "error");
      return;
    }
    setMode("create");
    setSelected(null);
    setEditor(makeEditor(CREATE_DEFAULTS[activeKey] || {}, activeKey));
    setFormOpen(true);
  }

  function openSettingsEditor() {
    if (!canWriteKey(activeKey)) {
      showToast("You do not have permission to edit these settings.", "error");
      return;
    }
    setMode("edit");
    setSelected(data || {});
    setEditor(makeEditor(data || {}, activeKey));
    setFormOpen(true);
  }

  function openHomepageSettings() {
    openSettingsEditor();
  }

  async function patchSettings(fields) {
    setLoading(true);
    try {
      await request("/admin/settings/", { method: "PATCH", body: JSON.stringify(fields) });
      showToast("Saved.", "success");
      await loadScreen(active);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function closeForm() {
    setSelected(null);
    setEditor({});
    setMode("view");
    setFormOpen(false);
  }

  function closeDraftComposer() {
    setDraftComposerOrder(null);
    setDraftComposerOpen(false);
  }

  async function handleDraftSaved() {
    closeDraftComposer();
    showToast("Draft order saved.", "success");
    await loadScreen(active);
  }

  async function uploadGalleryImage(slug, file) {
    const fd = new FormData();
    fd.append("files", file);
    const res = await request(`/admin/products/${slug}/gallery/`, { method: "POST", body: fd });
    return Array.isArray(res?.urls) ? res.urls : [];
  }

  async function saveRecord() {
    if (!canWriteKey(activeKey)) {
      showToast("You do not have permission to save changes in this section.", "error");
      return;
    }
    setLoading(true);
    try {
      const path = mode === "create" ? active.endpoint : SETTINGS_KEYS.has(activeKey) ? active.endpoint : detailPath();
      const method = mode === "create" ? "POST" : "PATCH";
      const payload = buildPayload(editor, activeKey, mode);
      const saved = await request(path, { method, body: payload instanceof FormData ? payload : JSON.stringify(payload) });
      if (saved && typeof saved === "object" && mode === "edit") {
        setSelected(saved);
        setEditor(makeEditor(saved, activeKey));
      }
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

  useEffect(() => {
    if (!(token && adminMe && activeKey === "dashboard" && active)) return undefined;
    const timer = window.setInterval(() => {
      void loadScreen(active, { silent: true });
    }, DASHBOARD_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, adminMe, activeKey, dashboardFilters]);

  useEffect(() => {
    if (!(token && adminMe && (activeKey === "orders" || activeKey === "draft_orders") && active)) return;
    void loadScreen(active, { orderFilters });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderFilters, token, adminMe, activeKey]);

  useEffect(() => {
    if (!(token && adminMe && active && page > 1)) return;
    if (!(CRUD_KEYS.includes(activeKey) || activeKey === "orders" || activeKey === "draft_orders" || activeKey === "abandoned")) return;
    void loadScreen(active, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, token, adminMe, activeKey]);

  useEffect(() => {
    if (!(token && adminMe && active)) return;
    if (!(CRUD_KEYS.includes(activeKey) || activeKey === "orders" || activeKey === "draft_orders" || activeKey === "abandoned")) return;
    void loadScreen(active, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchQuery, token, adminMe, activeKey]);

  function navigate(key, options = {}) {
    if (!canViewKey(key)) {
      showToast("You do not have access to this section.", "error");
      return;
    }
    if (options.focusProductSlug !== undefined) {
      setInventoryFocusSlug(options.focusProductSlug || "");
    } else if (key !== "inventory") {
      setInventoryFocusSlug("");
    }
    setActiveKey(key);
    setPage(1);
    setSearchQuery("");
    setSidebarOpen(false);
    setDraftComposerOpen(false);
    setDraftComposerOrder(null);
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
    <div className={`admin-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
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
          {sidebarNavGroups.map((group) => (
            <div key={group.label} className="admin-nav-group">
              <span className="admin-nav-group-label">{group.label}</span>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`admin-nav-item ${isOrdersSectionActive(item.key) ? "active" : ""}`}
                  onClick={() => navigate(item.key)}
                >
                  <span className="admin-nav-icon" aria-hidden="true">
                    <Icon name={item.icon} size={18} />
                  </span>
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
          <button
            type="button"
            className="admin-sidebar-toggle"
            aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            onClick={() => {
              setSidebarOpen(false);
              setSidebarCollapsed((prev) => !prev);
            }}
          >
            <span className={`admin-sidebar-toggle-icon ${sidebarCollapsed ? "" : "expanded"}`} aria-hidden="true">
              <Icon name="arrowRight" size={16} />
            </span>
            <span>{sidebarCollapsed ? "Show Menu" : "Hide Menu"}</span>
          </button>
          <div className="admin-topbar-title">
            <h1>{active.label}</h1>
            <p>{active.desc}</p>
          </div>
          {canCreate && !(activeKey === "draft_orders" && draftComposerOpen) ? (
            <button type="button" className="admin-btn-primary admin-topbar-cta" onClick={startCreate}>
              + {activeKey === "draft_orders" ? "Create order" : activeKey === "blog" ? "New article" : activeKey === "hero_cards" ? "Add hero card" : activeKey === "deals" ? "Add deal" : activeKey === "shipping" ? "Add rule" : activeKey === "cart_milestones" ? "Add milestone" : activeKey === "taxes" ? "Add tax rule" : activeKey === "staff" ? "Add staff" : `Add ${activeKey.slice(0, -1)}`}
            </button>
          ) : null}
        </header>

        <div className={`admin-content ${activeKey === "draft_orders" && draftComposerOpen ? "admin-content--draft-order" : ""}`}>
          {ORDER_SECTION_KEYS.has(activeKey) ? (
            <section className="admin-orders-section-tabs" aria-label="Orders sections">
              {ORDER_SECTION_TABS
                .filter((tab) => canViewKey(tab.key))
                .map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`admin-orders-section-tab ${activeKey === tab.key ? "active" : ""}`}
                    onClick={() => navigate(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
            </section>
          ) : null}
          {loading
            ? <div className="admin-loading" style={{ padding: "2rem" }}><SkeletonLoader count={5} type={activeKey === "dashboard" || activeKey === "analytics" ? "grid" : "list"} /></div>
            : renderSection()}
        </div>
      </main>

      {formOpen ? (
        <CrudFormModal
          activeKey={activeKey}
          isSettings={SETTINGS_KEYS.has(activeKey)}
          mode={mode}
          selected={selected}
          editor={editor}
          setEditor={setEditor}
          canDelete={canDelete && mode === "edit"}
          onClose={closeForm}
          onSave={saveRecord}
          onDelete={() => deleteRecord(selected)}
          onDownloadInvoice={downloadOrderInvoice}
          onRefundOrder={activeKey === "orders" ? handleRefundOrder : undefined}
          onCreateShipment={activeKey === "orders" ? handleCreateShipment : undefined}
          onRollbackOrderStatus={activeKey === "orders" ? handleRollbackOrderStatus : undefined}
          onGalleryUpload={uploadGalleryImage}
          titleFor={titleFor}
          metaFor={metaFor}
          fields={FIELD_CONFIGS[activeKey]}
          request={activeKey === "orders" ? request : undefined}
          onOrderRefreshed={activeKey === "orders" ? (updated) => { setSelected(updated); setEditor(makeEditor(updated, activeKey)); } : undefined}
          onDeleteOrder={activeKey === "orders" ? handleDeleteOrder : undefined}
        />
      ) : null}
    </div>
  );

  function renderSection() {
    if (PLACEHOLDER_CONFIGS[activeKey])         return <PlaceholderModule config={PLACEHOLDER_CONFIGS[activeKey]} />;
    if (activeKey === "payment_setup")
      return <PaymentGatewaysView data={data} canEdit={canWriteKey(activeKey)} onPatch={patchSettings} request={request} />;
    if (activeKey === "social" || activeKey === "marketing_tools" || activeKey === "apps")
      return <IntegrationsView category={activeKey} data={data} canEdit={canWriteKey(activeKey)} onPatch={patchSettings} />;
    if (activeKey === "dashboard")
      return (
        <DashboardView
          data={data}
          filters={dashboardFilters}
          onFiltersChange={(patch) => {
            setDashboardFilters((prev) => {
              const next = { ...prev, ...patch };
              if (token && adminMe && active) {
                void loadScreen(active, { dashboardFilters: next });
              }
              return next;
            });
          }}
          onRefresh={() => { void loadScreen(active); }}
          onRestock={openProductEditor}
          onViewAllInventory={() => navigate("inventory")}
        />
      );
    if (activeKey === "analytics")              return <AnalyticsView data={data} />;
    if (activeKey === "inventory")              return <InventoryView rows={Array.isArray(data) ? data : []} threshold={inventoryThreshold} focusProductSlug={inventoryFocusSlug} warehouseStocks={warehouseStocks} demandAlerts={demandAlerts} />;
    if (activeKey === "customers") return (
      <div>
        <div className="admin-orders-section-tabs" style={{ marginBottom: 0 }}>
          {[{ key: "list", label: "Customers" }, { key: "ltv", label: "Top Customers (LTV)" }].map((tab) => (
            <button key={tab.key} type="button"
              className={`admin-orders-section-tab ${customersTab === tab.key ? "active" : ""}`}
              onClick={() => setCustomersTab(tab.key)}
            >{tab.label}</button>
          ))}
        </div>
        {customersTab === "ltv"
          ? <InsightsView rows={Array.isArray(data) ? data : []} />
          : <CrudPanel
              rows={Array.isArray(data) ? data : []} activeKey="customers"
              canCreate={canCreate} canEdit={canEdit} canDelete={canDelete}
              onCreate={startCreate} onEdit={openDetail} onDelete={deleteRecord}
              onDownloadInvoice={downloadOrderInvoice}
              titleFor={titleFor} metaFor={metaFor} labelFor={labelFor}
              searchQuery={searchQuery} onSearchChange={(q) => { setSearchQuery(q); setPage(1); }}
              page={page} totalPages={totalPages} onPageChange={(p) => { setPage(p); }}
            />
        }
      </div>
    );
    if (activeKey === "newsletter")             return <NewsletterPanel data={data} />;
    if (activeKey === "reports")               return <Reports data={data} onDownload={downloadReport} />;
    if (activeKey === "audit_logs")            return <AuditLogsPanel rows={Array.isArray(data) ? data : []} filters={auditFilters} onFiltersChange={(patch) => setAuditFilters((prev) => ({ ...prev, ...patch }))} />;
    if (activeKey === "regions")               return <RegionsView rows={Array.isArray(data) ? data : []} request={request} onSaved={() => loadScreen()} />;
    if (activeKey === "instagram_posts")       return <InstagramPostsPanel rows={Array.isArray(data) ? data : []} request={request} onSaved={() => loadScreen()} />;
    if (activeKey === "draft_orders" && draftComposerOpen) {
      return (
        <DraftOrderComposer
          request={request}
          initialOrder={draftComposerOrder}
          onClose={closeDraftComposer}
          onSaved={handleDraftSaved}
        />
      );
    }
    if (SETTINGS_KEYS.has(activeKey))           return <StoreSettingsSection section={activeKey} data={data} onEdit={openSettingsEditor} canEdit={canWriteKey(activeKey)} />;
    return (
      <CrudPanel
        rows={Array.isArray(data) ? data : []}
        activeKey={activeKey}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        onCreate={startCreate}
        onEdit={activeKey === "draft_orders" ? openDraftOrderEditor : openDetail}
        onDelete={deleteRecord}
        onDownloadInvoice={downloadOrderInvoice}
        onBulkStatusChange={activeKey === "orders" ? async (orderNumbers, newStatus) => {
          await Promise.all(
            orderNumbers.map((num) =>
              request(`/admin/orders/${num}/`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) })
            )
          );
          void loadScreen(active);
        } : undefined}
        titleFor={titleFor}
        metaFor={metaFor}
        labelFor={labelFor}
        searchQuery={searchQuery}
        onSearchChange={(q) => { setSearchQuery(q); setPage(1); }}
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => { setPage(p); }}
        orderFilters={activeKey === "orders" || activeKey === "draft_orders" ? orderFilters : null}
        onOrderFiltersChange={activeKey === "orders" || activeKey === "draft_orders" ? (patch) => {
          setOrderFilters((prev) => {
            const next = { ...prev, ...patch };
            if (patch.dateRange && patch.dateRange !== "custom") {
              next.customStartDate = "";
              next.customEndDate = "";
            }
            return next;
          });
          setPage(1);
        } : undefined}
      />
    );
  }
}
