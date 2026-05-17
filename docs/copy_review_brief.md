# Khaleeji Arabic Copy Review Brief

## Purpose
This workflow lets reviewers audit English/Arabic copy in one CSV, approve final Khaleeji Arabic wording, and import approved text safely.

## Tone and Voice Guidelines
1. Warm, reassuring, motherly voice for baby-care context.
2. GCC-friendly wording that feels natural across Oman, UAE, and KSA.
3. Avoid overly formal MSA where a clear, familiar Khaleeji phrasing works better.
4. Keep language simple, direct, and trustworthy (no hype-heavy phrasing).

## Terminology Consistency
1. Keep brand and product names unchanged unless explicitly approved by brand owner.
2. Keep core functional terms consistent across storefront and checkout (for example: delivery, refund, order tracking, VAT, sensitive skin).
3. Reuse established approved wording for recurring UI terms (cart, checkout, account, etc.).

## CSV Workflow
Use management command:

```bash
cd backend
python3 manage.py copy_review_csv export
```

CSV columns:
- `model/key`
- `english_text`
- `current_arabic_text`
- `reviewer_notes`
- `approved_arabic`

Reviewer rules:
1. Do not change `model/key`, `english_text`, or `current_arabic_text` columns.
2. Put comments in `reviewer_notes`.
3. Put final approved text only in `approved_arabic`.
4. Leave `approved_arabic` empty when no change is approved.

## Safe Import
Validate and preview first:

```bash
cd backend
python3 manage.py copy_review_csv import --dry-run
```

Apply approved changes:

```bash
cd backend
python3 manage.py copy_review_csv import
```

Safety behavior:
1. Import applies only rows with non-empty `approved_arabic`.
2. Import validates CSV English/current Arabic against live source before writing.
3. If source changed since export, import stops with validation errors (prevents accidental overwrite).
4. No automatic copy rewriting happens without explicit reviewer-approved text in CSV.
