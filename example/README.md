# TheFaithApp React Native Giving Example

This standalone Expo development-build app signs in through
`@thefaithapp/auth-react-native` and exercises general giving, campaign giving,
campaign custom fields, Stripe PaymentSheet, and hosted PayPal/Flutterwave
checkout.

Register this callback in **Settings > Developer Access** using **Add React
Native app**:

```text
com.thefaithapp.reactgivingsample.thefaithapp://auth/callback
```

Then run:

```bash
export EXPO_PUBLIC_THEFAITHAPP_API_KEY="your-client-key"
npm ci --ignore-scripts
npm run security:prepare
npx expo run:ios
```

Use `npx expo run:android` for Android. A native development build is required
for Stripe; Expo Go is not sufficient. The example enables Expo scene support
for builds made with Xcode 27 and the iOS 27 SDK. Keep simulator signing enabled
so the auth package can persist the member session in Keychain.

The campaign ID selector is a QA harness in this example app. It is not part
of the giving package. The package receives a campaign ID and renders any
fields configured for that campaign.

Set `EXPO_PUBLIC_THEFAITHAPP_CAMPAIGN_ID` to start with a specific test campaign.
Keep local client keys in the ignored `.env.local` file. For a local API, build
the source auth package with its documented API and hosted-auth origin
overrides before starting Metro.

### Dependency security checks

Use Node 22 LTS (22.18+) or Node 24 LTS (24.11+) for source builds.
Run `npm ci --ignore-scripts` followed by `npm run security:prepare` before
running Expo directly. The npm start/android/ios commands run preparation
as a pre-hook. `npm run security:check` audits dependencies and verifies the
node-forge CVE-2026-85393 backport; `npm run test:security` tests the audit policy.
The registry advisory remains visible until an upstream patched version ships.

Android release builds enable R8 and resource shrinking. The Expo build properties
include the optional Stripe push-provisioning warning rule required by the native
Stripe dependency; this example uses PaymentSheet and does not use card issuing.
