"""Write the full product catalogue to disk: Excel workbook + image folders.

    python manage.py export_products
    python manage.py export_products --output /srv/exports --zip
    python manage.py export_products --no-images          # workbook only
    python manage.py export_products --published-only

Produces ``<output>/enfant-products-export-<date>/`` containing
``products.xlsx``, ``README.txt`` and ``images/<row>-<slug>/…``.
"""

import shutil
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from ...services import product_export


class Command(BaseCommand):
    help = "Export every product (data as Excel + images in per-product folders)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--output",
            default="",
            help="Directory to write the export into (default: <BASE_DIR>/exports).",
        )
        parser.add_argument(
            "--name",
            default="",
            help="Name of the export folder (default: enfant-products-export-<today>).",
        )
        parser.add_argument("--no-images", action="store_true", help="Export the workbook only.")
        parser.add_argument(
            "--no-remote",
            action="store_true",
            help="Skip images hosted on external URLs instead of downloading them.",
        )
        parser.add_argument("--published-only", action="store_true", help="Skip unpublished products.")
        parser.add_argument("--zip", action="store_true", help="Also produce a .zip next to the folder.")
        parser.add_argument(
            "--zip-only",
            action="store_true",
            help="Produce the .zip and delete the folder afterwards.",
        )
        parser.add_argument("--force", action="store_true", help="Overwrite an existing export folder.")

    def handle(self, *args, **options):
        include_images = not options["no_images"]
        include_remote = not options["no_remote"]
        include_unpublished = not options["published_only"]
        make_zip = options["zip"] or options["zip_only"]

        output_root = Path(options["output"]).expanduser() if options["output"] else Path(settings.BASE_DIR) / "exports"
        folder_name = options["name"] or product_export.export_base_name()
        destination = output_root / folder_name

        if destination.exists():
            if not options["force"]:
                raise CommandError(f"{destination} already exists. Re-run with --force to overwrite it.")
            shutil.rmtree(destination)

        products = list(product_export.export_queryset(include_unpublished=include_unpublished))
        if not products:
            raise CommandError("No products matched — nothing to export.")

        self.stdout.write(f"Exporting {len(products)} products to {destination} …")
        plans = product_export.build_plans(
            products, include_images=include_images, include_remote=include_remote
        )
        planned_images = sum(len(v) for v in plans.values())
        if include_images:
            self.stdout.write(f"Found {planned_images} image references.")

        export_options = {
            "images included": "yes" if include_images else "no",
            "remote images downloaded": "yes" if include_remote else "no",
            "unpublished products included": "yes" if include_unpublished else "no",
        }

        def progress(position, total, product):
            if position % 10 == 0 or position == total:
                self.stdout.write(f"  … {position}/{total} products ({product.slug})")

        result = product_export.write_export_directory(
            products,
            plans,
            destination,
            include_images=include_images,
            options=export_options,
            progress=progress,
        )

        self.stdout.write(self.style.SUCCESS(
            f"Workbook written: {destination / 'products.xlsx'}"
        ))
        if include_images:
            self.stdout.write(
                f"Images exported: {result.images_exported}/{planned_images} "
                f"({product_export.human_bytes(result.bytes_written)})"
            )
            if result.images_failed:
                self.stdout.write(self.style.WARNING(
                    f"{result.images_failed} image(s) could not be exported — "
                    f"see {destination / 'images-not-exported.txt'}"
                ))

        if make_zip:
            archive_path = output_root / f"{folder_name}.zip"
            self.stdout.write(f"Creating {archive_path} …")
            size = product_export.zip_directory(destination, archive_path)
            self.stdout.write(self.style.SUCCESS(
                f"Archive written: {archive_path} ({product_export.human_bytes(size)})"
            ))
            if options["zip_only"]:
                shutil.rmtree(destination)
                self.stdout.write(f"Removed folder {destination} (--zip-only).")

        self.stdout.write(self.style.SUCCESS("Done."))
