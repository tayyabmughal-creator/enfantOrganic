"""Import a Shopify ``customers_export.csv`` into the existing data models.

Only rows that have an email are imported (rows without an email are skipped on
purpose). Each email becomes a passwordless Django ``User`` (login via password
reset). The Shopify "Default Address" becomes a ``CustomerAddress`` and an
``Accepts Email Marketing == yes`` row becomes a ``NewsletterSubscription``.

CRM-only Shopify columns that have no home in the current schema (Customer ID,
Total Spent/Orders, Tags, Note, Tax Exempt, SMS/WhatsApp marketing, Company,
Province) are intentionally skipped.

Idempotent — safe to re-run: users are keyed by email, an address is only added
when the user has none, and newsletter rows use get_or_create.

Usage:
    python manage.py import_shopify_customers /path/to/customers_export.csv [--dry-run]
"""
import csv
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from store.models import CustomerAddress, NewsletterSubscription

User = get_user_model()

# Shopify country codes -> human-readable country stored on CustomerAddress.
COUNTRY_NAMES = {
    "OM": "Oman",
    "AE": "United Arab Emirates",
    "SA": "Saudi Arabia",
    "BH": "Bahrain",
    "KW": "Kuwait",
    "QA": "Qatar",
    "PK": "Pakistan",
    "IN": "India",
    "GB": "United Kingdom",
    "US": "United States",
    "DE": "Germany",
    "FR": "France",
    "CH": "Switzerland",
    "LB": "Lebanon",
    "BD": "Bangladesh",
}


def _clean(value):
    """Trim whitespace and strip Shopify's text-format leading apostrophe."""
    text = str(value or "").strip()
    if text.startswith("'"):
        text = text[1:].strip()
    return text


def _country_name(code):
    code = _clean(code).upper()
    if not code:
        return ""
    return COUNTRY_NAMES.get(code, code)


class Command(BaseCommand):
    help = "Import a Shopify customers_export.csv into Users / CustomerAddress / NewsletterSubscription."

    def add_arguments(self, parser):
        parser.add_argument("csv_path", help="Path to customers_export.csv")
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Parse and report counts without writing to the database.",
        )

    def handle(self, *args, **options):
        csv_path = Path(options["csv_path"]).expanduser()
        if not csv_path.exists():
            raise CommandError(f"CSV not found: {csv_path}")

        dry_run = bool(options["dry_run"])

        stats = {
            "rows": 0,
            "users_created": 0,
            "users_existing": 0,
            "staff_skipped": 0,
            "addresses_created": 0,
            "newsletter_created": 0,
            "skipped_no_email": 0,
            "errors": 0,
        }

        with open(csv_path, newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            with transaction.atomic():
                for row in reader:
                    stats["rows"] += 1
                    try:
                        self._process_row(row, dry_run, stats)
                    except Exception as exc:  # keep going; report at the end
                        stats["errors"] += 1
                        self.stderr.write(
                            self.style.WARNING(
                                f"Row {stats['rows']} ({_clean(row.get('Email'))}): {exc}"
                            )
                        )
                if dry_run:
                    transaction.set_rollback(True)

        self.stdout.write(
            self.style.SUCCESS(
                "Import complete (dry_run={dry_run}). "
                "rows={rows} users_created={users_created} users_existing={users_existing} "
                "staff_skipped={staff_skipped} addresses_created={addresses_created} "
                "newsletter_created={newsletter_created} skipped_no_email={skipped_no_email} "
                "errors={errors}".format(dry_run=dry_run, **stats)
            )
        )

    def _process_row(self, row, dry_run, stats):
        email = _clean(row.get("Email")).lower()
        if not email:
            stats["skipped_no_email"] += 1
            return

        first_name = _clean(row.get("First Name"))[:150]
        last_name = _clean(row.get("Last Name"))[:150]

        existing = User.objects.filter(
            Q(username__iexact=email) | Q(email__iexact=email)
        ).first()

        if existing is not None:
            user = existing
            stats["users_existing"] += 1
            # Never touch staff/superuser accounts' auth state.
            if existing.is_staff or existing.is_superuser:
                stats["staff_skipped"] += 1
            elif not dry_run:
                changed = False
                if first_name and not user.first_name:
                    user.first_name = first_name
                    changed = True
                if last_name and not user.last_name:
                    user.last_name = last_name
                    changed = True
                if changed:
                    user.save(update_fields=["first_name", "last_name"])
        else:
            stats["users_created"] += 1
            if dry_run:
                user = None
            else:
                user = User.objects.create_user(
                    username=email,
                    email=email,
                    first_name=first_name,
                    last_name=last_name,
                    is_active=True,
                )
                user.set_unusable_password()
                user.save(update_fields=["password"])

        # ── Address ──────────────────────────────────────────────────────────
        address_line_1 = _clean(row.get("Default Address Address1"))[:255]
        city = _clean(row.get("Default Address City"))[:120]
        if address_line_1 or city:
            phone = _clean(row.get("Phone")) or _clean(row.get("Default Address Phone"))
            full_name = (f"{first_name} {last_name}".strip()) or email
            if dry_run:
                # Count a would-be address only when the user has none yet.
                if user is None or not user.addresses.exists():
                    stats["addresses_created"] += 1
            elif not user.addresses.exists():
                CustomerAddress.objects.create(
                    user=user,
                    full_name=full_name[:160],
                    phone=phone[:60],
                    address_line_1=address_line_1,
                    address_line_2=_clean(row.get("Default Address Address2"))[:255],
                    city=city,
                    postcode=_clean(row.get("Default Address Zip"))[:40],
                    country=_country_name(row.get("Default Address Country Code"))[:120],
                    is_default=True,
                )
                stats["addresses_created"] += 1

        # ── Newsletter (email marketing opt-in) ──────────────────────────────
        if _clean(row.get("Accepts Email Marketing")).lower() == "yes":
            if dry_run:
                if not NewsletterSubscription.objects.filter(email=email).exists():
                    stats["newsletter_created"] += 1
            else:
                _, created = NewsletterSubscription.objects.get_or_create(
                    email=email,
                    defaults={"is_active": True},
                )
                if created:
                    stats["newsletter_created"] += 1
