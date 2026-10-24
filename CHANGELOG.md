# Changelog

## Unreleased

- Show recurring choices only when the server enables them; otherwise submit one-time gifts.
- Use patched Zod and esbuild tooling; verify a source-pinned node-forge security backport before accepting its remaining registry advisory.
- Enable Android release shrinking in the example with the required optional Stripe issuing warning rule.
- Load giving configuration and fund or campaign details concurrently.
- Refresh development dependencies to address compatible security advisories.
- Fix PayPal approval detection for general, campaign, and recurring giving so
  approved payments are captured and confirmed through the platform.
- Keep checkout controls reachable when the phone's numeric keyboard is open.
- Align the example app's Expo and React Native patch versions with Expo's
  compatibility requirements, and enable scene support for iOS 27 builds.

## 0.2.0

- Distinguish expired sign-in, plan-access denial and other forbidden requests.
- Expose allowlisted server error and plan identifiers without retaining raw
  response data. Add the new error categories to exhaustive error handlers.
- Decoded API errors with HTTP 403 no longer map to `not_authenticated`: recognized plan denials use
  `plan_access_denied`, and other permission denials use `forbidden`. Keep sign-in
  recovery for missing sessions and HTTP 401.
- Expose `GivingCheckoutSession.paypalSubscriptionId` for PayPal recurring
  checkout responses.

### Migration from 0.1.0

- Upgrade `@thefaithapp/giving-react-native` to `^0.2.0`.
- Add `plan_access_denied` and `forbidden` to exhaustive `GivingErrorCode`
  switches and handler records. Signing in again does not resolve a plan denial.
- Hand-built checkout objects and fixtures must include the nullable
  `paypalSubscriptionId` field; use `null` when no ID is available.
- Treat `serverErrorCode` and `planAccess` as optional.

## 0.1.0

- Add authenticated general and campaign giving.
- Add built-in Stripe PaymentSheet, PayPal, and Flutterwave presentation.
- Add campaign custom fields and pluggable payment handlers.
- Add authoritative platform status polling and abandoned checkout cleanup.
- Complete seller-scoped PayPal Partner Subscription approvals for recurring
  general and campaign gifts.
