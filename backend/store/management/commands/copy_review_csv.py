import csv
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from store.models import BlogPost, Category, HeroPromoCard, Product, SiteSettings


MODEL_KEY_COL = "model/key"
ENGLISH_COL = "english_text"
CURRENT_AR_COL = "current_arabic_text"
REVIEWER_NOTES_COL = "reviewer_notes"
APPROVED_AR_COL = "approved_arabic"
CSV_HEADERS = [
    MODEL_KEY_COL,
    ENGLISH_COL,
    CURRENT_AR_COL,
    REVIEWER_NOTES_COL,
    APPROVED_AR_COL,
]


@dataclass
class CopySourceEntry:
    key: str
    english_text: str
    current_arabic_text: str
    setter: callable


class Command(BaseCommand):
    help = "Export/import Arabic copy review CSV for catalog, CMS, static pages, and UI translations."

    def add_arguments(self, parser):
        parser.add_argument(
            "action",
            choices=("export", "import"),
            help="Use 'export' to generate CSV and 'import' to apply approved Arabic copy.",
        )
        parser.add_argument(
            "--file",
            default="docs/arabic_copy_review.csv",
            help="CSV path relative to repository root (default: docs/arabic_copy_review.csv).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate and preview changes without writing updates.",
        )

    def handle(self, *args, **options):
        action = options["action"]
        csv_path = self._repo_root() / options["file"]
        dry_run = bool(options["dry_run"])

        if action == "export":
            rows, _, _ = self._build_sources()
            self._export_rows(csv_path, rows)
            self.stdout.write(self.style.SUCCESS(f"Exported {len(rows)} rows to {csv_path}"))
            return

        if not csv_path.exists():
            raise CommandError(f"CSV file not found: {csv_path}")

        rows, source_index, context = self._build_sources()
        _ = rows  # explicit: same source builder used for both export/import
        plan = self._build_import_plan(csv_path, source_index)

        if not plan:
            self.stdout.write(self.style.WARNING("No approved Arabic updates found in CSV."))
            return

        if dry_run:
            self.stdout.write(self.style.WARNING(f"Dry run: {len(plan)} updates validated."))
            for sample in plan[:10]:
                self.stdout.write(f" - {sample['key']}")
            if len(plan) > 10:
                self.stdout.write(f" ... and {len(plan) - 10} more")
            return

        self._apply_plan(plan, context)
        self.stdout.write(self.style.SUCCESS(f"Applied {len(plan)} Arabic copy updates from {csv_path}"))

    def _repo_root(self):
        return Path(__file__).resolve().parents[4]

    def _frontend_static_pages_path(self):
        return self._repo_root() / "frontend" / "app" / "[locale]" / "[pageSlug]" / "page.jsx"

    def _frontend_translations_path(self):
        return self._repo_root() / "frontend" / "lib" / "storefront-core" / "translations.js"

    def _ensure_text(self, value):
        if value is None:
            return ""
        return str(value)

    def _add_entry(self, rows, index, key, english_text, current_arabic_text, setter):
        english = self._ensure_text(english_text)
        arabic = self._ensure_text(current_arabic_text)
        entry = CopySourceEntry(
            key=key,
            english_text=english,
            current_arabic_text=arabic,
            setter=setter,
        )
        rows.append(
            {
                MODEL_KEY_COL: key,
                ENGLISH_COL: english,
                CURRENT_AR_COL: arabic,
                REVIEWER_NOTES_COL: "",
                APPROVED_AR_COL: "",
            }
        )
        index[key] = entry

    def _build_sources(self):
        rows = []
        source_index = {}
        dirty_db_objects = {}

        static_file_path = self._frontend_static_pages_path()
        translations_file_path = self._frontend_translations_path()
        static_content = self._load_js_const_object(static_file_path, "STATIC_CONTENT")
        translations = self._load_js_const_object(translations_file_path, "translations")
        dirty_files = {"static_content": False, "translations": False}

        def mark_db_dirty(obj):
            dirty_db_objects[(obj._meta.label_lower, obj.pk)] = obj

        def add_db_pair(key, obj, en_attr, ar_attr):
            self._add_entry(
                rows,
                source_index,
                key,
                getattr(obj, en_attr, ""),
                getattr(obj, ar_attr, ""),
                setter=lambda new_value, obj=obj, ar_attr=ar_attr: (
                    setattr(obj, ar_attr, new_value),
                    mark_db_dirty(obj),
                ),
            )

        product_field_pairs = [
            ("name", "name_en", "name_ar"),
            ("vendor", "vendor_en", "vendor_ar"),
            ("short_description", "short_description_en", "short_description_ar"),
            ("description", "description_en", "description_ar"),
            ("ingredients", "ingredients_en", "ingredients_ar"),
            ("usage_instructions", "usage_instructions_en", "usage_instructions_ar"),
            ("origin_source", "origin_source_en", "origin_source_ar"),
            ("badge", "badge_en", "badge_ar"),
        ]
        for product in Product.objects.order_by("sort_order", "id"):
            for field_key, en_attr, ar_attr in product_field_pairs:
                add_db_pair(
                    f"Product:{product.slug}:{field_key}",
                    product,
                    en_attr,
                    ar_attr,
                )

        category_field_pairs = [
            ("name", "name_en", "name_ar"),
            ("description", "description_en", "description_ar"),
        ]
        for category in Category.objects.order_by("sort_order", "id"):
            for field_key, en_attr, ar_attr in category_field_pairs:
                add_db_pair(
                    f"Category:{category.slug}:{field_key}",
                    category,
                    en_attr,
                    ar_attr,
                )

        blog_field_pairs = [
            ("title", "title_en", "title_ar"),
            ("excerpt", "excerpt_en", "excerpt_ar"),
            ("body", "body_en", "body_ar"),
        ]
        for post in BlogPost.objects.order_by("sort_order", "id"):
            for field_key, en_attr, ar_attr in blog_field_pairs:
                add_db_pair(
                    f"BlogPost:{post.slug}:{field_key}",
                    post,
                    en_attr,
                    ar_attr,
                )

        settings = SiteSettings.objects.order_by("id").first()
        if settings:
            settings_field_pairs = [
                "announcement",
                "footer_about",
                "newsletter_title",
                "newsletter_subtitle",
                "instagram_title",
                "instagram_cta",
                "blog_title",
                "free_gift_title",
                "free_gift_subtitle",
            ]
            for field_name in settings_field_pairs:
                add_db_pair(
                    f"SiteSettings:singleton:{field_name}",
                    settings,
                    f"{field_name}_en",
                    f"{field_name}_ar",
                )

            for links_field in ("why_choose_links", "policy_links", "static_links"):
                items = list(getattr(settings, links_field, []) or [])
                for idx, item in enumerate(items):
                    english = item.get("label_en") or item.get("label") or ""
                    arabic = item.get("label_ar") or ""
                    row_key = f"SiteSettings:singleton:{links_field}[{idx}].label"

                    def set_link_label(new_value, settings=settings, links_field=links_field, idx=idx):
                        link_items = list(getattr(settings, links_field, []) or [])
                        while len(link_items) <= idx:
                            link_items.append({})
                        next_item = dict(link_items[idx] or {})
                        next_item["label_ar"] = new_value
                        link_items[idx] = next_item
                        setattr(settings, links_field, link_items)
                        mark_db_dirty(settings)

                    self._add_entry(
                        rows,
                        source_index,
                        row_key,
                        english,
                        arabic,
                        setter=set_link_label,
                    )

        hero_field_pairs = [
            ("title", "title_en", "title_ar"),
            ("subtitle", "subtitle_en", "subtitle_ar"),
            ("cta", "cta_en", "cta_ar"),
        ]
        for card in HeroPromoCard.objects.order_by("sort_order", "id"):
            for field_key, en_attr, ar_attr in hero_field_pairs:
                add_db_pair(
                    f"HeroPromoCard:{card.id}:{field_key}",
                    card,
                    en_attr,
                    ar_attr,
                )

        # Frontend static pages (STATIC_CONTENT object).
        for page_slug, localized in (static_content or {}).items():
            if not isinstance(localized, dict):
                continue
            en_content = localized.get("en") or {}
            ar_content = localized.get("ar") or {}
            if not isinstance(en_content, dict) or not isinstance(ar_content, dict):
                continue

            def set_page_title(new_value, ar_content=ar_content):
                ar_content["title"] = new_value
                dirty_files["static_content"] = True

            self._add_entry(
                rows,
                source_index,
                f"StaticPage:{page_slug}:title",
                en_content.get("title", ""),
                ar_content.get("title", ""),
                setter=set_page_title,
            )

            en_sections = list(en_content.get("sections") or [])
            ar_sections = list(ar_content.get("sections") or [])
            while len(ar_sections) < len(en_sections):
                ar_sections.append({})
            if ar_sections != list(ar_content.get("sections") or []):
                ar_content["sections"] = ar_sections

            for idx, en_section in enumerate(en_sections):
                if not isinstance(en_section, dict):
                    continue
                ar_section = ar_sections[idx] if isinstance(ar_sections[idx], dict) else {}
                if ar_sections[idx] is not ar_section:
                    ar_sections[idx] = ar_section

                def set_section_heading(new_value, ar_section=ar_section):
                    ar_section["heading"] = new_value
                    dirty_files["static_content"] = True

                self._add_entry(
                    rows,
                    source_index,
                    f"StaticPage:{page_slug}:sections[{idx}].heading",
                    en_section.get("heading", ""),
                    ar_section.get("heading", ""),
                    setter=set_section_heading,
                )

                def set_section_body(new_value, ar_section=ar_section):
                    ar_section["body"] = new_value
                    dirty_files["static_content"] = True

                self._add_entry(
                    rows,
                    source_index,
                    f"StaticPage:{page_slug}:sections[{idx}].body",
                    en_section.get("body", ""),
                    ar_section.get("body", ""),
                    setter=set_section_body,
                )

        # Frontend UI translation file.
        ui_en = (translations or {}).get("en") or {}
        ui_ar = (translations or {}).get("ar") or {}
        if isinstance(ui_en, dict) and isinstance(ui_ar, dict):
            for key, english_text in ui_en.items():
                row_key = f"UiTranslation:{key}"

                def set_ui_translation(new_value, ui_ar=ui_ar, key=key):
                    ui_ar[key] = new_value
                    dirty_files["translations"] = True

                self._add_entry(
                    rows,
                    source_index,
                    row_key,
                    english_text,
                    ui_ar.get(key, ""),
                    setter=set_ui_translation,
                )

        context = {
            "dirty_db_objects": dirty_db_objects,
            "dirty_files": dirty_files,
            "static_content": static_content,
            "translations": translations,
            "static_file_path": static_file_path,
            "translations_file_path": translations_file_path,
        }
        return rows, source_index, context

    def _export_rows(self, csv_path, rows):
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        with csv_path.open("w", encoding="utf-8", newline="") as csv_file:
            writer = csv.DictWriter(csv_file, fieldnames=CSV_HEADERS)
            writer.writeheader()
            writer.writerows(rows)

    def _build_import_plan(self, csv_path, source_index):
        plan = []
        errors = []
        seen_keys = set()

        with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
            reader = csv.DictReader(csv_file)
            headers = reader.fieldnames or []
            missing_headers = [header for header in CSV_HEADERS if header not in headers]
            if missing_headers:
                raise CommandError(
                    f"Missing required CSV column(s): {', '.join(missing_headers)}"
                )

            for line_no, row in enumerate(reader, start=2):
                key = self._ensure_text(row.get(MODEL_KEY_COL)).strip()
                approved_text = self._ensure_text(row.get(APPROVED_AR_COL))
                if not approved_text:
                    continue

                if not key:
                    errors.append(f"line {line_no}: missing {MODEL_KEY_COL}")
                    continue

                if key in seen_keys:
                    errors.append(f"line {line_no}: duplicate key '{key}'")
                    continue
                seen_keys.add(key)

                entry = source_index.get(key)
                if not entry:
                    errors.append(f"line {line_no}: unknown key '{key}'")
                    continue

                csv_english = self._ensure_text(row.get(ENGLISH_COL))
                csv_current_ar = self._ensure_text(row.get(CURRENT_AR_COL))
                if csv_english != entry.english_text:
                    errors.append(
                        f"line {line_no}: stale English text for '{key}' (CSV does not match current source)"
                    )
                    continue
                if csv_current_ar != entry.current_arabic_text:
                    errors.append(
                        f"line {line_no}: stale Arabic text for '{key}' (CSV does not match current source)"
                    )
                    continue

                if approved_text == entry.current_arabic_text:
                    continue

                plan.append(
                    {
                        "line_no": line_no,
                        "key": key,
                        "entry": entry,
                        "approved_text": approved_text,
                    }
                )

        if errors:
            sample = "\n".join(f" - {item}" for item in errors[:20])
            suffix = ""
            if len(errors) > 20:
                suffix = f"\n - ... and {len(errors) - 20} more error(s)"
            raise CommandError(f"Import validation failed:\n{sample}{suffix}")

        return plan

    def _apply_plan(self, plan, context):
        for item in plan:
            entry = item["entry"]
            entry.setter(item["approved_text"])

        dirty_db_objects = context["dirty_db_objects"]
        if dirty_db_objects:
            with transaction.atomic():
                for obj in dirty_db_objects.values():
                    obj.save()

        dirty_files = context["dirty_files"]
        if dirty_files.get("static_content"):
            self._write_js_const_object(
                context["static_file_path"],
                "STATIC_CONTENT",
                context["static_content"],
            )

        if dirty_files.get("translations"):
            self._write_js_const_object(
                context["translations_file_path"],
                "translations",
                context["translations"],
            )

    def _load_js_const_object(self, file_path, const_name):
        if not file_path.exists():
            raise CommandError(f"Required source file not found: {file_path}")
        source_text = file_path.read_text(encoding="utf-8")
        start, end = self._extract_const_object_span(source_text, const_name)
        object_literal = source_text[start:end]
        return self._eval_js_object_literal(object_literal)

    def _write_js_const_object(self, file_path, const_name, data):
        source_text = file_path.read_text(encoding="utf-8")
        start, end = self._extract_const_object_span(source_text, const_name)
        serialized = json.dumps(data, ensure_ascii=False, indent=2)
        updated = source_text[:start] + serialized + source_text[end:]
        if updated != source_text:
            file_path.write_text(updated, encoding="utf-8")

    def _extract_const_object_span(self, source_text, const_name):
        marker = f"const {const_name} ="
        marker_index = source_text.find(marker)
        if marker_index < 0:
            raise CommandError(f"Could not find const '{const_name}' in source file.")

        equal_index = source_text.find("=", marker_index)
        if equal_index < 0:
            raise CommandError(f"Malformed const declaration for '{const_name}'.")

        brace_start = source_text.find("{", equal_index)
        if brace_start < 0:
            raise CommandError(f"Could not locate object start for '{const_name}'.")

        depth = 0
        in_string = None
        escaped = False
        for idx in range(brace_start, len(source_text)):
            ch = source_text[idx]
            if in_string:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == in_string:
                    in_string = None
                continue

            if ch in ("'", '"', "`"):
                in_string = ch
                continue

            if ch == "{":
                depth += 1
                continue

            if ch == "}":
                depth -= 1
                if depth == 0:
                    return brace_start, idx + 1

        raise CommandError(f"Could not locate object end for '{const_name}'.")

    def _eval_js_object_literal(self, object_literal):
        node_script = """
const fs = require("fs");
const src = fs.readFileSync(0, "utf8");
let value;
try {
  value = Function('"use strict"; return (' + src + ');')();
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}
process.stdout.write(JSON.stringify(value));
""".strip()
        try:
            result = subprocess.run(
                ["node", "-e", node_script],
                input=object_literal,
                capture_output=True,
                text=True,
                check=False,
            )
        except FileNotFoundError as exc:
            raise CommandError(
                "Node.js is required to parse frontend copy sources, but 'node' was not found in PATH."
            ) from exc

        if result.returncode != 0:
            error_message = (result.stderr or result.stdout or "").strip()
            raise CommandError(f"Failed parsing JavaScript object literal: {error_message}")

        try:
            return json.loads(result.stdout or "{}")
        except json.JSONDecodeError as exc:
            raise CommandError("Could not decode parsed JavaScript object output.") from exc
