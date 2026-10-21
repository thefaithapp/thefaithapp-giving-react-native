# Changelog

## Unreleased

- Distinguish expired sign-in, plan-access denial and other forbidden requests.
- Expose allowlisted server error and plan identifiers without retaining raw
  response data. Add the new error categories to exhaustive error handlers.

## 0.1.0

- Add authenticated general and campaign giving.
- Add built-in Stripe PaymentSheet, PayPal, and Flutterwave presentation.
- Add campaign custom fields and pluggable payment handlers.
- Add authoritative platform status polling and abandoned checkout cleanup.
- Complete seller-scoped PayPal Partner Subscription approvals for recurring
  general and campaign gifts.
