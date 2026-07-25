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
npm install
npx expo run:ios
```

Use `npx expo run:android` for Android. A native development build is required
for Stripe; Expo Go is not sufficient.

The campaign ID selector is a QA harness in this example app. It is not part
of the giving package. The package receives a campaign ID and renders any
fields configured for that campaign.
