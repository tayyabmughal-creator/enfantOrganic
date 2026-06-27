# Enfant Organic — Admin Panel Guide

> This guide is written for the store admin. No technical knowledge needed.
> Read from top to bottom once, then use the Table of Contents to jump to what you need.

---

## Table of Contents

1. [How to Login](#1-how-to-login)
2. [Dashboard Overview](#2-dashboard-overview)
3. [Products — Full Guide](#3-products--full-guide)
   - [Add a New Product](#add-a-new-product)
   - [Edit an Existing Product](#edit-an-existing-product)
   - [Product Fields Explained](#product-fields-explained)
   - [Add Gallery Images](#add-gallery-images)
   - [Set Product Prices (by Region)](#set-product-prices-by-region)
   - [Products with Variants (Size / Pack options)](#products-with-variants)
   - [Publish or Unpublish a Product](#publish-or-unpublish-a-product)
4. [Categories](#4-categories)
5. [Orders](#5-orders)
6. [Customers](#6-customers)
7. [Coupons & Discounts](#7-coupons--discounts)
8. [Quick Reference — Common Tasks](#8-quick-reference--common-tasks)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. How to Login

1. Open your browser and go to:
   ```
   https://www.enfantorganic.com/django-admin/
   ```
2. Enter your **Username** and **Password**.
3. Click **Log in**.

> If you forget your password, contact the developer to reset it.

---

## 2. Dashboard Overview

After login you will see the main admin dashboard. The left side has a navigation menu. The most important sections are:

| Section | What it does |
|---|---|
| **Products** | Add, edit, delete products |
| **Categories** | Manage product categories |
| **Orders** | View and manage customer orders |
| **Customers** | View registered customers |
| **Coupons** | Create discount codes |
| **Regions** | Manage countries (OM, AE, SA) |

---

## 3. Products — Full Guide

### Add a New Product

1. In the left menu, click **Store → Products**.
2. Click the **+ Add Product** button (top right).
3. Fill in the fields (see [Product Fields Explained](#product-fields-explained) below).
4. Scroll to the bottom and click **Save**.

---

### Edit an Existing Product

1. Click **Store → Products**.
2. Use the **Search box** to find the product by name.
3. Click on the product name.
4. Make your changes.
5. Click **Save** (top or bottom of page).

---

### Product Fields Explained

The product form is divided into sections. Each section can be **opened or closed** by clicking on it.

---

#### Section 1 — Core Info (always visible)

| Field | Required? | What to put |
|---|---|---|
| **Slug** | Yes (auto-fills) | The URL of the product. Example: `enfant-baby-lotion`. Do not change after product is live. |
| **Is Published** | — | Tick = visible on website. Untick = hidden. |
| **Name (EN)** | Yes | Product name in English |
| **Name (AR)** | No | Product name in Arabic |
| **Brand** | No | Leave as `Enfant` |
| **Unit** | No | Size shown on card, e.g. `250ml`. Leave empty if product has variants. |
| **Sort Order** | No | Lower number = appears first. `1` = top of list. |

---

#### Section 2 — Categories & Tags

| Field | What to do |
|---|---|
| **Categories** | Select from the left list → click arrow → moves to right (chosen). A product can be in multiple categories. |
| **Tags** | Same as categories. Tags are used for filtering and search. |

---

#### Section 3 — Images

| Field | What to put |
|---|---|
| **Image File** (left) | Upload the **main product photo** from your computer. Recommended. Max size: 25MB. |
| **Hover Image File** (right) | Upload a **second photo** that shows when customer hovers. Optional. |
| **Image** (URL) | Only if image is hosted online. Paste the URL. Leave empty if you uploaded a file above. |
| **Hover Image** (URL) | Same — only if using URL. |

> **Tip:** Always prefer uploading a file over pasting a URL. Files are faster and always work.

For gallery images (multiple photos), scroll down to the **Gallery Images** table at the bottom of the product form. See [Add Gallery Images](#add-gallery-images).

---

#### Section 4 — Inventory & Pricing

| Field | What to put |
|---|---|
| **Stock Quantity** | Number of items in stock. Example: `50`. |
| **Track Inventory** | Tick this if you want the site to auto-reduce stock when orders are placed. |

> Actual prices (OMR, AED, SAR) are set in the **Price** table at the bottom of the product form. See [Set Product Prices](#set-product-prices-by-region).

---

#### Section 5 — Short Description

| Field | What to put |
|---|---|
| **Short Description (EN)** | 1–2 sentences shown on product card. Keep it simple. |
| **Short Description (AR)** | Same in Arabic. Optional. |

---

#### Section 6 — Full Description (click to open)

Longer text shown on the product detail page. You can paste HTML or plain text.

---

#### Section 7 — Variants & Options (click to open)

Only fill this if your product has **sizes, packs, or options** (e.g. 200g / 400g, Single / Pack of 2).

See [Products with Variants](#products-with-variants) section below for a step-by-step guide.

---

#### Section 8 — Organic & Product Details (click to open)

| Field | What to put |
|---|---|
| **Ingredients (EN)** | List of ingredients shown on product page. |
| **Usage Instructions (EN)** | How to use the product. |
| **Origin Source (EN)** | Where ingredients come from, e.g. `France`. |
| **Certification Name** | e.g. `COSMOS Organic` |
| **Shelf Life** | e.g. `24 months` |
| **Expiry Date** | Pick from calendar. Optional. |

---

#### Section 9 — Merchandising (click to open)

| Field | What to put |
|---|---|
| **Badge (EN)** | Small label on product card. e.g. `New`, `Set`, `Organic`. |
| **Is Featured** | Tick = appears in Featured section on homepage. |
| **Show in New Arrivals** | Tick = appears in New Arrivals section. |
| **Show in Baby Sets** | Tick = appears in Baby Sets section. |
| **Show in Top Choices** | Tick = appears in Top Choices section. |
| **Review Count** | Number shown next to stars. e.g. `38`. |
| **Rating** | Star rating out of 5. e.g. `4.8`. |

---

#### Section 10 — SEO (click to open)

Only fill if you want custom SEO titles for Google. Leave empty for auto-generated.

| Field | What to put |
|---|---|
| **SEO Title (EN)** | Short title for Google search result (max 60 characters). |
| **SEO Description (EN)** | Short description for Google (max 160 characters). |

---

#### Section 11 — Advanced (click to open)

| Field | What to put |
|---|---|
| **Vendor (EN)** | Leave as `Enfant Organics` |
| **Shopify Meta** | Leave as `{}`. Only used for imported data. |

---

### Add Gallery Images

Gallery images are the extra photos shown on the product page image carousel.

1. Open the product (Edit page).
2. Scroll all the way to the bottom.
3. You will see a **Gallery Images** table.
4. Click **Add another Gallery Image**.
5. Click **Choose File** and select the photo from your computer.
6. Set **Sort Order**: `1` = first photo, `2` = second, etc.
7. Repeat for each photo.
8. Click **Save** when done.

> You can add as many gallery images as you want. Max 25MB per image.

---

### Set Product Prices (by Region)

Prices are set per region (Oman, UAE, Saudi Arabia).

1. Open the product (Edit page).
2. Scroll to the **Prices** table (near the bottom, above Gallery Images).
3. You will see rows for each region: `om` (Oman), `ae` (UAE), `sa` (Saudi Arabia).
4. Enter the price in each row:

| Field | What to put |
|---|---|
| **Price** | Regular selling price. e.g. `4.600` for Oman |
| **Compare At Price** | Original price (shows as strikethrough). e.g. `6.000`. Leave empty if no discount. |

5. Click **Save**.

> All prices are in the local currency of each region (OMR for Oman, AED for UAE, SAR for Saudi Arabia).

---

### Products with Variants

A **variant** means one product has multiple options — like different sizes or pack quantities.

**Examples:**
- Baby Powder: `200g` and `400g` (two different prices)
- Fabric Wash: `Starter Bottle`, `Refill Pouch`, `Bundle`
- Cotton Buds: `Round` and `Round & Spiral`

When a product has variants, customers see a **Choose Options** button and select their choice before adding to cart.

#### How to Add Variants

1. Open the product form.
2. Click on **Variants & Options** section to open it.
3. You will see a **Variants** text box (JSON format).
4. **Delete everything** in the box and **copy-paste** the template below.
5. Fill in your values.
6. Click **Save**.

#### Variant Template — Copy This

**For 2 options (e.g. two sizes):**

```json
[
  {
    "id": "v1",
    "title_en": "200 Gram",
    "title_ar": "",
    "options": {"Size": "200 Gram"},
    "pricing": {
      "amount": 2.400,
      "compare_amount": null,
      "currency_code": "OMR",
      "prefix": "OMR"
    },
    "stock_quantity": 50,
    "is_available": true
  },
  {
    "id": "v2",
    "title_en": "400 Gram",
    "title_ar": "",
    "options": {"Size": "400 Gram"},
    "pricing": {
      "amount": 3.500,
      "compare_amount": null,
      "currency_code": "OMR",
      "prefix": "OMR"
    },
    "stock_quantity": 50,
    "is_available": true
  }
]
```

**For 3 options (e.g. three pack choices):**

```json
[
  {
    "id": "v1",
    "title_en": "Starter Bottle",
    "title_ar": "",
    "options": {"Variant": "Starter Bottle"},
    "pricing": {
      "amount": 4.600,
      "compare_amount": null,
      "currency_code": "OMR",
      "prefix": "OMR"
    },
    "stock_quantity": 30,
    "is_available": true
  },
  {
    "id": "v2",
    "title_en": "Refill Pouch",
    "title_ar": "",
    "options": {"Variant": "Refill Pouch"},
    "pricing": {
      "amount": 2.700,
      "compare_amount": null,
      "currency_code": "OMR",
      "prefix": "OMR"
    },
    "stock_quantity": 40,
    "is_available": true
  },
  {
    "id": "v3",
    "title_en": "Starter Bottle + Refill Pouch",
    "title_ar": "",
    "options": {"Variant": "Starter Bottle + Refill Pouch"},
    "pricing": {
      "amount": 6.500,
      "compare_amount": null,
      "currency_code": "OMR",
      "prefix": "OMR"
    },
    "stock_quantity": 20,
    "is_available": true
  }
]
```

#### What Each Part Means

| Part | Explanation |
|---|---|
| `"id": "v1"` | Unique ID for this variant. Keep `v1`, `v2`, `v3`... |
| `"title_en"` | Name shown to customer (e.g. `200 Gram`) |
| `"title_ar"` | Arabic name. Leave as `""` if not needed. |
| `"options"` | The selector type and value. Use `"Size"` for sizes, `"Variant"` for other types, `"Pack"` for pack quantities. |
| `"amount"` | Price in OMR. Use a decimal: `4.600` |
| `"compare_amount"` | Old/original price (shows as strikethrough). Put `null` if no discount. |
| `"currency_code"` | Always `"OMR"`. Do not change. |
| `"prefix"` | Always `"OMR"`. Do not change. |
| `"stock_quantity"` | How many in stock for this variant. |
| `"is_available"` | `true` = in stock. `false` = out of stock (greyed out for customer). |

#### To Mark a Variant as Out of Stock

Change `"is_available": true` to `"is_available": false` for that variant.

---

### Publish or Unpublish a Product

**Quick way (from product list):**
1. Go to **Store → Products**.
2. You will see an **Is Published** column with checkboxes.
3. Tick or untick directly in the list.
4. Scroll to the bottom of the list and click **Save**.

**From inside a product:**
1. Open the product.
2. At the very top, tick or untick **Is Published**.
3. Click **Save**.

---

## 4. Categories

Categories group your products (e.g. Baby Lotion, Baby Sets, Oral Care).

### Add a Category

1. Click **Store → Categories**.
2. Click **+ Add Category**.
3. Fill in:

| Field | What to put |
|---|---|
| **Slug** | Auto-fills. e.g. `baby-lotion`. Do not change after creation. |
| **Name (EN)** | Category name in English. e.g. `Baby Lotion` |
| **Name (AR)** | Category name in Arabic. Optional. |
| **Sort Order** | Lower = appears first in navigation. |
| **Image File** | Upload a category banner/icon image. |

4. Click **Save**.

### Assign Products to a Category

1. Open the **product** (not the category).
2. In the **Categories & Tags** section, select the category from the left list and move it to the right.
3. Click **Save**.

---

## 5. Orders

### View Orders

1. Click **Store → Orders**.
2. You will see all orders with:
   - Order number
   - Customer name
   - Total amount
   - Status (Pending, Confirmed, Shipped, Delivered, Cancelled)
   - Date

### Filter Orders

Use the **filter panel on the right** to filter by:
- Status
- Region
- Payment method
- Date range

### Update Order Status

1. Click on an order number.
2. Find the **Status** field.
3. Change it to the new status.
4. Click **Save**.

### View Order Items

Inside an order, you will see:
- **Items** table — what was ordered, quantity, price
- **Payment** — payment method and status
- **Delivery address** — customer's address
- **Order history** — log of status changes

---

## 6. Customers

1. Click **Store → Customers**.
2. You can search by name, email, or phone.
3. Click a customer to see their orders and wishlist.

> You cannot delete customer accounts from here. Contact developer if needed.

---

## 7. Coupons & Discounts

### Create a Coupon

1. Click **Store → Coupons**.
2. Click **+ Add Coupon**.
3. Fill in:

| Field | What to put |
|---|---|
| **Code** | The discount code customer types. e.g. `SUMMER20` |
| **Discount Type** | `Percentage` (20% off) or `Fixed Amount` (5 OMR off) |
| **Discount Value** | e.g. `20` for 20% or `5.000` for 5 OMR |
| **Minimum Order Amount** | Minimum cart total to use the coupon. e.g. `10.000` |
| **Valid From / Valid To** | Date range when coupon works. |
| **Usage Limit** | How many times the coupon can be used total. Leave empty for unlimited. |
| **Is Active** | Tick to activate. |

4. Click **Save**.

---

## 8. Quick Reference — Common Tasks

| Task | Steps |
|---|---|
| **Add new product** | Products → + Add Product → fill fields → Save |
| **Change product price** | Products → click product → scroll to Prices table → edit → Save |
| **Hide a product** | Products → untick Is Published checkbox → Save |
| **Add product image** | Products → click product → Images section → upload file → Save |
| **Add gallery photos** | Products → click product → scroll to Gallery Images → Add another → upload → Save |
| **Change stock quantity** | Products → click product → Inventory section → change Stock Quantity → Save |
| **Add a variant price** | Products → click product → Variants section → edit JSON → Save |
| **Mark variant out of stock** | In Variants JSON, change `"is_available": true` to `false` → Save |
| **View an order** | Orders → click order number |
| **Change order status** | Orders → click order → change Status → Save |
| **Create discount code** | Coupons → + Add Coupon → fill fields → Save |
| **Add a category** | Categories → + Add Category → fill fields → Save |

---

## 9. Troubleshooting

#### My product is not showing on the website

- Check that **Is Published** is ticked.
- Check that the product has at least one **category** assigned.
- Check that the product has a **price** set for the relevant region.

#### Images are not showing

- Make sure you clicked **Save** after uploading.
- If using an image URL, make sure the URL starts with `https://` and the image is publicly accessible.
- Try uploading the image file directly instead of using a URL.

#### Variant prices are not changing when I select an option

- Check the **Variants** JSON in the product. Make sure each variant has `"currency_code": "OMR"` and `"prefix": "OMR"`.
- Make sure `"amount"` is a number, not text. Example: `4.600` not `"4.600"`.
- If unsure, copy the template from [Products with Variants](#products-with-variants) and fill in your values.

#### I made a mistake and want to go back

- If you have not saved yet: click **History** (top right of the product page) — but this only works after saving.
- If you already saved: click the **History** button on the product to see what changed.
- Contact the developer to restore a previous version if needed.

#### The admin panel is slow or not loading

- Try a hard refresh: press `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac).
- Clear your browser cache.
- If the problem continues, contact the developer.

---

## Important Rules

1. **Do not delete categories** that have products assigned to them.
2. **Do not change the Slug** of a product after it has been published — it will break the product page link.
3. **Always click Save** before leaving a page. Changes are not saved automatically.
4. **Do not edit the Shopify Meta field** — it is for internal use only.
5. When editing the **Variants JSON**, be careful with commas and brackets. One missing comma will break the format. Use the template provided.

---

*For technical support, contact the developer.*
