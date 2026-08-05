# Product Catalogue Export

Hands the whole catalogue over as files: one Excel workbook with all product
data, plus every product's images in its own folder.

---

## What the export looks like

```
enfant-products-export-2026-08-05/
├── products.xlsx
├── README.txt
├── images-not-exported.txt      (only if something could not be fetched)
└── images/
    ├── 001-enfant-organic-the-complete-baby-kit/
    │   ├── 01-main-p16-primary.jpeg
    │   ├── 02-hover-p16-hover.jpeg
    │   └── 03-gallery-p16-2.jpeg
    ├── 002-…/
    └── …
```

* Folder name is `<row number>-<product slug>`. The same string sits in the
  **Image Folder** column of the Products sheet, so an Excel row maps straight
  to a folder on disk.
* File name is `<order>-<role>-<original file name>`, where role is
  `main`, `hover`, `gallery`, `variant` or `certificate`.
* Images are exported at their original uploaded resolution — no re-encoding.
* A product with no images gets no folder. The **Images In Export** and
  **Missing Images** columns say so per product.

### Workbook sheets

| Sheet | Contents |
|---|---|
| **Summary** | Generation time, product counts, image counts, options used |
| **Products** | One row per product — every field, plus a price column per region |
| **Prices** | Price / compare-at price / prefixes per region |
| **Stock** | Quantity, reserved and available per warehouse |
| **Variants** | Variant rows for products that have them |
| **Images** | Every image file: folder, file name, role, status, original source |
| **Categories** | Category list with product counts |
| **Reviews** | Customer reviews per product |

The Products sheet carries both languages for every translated field
(`Name (EN)` / `Name (AR)`, descriptions, ingredients, usage, SEO, OG), the
storefront URL, cost price, stock, badges, collection flags and sort order.

---

## Three ways to run it

### 1. Admin panel — Products module

Two buttons in the Products header:

* **Export data (Excel)** — `products.xlsx` only. Returns in seconds.
* **Export data + images (ZIP)** — the full structure above, streamed as a zip.
  Several hundred MB; the button stays disabled and reads "Building ZIP…" until
  the whole file has arrived. Keep the tab open.

A **Published only** checkbox next to them drops products hidden from the
storefront (they are included by default).

Requires the `products.view` capability. Every export is written to the admin
audit log (`resource_type=product`, `resource_id=catalogue-export`).

### 2. API

```
GET /api/admin/products/export/                  # zip: workbook + images
GET /api/admin/products/export/?images=0         # workbook only
GET /api/admin/products/export/?published_only=1 # skip hidden products
GET /api/admin/products/export/?remote=0         # skip externally hosted images
```

Authorization: `Bearer <admin JWT>`. The response carries `X-Export-Products`
with the row count.

### 3. Management command (recommended for the full media tree)

```bash
python manage.py export_products                       # → backend/exports/enfant-products-export-<date>/
python manage.py export_products --output /srv/exports  # pick the destination
python manage.py export_products --zip                  # also write a .zip beside the folder
python manage.py export_products --zip-only             # keep only the .zip
python manage.py export_products --no-images            # workbook only
python manage.py export_products --no-remote            # skip externally hosted images
python manage.py export_products --published-only
python manage.py export_products --force                # overwrite an existing folder
```

On production:

```bash
ssh enfant-vps
docker exec enfhantorganic-backend-1 \
  python manage.py export_products --output /app/exports --zip-only --force
docker cp enfhantorganic-backend-1:/app/exports/enfant-products-export-<date>.zip .
```

Write to `/app/exports`, **never** `/app/media/...`. The media volume is served
publicly by nginx, and the workbook carries cost prices and unpublished
products — an export dropped in there is downloadable by anyone who guesses the
(entirely predictable) file name.

Export folders are gitignored (`exports/`, `enfant-products-export-*`).

---

## How images are found

Product images are stored in five different shapes across the catalogue, all of
which resolve to the same file on disk:

| Where | Example |
|---|---|
| `ImageField` upload | `products/imported/p16-primary.jpeg` |
| `/media` URL | `/media/products/imported/p16-primary.jpeg` |
| Absolute URL on our own domain | `https://www.enfantorganic.com/media/products/…` |
| Bare storage path | `products/gallery/lotion-a1b2c3d4.jpg` |
| External CDN (leftover Shopify) | `https://cdn.shopify.com/s/files/…` |

A `/media` path that exists on disk is always taken from disk, whatever host the
URL names — the backend knows itself as `enfhantorganic.itwing.cloud` while the
images are stored as `www.enfantorganic.com`, and matching on host used to make
the exporter re-download files it already had.

De-duplication compares **file content**, not the stored reference, because the
admin gallery uploader saves its own copy under a fresh random name — one photo
can sit on disk two or three times under names that share nothing. It is scoped
per product: a photo used by two products lands in both folders, but never twice
inside one. Precedence is main → hover → gallery → variant → certificate.

External URLs are downloaded (25 MB cap, 20 s timeout) unless `--no-remote` /
`?remote=0` is passed. Anything that cannot be fetched is listed in
`images-not-exported.txt` and marked in the Images sheet rather than aborting
the run. Media paths are resolved through a MEDIA_ROOT containment check, so an
admin-entered `../..` cannot pull server files into the export.

---

## Operational notes

* **The zip is streamed, never buffered.** The media tree is several hundred MB;
  assembling it in memory would take a web worker down. Images go into the
  archive one at a time, `products.xlsx` is written last (by then every image
  has a real status to record), and chunks are flushed every 512 KB.
* **Timeouts.** A download that outlives gunicorn's `--timeout` gets cut off
  mid-file, because the arbiter reaps a sync worker that has not returned to its
  accept loop. `docker-compose.prod.yml` therefore defaults
  `GUNICORN_TIMEOUT` to 900 s, and `deploy/nginx/default.conf` sets
  `proxy_read_timeout`/`proxy_send_timeout` to match. Django sends
  `X-Accel-Buffering: no` so nginx relays the zip as it arrives.
* **Cost price and unpublished products are in the workbook.** Treat the file as
  internal — it is not safe to publish as-is.

---

## Code

| File | Role |
|---|---|
| `backend/store/services/product_export.py` | Image resolution, workbook builder, zip streamer, folder writer |
| `backend/store/management/commands/export_products.py` | CLI entry point |
| `backend/store/api_views/admin_ops.py` → `AdminProductExportView` | Admin API endpoint |
| `frontend/components/admin/CrudViews.jsx` → `ProductExportControls` | The two buttons |
| `frontend/components/admin/AdminPanelClient.jsx` → `exportProducts()` | Download handler |
| `backend/store/tests/test_product_catalogue_export.py` | 20 tests covering all three entry points |
