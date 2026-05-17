# Support and Maintenance Framework

This document defines post-launch support expectations for ENFANT ORGANIC.

## 1) Severity Definitions

| Severity | Definition | Examples |
|---|---|---|
| `S1 - Critical` | Production outage or revenue-blocking failure with no workaround | Checkout down, payment webhooks failing globally, database unavailable |
| `S2 - High` | Major feature degraded, partial revenue or operations impact | Refund flow broken, shipment creation failing for active carrier |
| `S3 - Medium` | Functional issue with workaround | Admin report export error, non-blocking validation bug |
| `S4 - Low` | Cosmetic/minor behavior issues | Label mismatch, non-critical UI formatting issue |

## 2) Response and Resolution Targets

| Severity | Initial Response Target | Status Update Frequency | Target Resolution |
|---|---|---|---|
| `S1 - Critical` | <= 1 hour | Every 1-2 hours | <= 8 hours (hotfix), full RCA within 2 business days |
| `S2 - High` | <= 4 hours | Daily | <= 2 business days |
| `S3 - Medium` | <= 1 business day | Every 2 business days | <= 5 business days |
| `S4 - Low` | <= 2 business days | Weekly | Next planned release cycle |

Notes:

- Targets assume required third-party services are operational.
- When issue is provider-side, support response still follows SLA, but final fix depends on provider turnaround.

## 3) Warranty Period (Placeholder)

Define in commercial agreement:

- Warranty start: `<TO_BE_FILLED>`
- Warranty duration: `<TO_BE_FILLED>`
- Coverage: defects in delivered scope and agreed launch modules

## 4) Monthly Maintenance Scope

Standard scope:

1. Security patching for backend/frontend dependencies.
2. Monitoring of failed jobs/logs for payments, notifications, and carrier hooks.
3. Backup/restore drill verification (as agreed cadence).
4. Minor bug fixes and stability improvements.
5. Performance and error-rate review for checkout/order APIs.
6. Assistance with third-party key rotation and webhook revalidation.

Deliverables:

- Monthly maintenance report
- Open defects summary (by severity)
- Release notes for changes shipped

## 5) Exclusions

Not included unless separately approved:

1. New feature development outside agreed backlog.
2. Provider onboarding requiring new legal/commercial contracts.
3. Full redesign/rebranding and major UX restructuring.
4. Migration to a different hosting platform.
5. Data recovery for incidents without available valid backups.
6. Support for custom third-party plugins not part of current stack.

## 6) Third-Party Dependencies and Approvals

The following can block completion even with correct code:

- Payment profile approvals (Apple Pay / Google Pay / Mada / acquirer flags)
- Carrier production credential approvals
- WhatsApp template approval in Meta
- SMS sender ID approvals by local telecom/provider
- DNS/SSL and firewall changes on hosting side

## 7) Escalation Path

1. L1: Operations support triage and evidence collection.
2. L2: Engineering investigation and fix rollout.
3. L3: Provider escalation (payment/SMS/WhatsApp/carrier) with merchant involvement.

Recommended ticket payload for faster resolution:

- timestamp and timezone
- region (`om`, `ae`, `sa`)
- order number / transaction reference
- API endpoint and response body
- screenshots or logs (redacted)

## 8) UAT and Change Governance

- Production changes should map to approved UAT scenarios.
- High-risk changes require backup verification before deployment.
- All critical admin actions should remain auditable through `AdminAuditLog`.
