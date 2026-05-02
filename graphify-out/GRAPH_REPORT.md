# Graph Report - .  (2026-05-01)

## Corpus Check
- 108 files · ~107,045 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 474 nodes · 743 edges · 26 communities detected
- Extraction: 66% EXTRACTED · 34% INFERRED · 0% AMBIGUOUS · INFERRED: 253 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output


## Input Scope
- Requested: all
- Resolved: all (source: cli)
- Included files: 108 · Candidates: recursive
- Excluded: 0 untracked · 0 ignored · 1 sensitive · 0 missing committed
## God Nodes (most connected - your core abstractions)
1. `AdminCustomerSerializer` - 25 edges
2. `AdminProductSerializer` - 23 edges
3. `AdminCategorySerializer` - 23 edges
4. `AdminCouponSerializer` - 23 edges
5. `AdminOrderSerializer` - 23 edges
6. `AdminPaymentTransactionSerializer` - 23 edges
7. `AdminReviewSerializer` - 23 edges
8. `AdminRegionSerializer` - 23 edges
9. `AdminSiteSettingsSerializer` - 23 edges
10. `ProductCardSerializer` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Meta` --uses--> `ProductCardSerializer`  [INFERRED]
  backend/store/api_serializers/account.py → backend/store/api_serializers/catalog.py
- `ProfileSerializer` --uses--> `ProductCardSerializer`  [INFERRED]
  backend/store/api_serializers/account.py → backend/store/api_serializers/catalog.py
- `CustomerAddressSerializer` --uses--> `ProductCardSerializer`  [INFERRED]
  backend/store/api_serializers/account.py → backend/store/api_serializers/catalog.py
- `ReviewCreateSerializer` --uses--> `ProductCardSerializer`  [INFERRED]
  backend/store/api_serializers/account.py → backend/store/api_serializers/catalog.py
- `PushDeviceSerializer` --uses--> `ProductCardSerializer`  [INFERRED]
  backend/store/api_serializers/account.py → backend/store/api_serializers/catalog.py

## Communities

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (25): Meta, OrderedModel, BlogPost, Category, HeroPromoCard, InstagramPost, Meta, Product (+17 more)

### Community 1 - "Community 1"
Cohesion: 0.25
Nodes (33): AdminCategoryDetailView, AdminCategoryListCreateView, AdminCategorySerializer, AdminCouponDetailView, AdminCouponListCreateView, AdminCouponSerializer, AdminCustomerDetailView, AdminCustomerListView (+25 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (19): AddressListCreateView, CancelOrderView, CustomerOrderListView, NewsletterSubscriptionView, PasswordResetConfirmView, PasswordResetRequestView, ProfileView, PushDeviceDeactivateView (+11 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (12): BlogPostSerializer, CategorySerializer, HeroPromoCardSerializer, InstagramPostSerializer, ProductDetailSerializer, RegionSerializer, TestimonialSerializer, GuestOrderLookupSerializer (+4 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (12): CustomerAddressSerializer, Meta, NewsletterSubscriptionSerializer, PasswordResetConfirmSerializer, PasswordResetRequestSerializer, ProfileSerializer, PushDeviceSerializer, RegisterSerializer (+4 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (21): BlogPostAdmin, CategoryAdmin, CouponAdmin, CustomerAddressAdmin, HeroPromoCardAdmin, InstagramPostAdmin, NewsletterSubscriptionAdmin, NotificationLogAdmin (+13 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (8): StorefrontContextMixin, apply_catalog_filters(), CatalogPageView, HomePageView, NavigationView, ProductDetailView, ProductListView, StorefrontContextMixin

### Community 7 - "Community 7"
Cohesion: 0.13
Nodes (9): CrudFormModal(), CrudPanel(), fieldType(), labelForKey(), metaFor(), OrderSnapshot(), preparePayload(), statusTone() (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (2): CheckoutAndPermsTestCase, TestCase

### Community 9 - "Community 9"
Cohesion: 0.2
Nodes (10): calculate_shipping_total(), CheckoutCreateSerializer, CheckoutCustomerSerializer, CheckoutItemInputSerializer, CouponValidationSerializer, create(), prepare_checkout_items(), resolve_region() (+2 more)

### Community 10 - "Community 10"
Cohesion: 0.52
Nodes (5): localized(), localized_json(), localized_link_items(), normalize_locale(), serialize_site_settings()

### Community 11 - "Community 11"
Cohesion: 0.29
Nodes (3): BaseCommand, Command, Command

### Community 12 - "Community 12"
Cohesion: 0.6
Nodes (5): notify_admins_low_stock(), notify_admins_new_order(), notify_admins_paid_order(), notify_admins_payment_review(), send_admin_push()

### Community 13 - "Community 13"
Cohesion: 0.6
Nodes (5): getCatalogData(), getHomePageData(), getNavigationData(), getProductBySlug(), request()

### Community 14 - "Community 14"
Cohesion: 0.6
Nodes (5): buildStorePath(), isRtl(), normalizeLocale(), normalizeRegion(), replaceLocaleInPath()

### Community 15 - "Community 15"
Cohesion: 0.83
Nodes (3): getOrder(), money(), ThankYouPage()

### Community 17 - "Community 17"
Cohesion: 0.67
Nodes (2): AppConfig, StoreConfig

### Community 21 - "Community 21"
Cohesion: 1
Nodes (2): CheckoutClient(), getCountryName()

### Community 25 - "Community 25"
Cohesion: 1
Nodes (1): Migration

### Community 26 - "Community 26"
Cohesion: 1
Nodes (1): Migration

### Community 27 - "Community 27"
Cohesion: 1
Nodes (1): Migration

### Community 28 - "Community 28"
Cohesion: 1
Nodes (1): Migration

### Community 29 - "Community 29"
Cohesion: 1
Nodes (1): Migration

### Community 30 - "Community 30"
Cohesion: 1
Nodes (1): Migration

### Community 31 - "Community 31"
Cohesion: 1
Nodes (1): Migration

### Community 32 - "Community 32"
Cohesion: 1
Nodes (1): Migration

## Knowledge Gaps
- **32 isolated node(s):** `ProductPriceInline`, `RegionAdmin`, `SiteSettingsAdmin`, `HeroPromoCardAdmin`, `CategoryAdmin` (+27 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 8`** (2 nodes): `CheckoutAndPermsTestCase`, `TestCase`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (2 nodes): `AppConfig`, `StoreConfig`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (2 nodes): `CheckoutClient()`, `getCountryName()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `Migration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `Migration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `Migration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `Migration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `Migration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `Migration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `Migration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `Migration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CheckoutAndPermsTestCase` connect `Community 8` to `Community 9`, `Community 1`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `IsStaffUser` connect `Community 1` to `Community 8`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Are the 22 inferred relationships involving `AdminCustomerSerializer` (e.g. with `IsStaffUser` and `AdminDashboardView`) actually correct?**
  _`AdminCustomerSerializer` has 22 INFERRED edges - model-reasoned connections that need verification._
- **Are the 22 inferred relationships involving `AdminProductSerializer` (e.g. with `IsStaffUser` and `AdminDashboardView`) actually correct?**
  _`AdminProductSerializer` has 22 INFERRED edges - model-reasoned connections that need verification._
- **Are the 22 inferred relationships involving `AdminCategorySerializer` (e.g. with `IsStaffUser` and `AdminDashboardView`) actually correct?**
  _`AdminCategorySerializer` has 22 INFERRED edges - model-reasoned connections that need verification._
- **Are the 22 inferred relationships involving `AdminCouponSerializer` (e.g. with `IsStaffUser` and `AdminDashboardView`) actually correct?**
  _`AdminCouponSerializer` has 22 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ProductPriceInline`, `RegionAdmin`, `SiteSettingsAdmin` to the rest of the system?**
  _32 weakly-connected nodes found - possible documentation gaps or missing edges._