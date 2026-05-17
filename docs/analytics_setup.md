# Analytics Setup (GTM First)

Storefront analytics is implemented with GTM-first loading and consent gating.

## Frontend Environment Variables

- `NEXT_PUBLIC_GTM_ID`
- `NEXT_PUBLIC_GA4_ID` (optional fallback when GTM is not set)
- `NEXT_PUBLIC_META_PIXEL_ID` (optional fallback when GTM is not set)

## Consent

- Banner is bilingual (English/Arabic).
- Consent state is saved in `localStorage` key `enfant-analytics-consent`.
- Marketing scripts are blocked until consent is granted.

## Event Coverage

Implemented ecommerce events:

- `view_item`
- `view_item_list`
- `search`
- `add_to_cart`
- `remove_from_cart`
- `begin_checkout`
- `add_shipping_info`
- `add_payment_info`
- `purchase`

## Purchase Deduplication

`purchase` is deduped in `sessionStorage` using:

- `enfant-purchase-event:{order_number}`

## Verification

1. Set `NEXT_PUBLIC_GTM_ID`.
2. Load storefront and accept consent.
3. Confirm `window.dataLayer` contains ecommerce events.
4. Complete checkout and verify `purchase` fires once for the order.
