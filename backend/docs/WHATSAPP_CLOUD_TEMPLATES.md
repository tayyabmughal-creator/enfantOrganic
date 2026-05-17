# WhatsApp Cloud API Template Setup

This project supports WhatsApp Business Cloud API template sends for order events.

## Required Environment Variables

Set these in `backend/.env`:

- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`

Optional hardening:

- `WHATSAPP_APP_SECRET` (validates `X-Hub-Signature-256` on webhook POST)

## Template Mapping

Configure approved template names per event:

- `WHATSAPP_TEMPLATE_ORDER_CONFIRMED`
- `WHATSAPP_TEMPLATE_ORDER_SHIPPED`
- `WHATSAPP_TEMPLATE_ORDER_DELIVERED`
- `WHATSAPP_TEMPLATE_REFUND_PROCESSED`

If credentials or template names are missing, WhatsApp sends are safely skipped and logged; checkout/order flow is not blocked.

## Expected Body Parameters

The sender fills body placeholders in this order:

1. `order_confirmed`:
   - order number
   - grand total
   - currency code
2. `order_shipped`:
   - order number
   - tracking URL (or `-`)
3. `order_delivered`:
   - order number
4. `refund_processed`:
   - order number
   - refund amount
   - currency code

Match approved templates in Meta so parameter counts align.

## Webhook Endpoint

- Verify challenge (GET): `/api/notifications/webhook/whatsapp/`
- Delivery receipts (POST): `/api/notifications/webhook/whatsapp/`

Webhook processing validates:

- verify token challenge on GET
- configured business account id
- configured phone number id inside receipt metadata
- optional app-secret signature if `WHATSAPP_APP_SECRET` is set
