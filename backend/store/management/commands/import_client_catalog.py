import csv
import os
import re
from collections import defaultdict
from html import unescape
from pathlib import Path
from difflib import SequenceMatcher

from django.conf import settings
from django.core.files import File
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from store.models import Category, Product, ProductPrice, Region, Tag

# Mirrors the DB column width — update here whenever the model changes.
_PRODUCT_SLUG_MAX_LENGTH = 100


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".avif"}
SECONDARY_IMAGE_HINTS = (
    "comparison",
    "feature",
    "free-of-harsh",
    "ingredient",
    "how-to",
    "trust",
    "guarantee",
)
DEFAULT_VENDOR_AR = "إنفانت أورجانيكس"
DEFAULT_BRAND = "Enfant"

# Some client folders are ambiguous or mislabeled, so we pin those explicitly.
IMAGE_DIR_OVERRIDES = {
    "1.ENFANT ORGANIC PLUS SHAMPOO&BODY WASH/New Listing Images": "enfant-organic-plus-shampoo-body-wash-300-ml",
    "12.ENFANT ORGANIC BYE BYE MOZZIE PATCH/Listing Images New": "enfant-organic-bye-bye-mosquito-patch-for-baby",
    "13.ENFANT ORGANIC BYE BYE MOZZIE LOTION/Listing Images (bye bye insect repellent lotion)": "enfant-organic-bye-bye-insect-repellent-lotion",
    "15.ENFANT ORGANIC PLUS GENTLE BABY TOOTHPASTE GEL (6 Months+)/Listing Image (First Toothpaste for kids (6M+)": "enfant-organic-plus-gentle-first-toothpaste-for-kids-6m",
    "16.ENFNAT ORGANIC PLUS GENTLE FIRST TOOTHPASTE GEL (1 year+)/Listing Images New": "enfant-organic-plus-gentle-baby-toothpaste-gel-1-year",
    "18.ENFANT ORGANIC PLUS MOISTURE BODY WASH 500 ML/Listing Images (Moisturizing body wash 500ml)": "enfant-organic-plus-moisturizing-body-wash-500ml",
    "19.ENFANT ULTRA CARE ORGANIC PLUS SHAMPOO&BODY WASH 500 ML/Listing Images New": "enfant-ultra-care-organic-plus-shampoo-body-wash-uae-oman",
    "20.Enfant Cotton Bud Round/Listing Images (COTTON BUD BOX GROUND & SPIRAL)": "enfant-cotton-bud-box-ground-spiral",
    "21.Enfant Gauze Baby Oral Cleaner/Listing Images New": "enfant-guaze-baby-teeth-cleaner",
    "31. ENFANT NATURAL MOZZIE GUARD LOTION (6 MONTHS +)/Listing Images (Mozzie Guard Spray)": "enfant-natural-mozzie-guard-lotion-6-months",
    "34. ENFANT BABY FABRIC WASH WITH SOFTNER/Listing Images (Sweet Dreams Natural Baby Powder)": "enfant-baby-fabric-wash-with-softener",
    "35. Sweet Dreams Baby Set/Listing Images (Sweet Dreams Natural Baby Powder)": "best-newborn-gift-set-uae-relaxing-night-routine",
    "36. Start in Life Set/Listing Images (Start in Life Set)": "enfant-ultimate-newborn-essential-kit-uae-and-oman",
    "6.ENFANT ORGANIC PLUS MOISTURE BODY WASH/Listing Images (Moisture premium body wash 300 ML)": "enfant-organic-plus-moisture-premium-body-wash-300-ml",
    "8.ENFANT ORGANIC PLUS MOISTURE CONDITIONER/New Listing": "enfant-organic-plus-moisture-conditioner-for-kids",
}


def _norm_for_match(value):
    normalized = str(value or "").lower().replace("&", " and ").replace("+", " plus ")
    normalized = re.sub(r"\([^)]*\)", " ", normalized)
    normalized = re.sub(r"^[0-9]+\.\s*", " ", normalized)
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    tokens = [token for token in normalized.split() if token]
    stop_words = {"enfant", "organic", "plus", "for", "and", "the", "listing", "images", "image", "new"}
    tokens = [token for token in tokens if token not in stop_words]
    return " ".join(tokens), set(tokens)


def _match_score(candidate_label, handle, title):
    candidate_text, candidate_tokens = _norm_for_match(candidate_label)
    handle_text, handle_tokens = _norm_for_match(handle.replace("-", " "))
    title_text, title_tokens = _norm_for_match(title)
    merged_tokens = handle_tokens | title_tokens
    jaccard = len(candidate_tokens & merged_tokens) / max(1, len(candidate_tokens | merged_tokens))
    ratio = max(
        SequenceMatcher(None, candidate_text, handle_text).ratio(),
        SequenceMatcher(None, candidate_text, title_text).ratio(),
    )
    return (jaccard * 0.7) + (ratio * 0.3)


def _html_to_text(value):
    text = str(value or "")
    if not text:
        return ""
    replacements = (
        ("</p>", "\n\n"),
        ("</li>", "\n"),
        ("<br>", "\n"),
        ("<br/>", "\n"),
        ("<br />", "\n"),
    )
    for source, target in replacements:
        text = text.replace(source, target)
    text = re.sub(r"<[^>]+>", "", text)
    text = unescape(text)
    text = text.replace("\xa0", " ")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def _first_sentence(text, limit=180):
    clean = str(text or "").strip()
    if not clean:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", clean)
    sentence = parts[0].strip()
    if len(sentence) <= limit:
        return sentence
    shortened = sentence[: limit - 1].rsplit(" ", 1)[0].strip()
    return f"{shortened}…" if shortened else sentence[:limit]


def _clean_display_name(value):
    cleaned = str(value or "").strip()
    cleaned = re.sub(r"^[0-9]+\.\s*", "", cleaned)
    cleaned = cleaned.replace("ENFNAT", "ENFANT")
    cleaned = re.sub(r"\s+", " ", cleaned)
    if not cleaned:
        return ""
    if not cleaned.upper().startswith("ENFANT"):
        cleaned = f"ENFANT {cleaned}"
    return cleaned.strip()


def _name_from_image_dir(relative_dir):
    parts = Path(relative_dir).parts
    if not parts:
        return ""
    source = parts[-1] if parts[0].lower() == "baby sets" else parts[0]
    cleaned = _clean_display_name(source)
    if "listing image" in cleaned.lower() or "new listing" in cleaned.lower():
        return ""
    return cleaned


def _clean_title(title):
    clean = str(title or "").strip()
    clean = clean.split("|", 1)[0].strip()
    clean = re.sub(r"\s+\((?:UAE|OMAN|UAE & OMAN|6 Months\+|1 year\+|2 Years \+|2 Years\+)[^)]*\)$", "", clean, flags=re.I)
    parts = re.split(r"\s[–-]\s", clean, maxsplit=1)
    if len(parts) == 2 and len(parts[0]) >= 18:
        clean = parts[0].strip()
    return clean


def _extract_size_value(row, display_name):
    option_name = str(row.get("Option1 Name") or "").strip()
    option_value = str(row.get("Option1 Value") or "").strip()
    if option_value and option_value.lower() != "default title":
        normalized_name = option_name.lower()
        if "pack" in normalized_name:
            return "Pack", option_value
        if "variant" in normalized_name or "varient" in normalized_name:
            return "Variant", option_value
        if "size" in normalized_name:
            return "Size", option_value
        return option_name or "Variant", option_value

    match = re.search(r"(\d+(?:\.\d+)?)\s*(ml|mL|ML|g|G|gram|grams|pcs|sheets?)\b", display_name, flags=re.I)
    if match:
        number = match.group(1)
        unit = match.group(2).lower()
        unit_map = {
            "ml": "ml",
            "g": "g",
            "gram": "gram",
            "grams": "grams",
            "pcs": "pcs",
            "sheet": "sheet",
            "sheets": "sheets",
        }
        return "Size", f"{number} {unit_map.get(unit, unit)}"

    lower_name = display_name.lower()
    if any(keyword in lower_name for keyword in ("set", "kit", "bundle", "pack")):
        return "Set", "Standard Set"
    return "", ""


def _build_details(row, category_name):
    details = []
    mapping = [
        ("Product certifications & standards (product.metafields.shopify.product-certifications-standards)", ""),
        ("Skin care features (product.metafields.shopify.skin-care-features)", ""),
        ("Suitable for skin type (product.metafields.shopify.suitable-for-skin-type)", "Suitable for"),
        ("Suitable for hair type (product.metafields.shopify.suitable-for-hair-type)", "Suitable for"),
        ("Product form (product.metafields.shopify.product-form)", "Format"),
        ("Fragrance (product.metafields.shopify.fragrance)", "Fragrance"),
        ("Flavor (product.metafields.shopify.flavor)", "Flavor"),
        ("Bug type (product.metafields.shopify.bug-type)", "Bug care"),
        ("Body area (product.metafields.shopify.body-area)", "Body area"),
        ("Texture (product.metafields.shopify.texture)", "Texture"),
        ("Skin care effect (product.metafields.shopify.skin-care-effect)", "Skin care effect"),
    ]
    if category_name:
        details.append(category_name)
    for key, label in mapping:
        value = str(row.get(key) or "").strip()
        if not value:
            continue
        cleaned = value.replace(";", ", ")
        details.append(f"{label}: {cleaned}" if label else cleaned)
        if len(details) >= 6:
            break
    return details[:6]


def _build_badge(display_name):
    lowered = display_name.lower()
    if any(keyword in lowered for keyword in ("set", "kit", "bundle", "pack")):
        return "Set"
    if any(keyword in lowered for keyword in ("mozzie", "mosquito", "insect", "patch")):
        return "Outdoor"
    return "Organic"


def _should_use_baby_sets(display_name, category_path):
    text = f"{display_name} {category_path}".lower()
    return any(keyword in text for keyword in ("set", "kit", "bundle", "gift"))


def _image_sort_key(path):
    name = path.name.lower()
    is_secondary = any(hint in name for hint in SECONDARY_IMAGE_HINTS)
    is_lifestyle = "lifestyle" in name
    is_primary = bool(re.match(r"^(img[\s\-_]?\d+|\d+|artboard[\s\-_]?\d+|baby[\s\-_]set|the[\s\-_]complete|lavender|essential|baby[\s\-_]basics)", path.stem.lower()))
    return (
        1 if is_secondary else 0,
        0 if is_primary else 1,
        1 if is_lifestyle else 0,
        name,
    )


def _is_secondary_path(path):
    return any(hint in path.name.lower() for hint in SECONDARY_IMAGE_HINTS)


class Command(BaseCommand):
    help = "Import client product catalog, local product images, and safe review metadata from the supplied export files."

    def add_arguments(self, parser):
        parser.add_argument(
            "--products-csv",
            default=str(Path(settings.BASE_DIR).parent / "products_export_1.csv"),
            help="Path to the Shopify-style products CSV.",
        )
        parser.add_argument(
            "--reviews-csv",
            default=str(Path(settings.BASE_DIR).parent / "1780211258-F2Au0-reviewer-data-export.csv"),
            help="Path to the reviewer export CSV.",
        )
        parser.add_argument(
            "--images-dir",
            default=str(Path(settings.BASE_DIR).parent / "Images"),
            help="Directory containing the client-provided product image folders.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview the import without writing changes.",
        )

    def handle(self, *args, **options):
        products_csv = Path(options["products_csv"]).resolve()
        reviews_csv = Path(options["reviews_csv"]).resolve()
        images_dir = Path(options["images_dir"]).resolve()
        dry_run = bool(options["dry_run"])

        if not products_csv.exists():
            raise CommandError(f"Products CSV not found: {products_csv}")
        if not images_dir.exists():
            raise CommandError(f"Images directory not found: {images_dir}")

        self.images_dir = images_dir
        grouped_rows = self._load_products(products_csv)
        candidate_dirs = self._scan_image_dirs(images_dir)
        image_dir_map = self._match_image_dirs(grouped_rows, candidate_dirs)
        review_export_summary = self._inspect_review_export(reviews_csv)

        if dry_run:
            self._print_preview(grouped_rows, image_dir_map, review_export_summary)
            return

        with transaction.atomic():
            self._sync_catalog(grouped_rows, image_dir_map)

        self.stdout.write(
            self.style.SUCCESS(
                f"Imported {len(grouped_rows)} products. Matched local image folders for {len(image_dir_map)} products."
            )
        )
        if review_export_summary["supports_reviews"]:
            self.stdout.write(self.style.SUCCESS("Review export contains importable review data."))
        else:
            self.stdout.write(
                self.style.WARNING(
                    "Reviewer export only contains names/emails, so no real customer review records were imported."
                )
            )

    def _load_products(self, products_csv):
        grouped = defaultdict(list)
        with open(products_csv, newline="", encoding="utf-8-sig") as handle:
            for row in csv.DictReader(handle):
                product_handle = str(row.get("Handle") or "").strip()
                if not product_handle:
                    continue
                grouped[product_handle].append(row)
        return dict(grouped)

    def _inspect_review_export(self, reviews_csv):
        if not reviews_csv.exists():
            return {"exists": False, "supports_reviews": False, "columns": [], "row_count": 0}
        with open(reviews_csv, newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            rows = list(reader)
        columns = list(rows[0].keys()) if rows else list(reader.fieldnames or [])
        required = {"product", "rating", "comment"}
        normalized = {slugify(column).replace("-", "_") for column in columns}
        return {
            "exists": True,
            "supports_reviews": required.issubset(normalized),
            "columns": columns,
            "row_count": len(rows),
        }

    def _scan_image_dirs(self, images_dir):
        candidates = {}
        for root, _dirs, files in os.walk(images_dir):
            image_files = [
                Path(root) / file_name
                for file_name in files
                if Path(file_name).suffix.lower() in IMAGE_EXTENSIONS
            ]
            if not image_files:
                continue
            relative = Path(root).relative_to(images_dir).as_posix()
            candidates[relative] = sorted(image_files, key=_image_sort_key)
        return candidates

    def _match_image_dirs(self, grouped_rows, candidate_dirs):
        matches = {}
        used_dirs = set()

        for relative_dir, handle in IMAGE_DIR_OVERRIDES.items():
            if relative_dir in candidate_dirs and handle in grouped_rows:
                matches[handle] = relative_dir
                used_dirs.add(relative_dir)

        for handle, rows in grouped_rows.items():
            if handle in matches:
                continue
            title = rows[0].get("Title") or handle
            scored = []
            for relative_dir in candidate_dirs:
                if relative_dir in used_dirs:
                    continue
                score = _match_score(relative_dir, handle, title)
                scored.append((score, relative_dir))
            if not scored:
                continue
            scored.sort(reverse=True)
            top_score, top_dir = scored[0]
            second_score = scored[1][0] if len(scored) > 1 else 0
            if top_score < 0.45:
                continue
            if top_score - second_score < 0.06 and top_dir not in IMAGE_DIR_OVERRIDES:
                continue
            matches[handle] = top_dir
            used_dirs.add(top_dir)
        return matches

    def _print_preview(self, grouped_rows, image_dir_map, review_export_summary):
        self.stdout.write(f"Products discovered: {len(grouped_rows)}")
        self.stdout.write(f"Local image matches: {len(image_dir_map)}")
        self.stdout.write(
            f"Review export: rows={review_export_summary['row_count']} columns={review_export_summary['columns']}"
        )
        sample_handles = list(grouped_rows)[:8]
        for handle in sample_handles:
            self.stdout.write(f"- {handle} -> {image_dir_map.get(handle, 'REMOTE_FALLBACK')}")

    def _sync_catalog(self, grouped_rows, image_dir_map):
        regions = list(Region.objects.order_by("sort_order", "id"))
        if not regions:
            raise CommandError("No regions found in the database. Seed regions before importing the catalog.")

        # Pre-flight: fail fast with a clear message rather than a raw DB error.
        oversized = [
            (handle, len(handle))
            for handle in grouped_rows
            if len(handle) > _PRODUCT_SLUG_MAX_LENGTH
        ]
        if oversized:
            lines = "\n".join(f"  [{length}] {handle}" for handle, length in sorted(oversized, key=lambda x: -x[1]))
            raise CommandError(
                f"Import aborted: {len(oversized)} product handle(s) exceed the "
                f"slug column limit of {_PRODUCT_SLUG_MAX_LENGTH} characters. "
                f"Either widen Product.slug (max_length) or shorten the handles "
                f"in the CSV before re-running.\n{lines}"
            )

        imported_handles = set(grouped_rows)
        category_cache = {}
        tag_cache = {}

        for sort_index, (handle, rows) in enumerate(grouped_rows.items(), start=1):
            first_row = rows[0]
            image_dir = image_dir_map.get(handle)
            display_name = _name_from_image_dir(image_dir) if image_dir else ""
            display_name = display_name or _clean_display_name(_clean_title(first_row.get("Title") or handle))
            category_path = str(first_row.get("Product Category") or "").strip()
            category_name = category_path.split(">")[-1].strip() if category_path else "Products"
            category_slug = slugify(category_name) or slugify(category_path) or "products"

            category = category_cache.get(category_slug)
            if not category:
                category, _ = Category.objects.update_or_create(
                    slug=category_slug,
                    defaults={
                        "name_en": category_name,
                        "name_ar": "",
                        "description_en": category_path,
                        "description_ar": "",
                        "image": self._first_remote_image(rows),
                    },
                )
                category_cache[category_slug] = category

            body_text = _html_to_text(first_row.get("Body (HTML)"))
            short_description = _first_sentence(body_text)
            details = _build_details(first_row, category_name)
            option_name, option_value = _extract_size_value(first_row, display_name)
            option_groups = [{"name": option_name, "values": [option_value]}] if option_name and option_value else []

            raw_vendor = str(first_row.get("Vendor") or "Enfant Organics").strip() or "Enfant Organics"
            product_defaults = {
                "name_en": self._safe_str(display_name, 255, handle, "name_en"),
                "name_ar": "",
                "brand": DEFAULT_BRAND,
                "unit": self._safe_str(option_value, 80, handle, "unit"),
                "vendor_en": self._safe_str(raw_vendor, 120, handle, "vendor_en"),
                "vendor_ar": DEFAULT_VENDOR_AR,
                "short_description_en": short_description,
                "short_description_ar": "",
                "description_en": body_text,
                "description_ar": "",
                "ingredients_en": str(
                    first_row.get("Ingredients (product.metafields.shopify.ingredients)")
                    or first_row.get("Detailed ingredients (product.metafields.shopify.detailed-ingredients)")
                    or ""
                ).strip(),
                "ingredients_ar": "",
                "usage_instructions_en": "",
                "usage_instructions_ar": "",
                "origin_source_en": self._safe_str(
                    str(first_row.get("Ingredient origin (product.metafields.shopify.ingredient-origin)") or "").strip(),
                    255, handle, "origin_source_en",
                ),
                "origin_source_ar": "",
                "dietary_tags": [],
                "shelf_life": "",
                "details_en": details,
                "details_ar": [],
                "badge_en": self._safe_str(_build_badge(display_name), 60, handle, "badge_en"),
                "badge_ar": "",
                "review_count": self._import_review_count(handle, first_row),
                "rating": "5.0",
                "option_groups_en": option_groups,
                "option_groups_ar": [],
                "show_in_new_arrivals": True,
                "show_in_baby_sets": _should_use_baby_sets(display_name, category_path),
                "show_in_top_choices": sort_index <= 8,
                "is_featured": sort_index <= 8,
                "is_published": str(first_row.get("Published") or "").strip().lower() == "true"
                and str(first_row.get("Status") or "").strip().lower() == "active",
                "stock_quantity": self._safe_int(first_row.get("Variant Inventory Qty"), default=0),
                "track_inventory": False,
                "category": category,
                "sort_order": sort_index,
            }

            product, _created = Product.objects.update_or_create(slug=handle, defaults=product_defaults)
            self._sync_tags(product, first_row, tag_cache)
            self._sync_prices(product, first_row, regions)
            self._sync_media(product, rows, image_dir)

        self._remove_obsolete_products(imported_handles)
        Category.objects.filter(products__isnull=True).delete()
        Tag.objects.filter(products__isnull=True).delete()

    def _import_review_count(self, handle, first_row):
        value = self._safe_int(first_row.get("Product rating count (product.metafields.reviews.rating_count)"), default=None)
        if value is not None:
            return value
        existing = Product.objects.filter(slug=handle).only("review_count").first()
        return int(existing.review_count or 0) if existing else 0

    def _first_remote_image(self, rows):
        ordered = self._ordered_remote_images(rows)
        return ordered[0] if ordered else ""

    def _ordered_remote_images(self, rows):
        ordered = []
        for row in rows:
            url = str(row.get("Image Src") or "").strip()
            if not url:
                continue
            position = self._safe_int(row.get("Image Position"), default=9999)
            ordered.append((position, url))
        seen = set()
        result = []
        for _position, url in sorted(ordered, key=lambda item: (item[0], item[1])):
            if url in seen:
                continue
            seen.add(url)
            result.append(url)
        return result

    def _sync_tags(self, product, first_row, tag_cache):
        tags_value = str(first_row.get("Tags") or "").strip()
        if not tags_value:
            product.tags.clear()
            return
        tags = []
        for raw_tag in [item.strip() for item in tags_value.split(",") if item.strip()]:
            slug = slugify(raw_tag)
            if not slug:
                continue
            tag = tag_cache.get(slug)
            if not tag:
                tag, _ = Tag.objects.update_or_create(
                    slug=slug,
                    defaults={"name_en": raw_tag, "name_ar": raw_tag},
                )
                tag_cache[slug] = tag
            tags.append(tag)
        product.tags.set(tags)

    def _sync_prices(self, product, first_row, regions):
        price = first_row.get("Variant Price")
        compare_at = first_row.get("Variant Compare At Price")
        for region in regions:
            ProductPrice.objects.update_or_create(
                product=product,
                region=region,
                defaults={
                    "price": price or "0.00",
                    "compare_at_price": compare_at or None,
                    "price_prefix_en": "",
                    "price_prefix_ar": "",
                    "unit_price_text_en": "",
                    "unit_price_text_ar": "",
                },
            )

    def _sync_media(self, product, rows, image_dir):
        self._cleanup_product_media(product)

        if image_dir:
            local_images = self._scan_local_images(image_dir)
            if local_images:
                gallery_urls = self._save_local_product_images(product, local_images)
                product.image = ""
                product.hover_image = ""
                product.gallery = gallery_urls
                product.save(update_fields=["image", "image_file", "hover_image", "hover_image_file", "gallery"])
                return

        remote_images = self._ordered_remote_images(rows)
        product.image = remote_images[0] if remote_images else ""
        product.hover_image = remote_images[1] if len(remote_images) > 1 else product.image
        product.gallery = remote_images
        product.save(update_fields=["image", "image_file", "hover_image", "hover_image_file", "gallery"])

    def _scan_local_images(self, image_dir):
        root = self.images_dir / image_dir
        if not root.exists():
            return []
        return sorted(
            [path for path in root.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS],
            key=_image_sort_key,
        )

    def _save_local_product_images(self, product, local_images):
        gallery_urls = []
        source_to_url = {}
        file_stub = f"p{product.pk}"

        primary = local_images[0]
        primary_name = f"imported/{file_stub}-primary{primary.suffix.lower()}"
        self._replace_storage_path(primary_name)
        with open(primary, "rb") as handle:
            product.image_file.save(primary_name, File(handle), save=False)
        source_to_url[str(primary)] = f"{settings.MEDIA_URL}{product.image_file.name}".replace("//", "/")

        hover_candidate = next((path for path in local_images[1:] if not _is_secondary_path(path)), None)
        if hover_candidate:
            hover_name = f"imported/{file_stub}-hover{hover_candidate.suffix.lower()}"
            self._replace_storage_path(hover_name)
            with open(hover_candidate, "rb") as handle:
                product.hover_image_file.save(hover_name, File(handle), save=False)
            source_to_url[str(hover_candidate)] = f"{settings.MEDIA_URL}{product.hover_image_file.name}".replace("//", "/")

        for index, source in enumerate(local_images, start=1):
            cached = source_to_url.get(str(source))
            if cached:
                gallery_urls.append(cached)
                continue
            file_name = f"products/imported/{file_stub}-gallery-{index:02d}{source.suffix.lower()}"
            self._replace_storage_path(file_name)
            with open(source, "rb") as handle:
                saved_name = default_storage.save(file_name, File(handle))
            gallery_urls.append(f"{settings.MEDIA_URL}{saved_name}".replace("//", "/"))
        return gallery_urls

    def _cleanup_product_media(self, product):
        if product.image_file:
            product.image_file.delete(save=False)
        if product.hover_image_file:
            product.hover_image_file.delete(save=False)
        for entry in product.gallery or []:
            value = str(entry or "").strip()
            if not value or not value.startswith(settings.MEDIA_URL):
                continue
            storage_name = value[len(settings.MEDIA_URL):].lstrip("/")
            if default_storage.exists(storage_name):
                default_storage.delete(storage_name)
        product.image = ""
        product.hover_image = ""
        product.gallery = []

    def _replace_storage_path(self, storage_name):
        candidates = {storage_name}
        if not storage_name.startswith("products/"):
            candidates.add(f"products/{storage_name}")
            candidates.add(f"products/hover/{storage_name}")
        for candidate in candidates:
            if default_storage.exists(candidate):
                default_storage.delete(candidate)

    def _remove_obsolete_products(self, imported_handles):
        obsolete = Product.objects.exclude(slug__in=imported_handles)
        for product in obsolete:
            self._cleanup_product_media(product)
            product.delete()

    def _safe_str(self, value, max_length, handle, field_name):
        """Return value truncated to max_length, logging a warning when truncation occurs.

        Only use for fields where losing trailing text is acceptable (display
        names, vendor names, etc.). Never use for slug or other unique keys.
        """
        text = str(value or "")
        if len(text) <= max_length:
            return text
        truncated = text[:max_length]
        self.stderr.write(
            self.style.WARNING(
                f"[{handle}] Field '{field_name}' truncated from {len(text)} to "
                f"{max_length} chars: {text[:60]!r}…"
            )
        )
        return truncated

    @staticmethod
    def _safe_int(value, default=0):
        raw = str(value or "").strip()
        if not raw:
            return default
        try:
            return max(int(float(raw)), 0)
        except (TypeError, ValueError):
            return default
