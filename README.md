# TheFaithApp Giving for React Native

`@thefaithapp/giving-react-native` adds authenticated general and campaign
giving to React Native and Expo apps. It renders the giving form, the church's
active payment method, campaign custom fields, and the payment experience for
Stripe, PayPal, and Flutterwave.

TheFaithApp creates the donation, derives the member and client identity from
the authenticated session, receives provider webhooks, and owns the final
payment status.

## Install

```bash
npm install @thefaithapp/auth-react-native @thefaithapp/giving-react-native
npx expo install @stripe/stripe-react-native react-native-webview
npx expo install expo-application expo-crypto expo-secure-store expo-web-browser
```

Add the auth and Stripe plugins to `app.json`. Stripe requires an options
object even when Apple Pay and Google Pay are not enabled:

```json
{
  "expo": {
    "scheme": "your-church",
    "plugins": [
      "@thefaithapp/auth-react-native",
      [
        "@stripe/stripe-react-native",
        {
          "merchantIdentifier": "merchant.com.example.church",
          "enableGooglePay": false
        }
      ],
      "expo-secure-store",
      "expo-web-browser"
    ],
    "ios": {
      "bundleIdentifier": "com.example.church"
    },
    "android": {
      "package": "com.example.church"
    }
  }
}
```

Rebuild the native application after adding the native dependencies. Stripe
PaymentSheet cannot run inside Expo Go.

## Create the clients

```tsx
import { TheFaithAppAuth } from '@thefaithapp/auth-react-native'
import {
  TheFaithAppGiving,
  createStripeGivingPaymentHandler,
} from '@thefaithapp/giving-react-native'

const auth = new TheFaithAppAuth({ apiKey: 'your-client-key' })

const giving = new TheFaithAppGiving({
  auth,
  paymentHandlers: [
    createStripeGivingPaymentHandler({
      urlScheme: 'your-church',
      returnUrl: 'your-church://stripe-redirect',
    }),
  ],
})
```

The custom Stripe registration replaces the built-in Stripe handler with the
same provider ID and adds an app return URL for redirect and 3DS flows. If the
application only supports flows that do not leave PaymentSheet, the default
handler can be used without this override.

A member must have a valid auth session before protected giving calls succeed:

```tsx
await auth.signIn()
```

## Handle access failures

The expanded error categories and fields below are an **unreleased repository
update**. They are not yet a new npm release; the package version remains
unchanged in this change.

A valid sign-in does not guarantee that the church's plan includes SDK access.
Handle `GivingError.code` according to the failure:

| Code | Meaning | Next step |
| --- | --- | --- |
| `not_authenticated` | No usable member session, or HTTP 401 | Follow your app's sign-in recovery path. |
| `plan_access_denied` | HTTP 403 with a recognized plan denial | Ask the church administrator to review plan access. Signing in again does not change the plan. |
| `forbidden` | Another HTTP 403 permission denial | Check the permitted resource/action with the church; do not assume the member needs to sign in again. |

`statusCode` retains the HTTP status. `serverErrorCode` retains a valid bounded
machine code, including `plan_product_unavailable` or
`plan_entitlement_required`. For those plan denials, optional `planAccess`
contains only typed identifiers: `type`, `product` or `entitlement`,
`currentPlan`, and `recommendedPlan`. Missing or malformed context is omitted;
it does not prevent recognizing a plan denial. No raw response or credentials
are retained in these fields.

When updating to this change, add the new cases to exhaustive
`GivingErrorCode` handlers. The built-in view reports the error through
`onError` and displays its message; it does not sign the member out.

## General giving

```tsx
import { GeneralGivingView } from '@thefaithapp/giving-react-native'

export function GivingScreen() {
  return (
    <GeneralGivingView
      giving={giving}
      onCompleted={(result) => {
        // result.state: succeeded, pending, failed, or cancelled
      }}
      onError={(error) => {
        // Present a safe error. Do not log checkout session values.
      }}
    />
  )
}
```

The view loads available funds, supports splitting a gift between funds,
currency, recurring frequency, memo, and fee coverage according to the
church's configuration.

## Campaign giving

```tsx
import { CampaignGivingView } from '@thefaithapp/giving-react-native'

export function CampaignScreen({ campaignId }: { campaignId: number }) {
  return (
    <CampaignGivingView
      campaignId={campaignId}
      giving={giving}
      onCompleted={(result) => {
        // The platform/webhook status is reflected in result.state.
      }}
    />
  )
}
```

The campaign view loads the campaign and renders its configured `text`,
`textarea`, `number`, `email`, `tel`, `select`, `radio`, `checkbox`, and
`date` fields. Campaign discovery or a campaign ID selector belongs to the
host application, not this package.

Both views accept partial `strings` overrides, `contentContainerStyle`,
`allowRecurring`, and `showMemo`.

## Custom payment methods

Payment presentation is provider-extensible. A handler receives only an
ephemeral checkout session and narrow completion capabilities—never the auth
client, API key, bearer token, member ID, or client ID.

```tsx
import type {
  GivingPaymentHandler,
  GivingPaymentHandlerProps,
} from '@thefaithapp/giving-react-native'

function ChurchPay({
  checkout,
  onComplete,
  onError,
}: GivingPaymentHandlerProps) {
  // Present provider UI. Do not persist or log checkout.session.
  // Confirm through checkout.waitForAuthoritativeStatus() before completing.
  return null
}

const churchPayHandler: GivingPaymentHandler = {
  provider: 'church-pay',
  Component: ChurchPay,
}

const giving = new TheFaithAppGiving({
  auth,
  paymentHandlers: [churchPayHandler],
})
```

The handler's `provider` must exactly match the active provider returned by
TheFaithApp. Custom handlers with `stripe`, `paypal`, or `flutterwave` replace
the corresponding built-in handler.

## Headless checkout

The rendered views are optional. A custom UI can create a protected checkout
and render `GivingPaymentHandlerHost`:

```tsx
const checkout = await giving.createGeneralCheckout({
  allocations: [{ amount: 25, fundId: 4 }],
  currency: 'USD',
  frequency: 'one_time',
})

<GivingPaymentHandlerHost
  giving={giving}
  checkout={checkout}
  onComplete={setResult}
  onError={setError}
/>
```

For campaigns, call `createCampaignCheckout(campaignId, request)`.

Keep the host mounted until it completes. If a custom flow dismisses a
checkout without rendering the host, call:

```ts
await giving.abandonCheckout(checkout)
```

## Security model

- Giving calls use `authorizedFetch` from `@thefaithapp/auth-react-native`.
- The SDK accepts no member ID, client ID, API key, or bearer token fields.
- Authenticated calls are relative paths; the auth package restricts them to
  TheFaithApp's API origin.
- Stripe client secrets and hosted approval URLs are ephemeral and are never
  stored by the SDK.
- PayPal and Flutterwave callbacks must match the exact API origin, expected
  callback path, and donation ID.
- A provider UI returning success is not proof of payment. The SDK polls the
  platform's webhook-backed status.
- Cancelled, invalid, dismissed, and failed hosted checkouts trigger
  best-effort abandonment. Platform-side checkout expiry is the fallback when
  a device is offline or terminated.
- Provider webhooks and signing secrets remain on TheFaithApp. They do not
  belong in the mobile application.

## License

TheFaithApp Giving is available under the [MIT License](LICENSE).
