"""Write the Full Order Report to a file from the command line.

The admin has two buttons for this. This exists for the cases the buttons
cannot answer: producing the file on the server without a browser session,
handing a dated extract to someone who does not have an admin login, and
scheduling the export if it is ever wanted on a cron.

It builds the rows through exactly the same code the admin buttons use, so the
CLI can never drift into being a second, subtly different report.
"""
from django.core.management.base import BaseCommand, CommandError
from django.utils.dateparse import parse_date

from store.api_views.admin_ops import (
    filtered_admin_orders,
    order_line_items_filename,
    order_line_items_response,
)


class Command(BaseCommand):
    help = "Export every order line (one row per product sold) as CSV or Excel."

    def add_arguments(self, parser):
        parser.add_argument("--output", type=str, default="", help="File to write. Defaults to the dated report name in the current directory.")
        parser.add_argument("--date-from", type=str, default="", help="Only orders placed on or after this date (YYYY-MM-DD).")
        parser.add_argument("--date-to", type=str, default="", help="Only orders placed on or before this date (YYYY-MM-DD).")
        parser.add_argument("--market", type=str, default="", help="Restrict to one market: om, ae or sa.")
        parser.add_argument("--currency", type=str, default="", help="Restrict to one currency: OMR, AED or SAR.")
        parser.add_argument("--payment-status", type=str, default="", help="Restrict to one payment status, e.g. paid.")
        parser.add_argument("--sales-channel", type=str, default="", help="online_store or draft_order.")
        parser.add_argument("--format", dest="export_format", type=str, default="csv", choices=["csv", "xlsx"])

    def handle(self, *args, **options):
        for key in ("date_from", "date_to"):
            raw = (options[key] or "").strip()
            if raw and not parse_date(raw):
                raise CommandError(f"--{key.replace('_', '-')} must be YYYY-MM-DD, got {raw!r}.")

        params = {
            "date_from": (options["date_from"] or "").strip(),
            "date_to": (options["date_to"] or "").strip(),
            "market": (options["market"] or "").strip(),
            "currency": (options["currency"] or "").strip(),
            "payment_status": (options["payment_status"] or "").strip(),
            "sales_channel": (options["sales_channel"] or "").strip(),
        }
        export_format = options["export_format"]

        orders = filtered_admin_orders(params).order_by()
        order_count = orders.count()

        response = order_line_items_response(
            orders,
            export_format=export_format,
            filename=order_line_items_filename(params),
        )
        body = response.content

        destination = (options["output"] or "").strip()
        if not destination:
            destination = f"{order_line_items_filename(params)}.{'xlsx' if export_format == 'xlsx' else 'csv'}"
        with open(destination, "wb") as handle:
            handle.write(body)

        # Header row is not a data row; the client counts products sold.
        line_count = max(body.count(b"\n") - 1, 0) if export_format == "csv" else None
        summary = f"Wrote {destination} · {order_count} order(s)"
        if line_count is not None:
            summary += f" · {line_count} product line(s)"
        self.stdout.write(self.style.SUCCESS(summary))
