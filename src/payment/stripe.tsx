import { StripeProvider, useStripe } from '@stripe/stripe-react-native'
import { useEffect, useRef } from 'react'
import { GivingError } from '../errors'
import type { GivingPaymentResult } from '../models'
import type { GivingPaymentHandlerProps } from './types'

export interface StripeGivingPaymentHandlerOptions {
  readonly generalMerchantName?: string
  readonly campaignMerchantName?: string
  readonly merchantIdentifier?: string
  readonly returnUrl?: string
  readonly urlScheme?: string
}

export function createStripeGivingPaymentHandler(
  options: StripeGivingPaymentHandlerOptions = {},
) {
  const generalMerchantName =
    options.generalMerchantName?.trim() || 'Church Giving'
  const campaignMerchantName =
    options.campaignMerchantName?.trim() || 'Campaign Donation'

  function StripeGivingPayment({
    checkout,
    onComplete,
    onError,
  }: GivingPaymentHandlerProps) {
    const session = checkout.session
    const publishableKey = session.publishableKey
    const configured = Boolean(publishableKey && session.clientSecret)
    useEffect(() => {
      if (!configured) {
        onError(
          new GivingError(
            'malformed_response',
            'Stripe checkout is missing required configuration.',
          ),
        )
      }
    }, [configured, onError])
    if (!configured || !publishableKey) return null
    return (
      <StripeProvider
        publishableKey={publishableKey}
        merchantIdentifier={options.merchantIdentifier}
        stripeAccountId={session.stripeConnectAccountId ?? undefined}
        urlScheme={options.urlScheme}
      >
        <StripePaymentSheet
          checkout={checkout}
          merchantDisplayName={
            checkout.target.type === 'campaign'
              ? campaignMerchantName
              : generalMerchantName
          }
          returnUrl={options.returnUrl}
          onComplete={onComplete}
          onError={onError}
        />
      </StripeProvider>
    )
  }

  return {
    provider: 'stripe',
    Component: StripeGivingPayment,
  } as const
}

interface StripePaymentSheetProps extends GivingPaymentHandlerProps {
  readonly merchantDisplayName: string
  readonly returnUrl?: string
}

function StripePaymentSheet({
  checkout,
  merchantDisplayName,
  returnUrl,
  onComplete,
  onError,
}: StripePaymentSheetProps) {
  const stripe = useStripe()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const run = async () => {
      const session = checkout.session
      const initialization = await stripe.initPaymentSheet({
        paymentIntentClientSecret: session.clientSecret!,
        customerId: session.customerId ?? undefined,
        customerEphemeralKeySecret: session.ephemeralKey ?? undefined,
        merchantDisplayName,
        returnURL: returnUrl,
        style: 'automatic',
      })
      if (initialization.error) {
        await completeProviderError(
          checkout,
          initialization.error.code,
          onComplete,
        )
        return
      }

      const presentation = await stripe.presentPaymentSheet()
      if (presentation.error) {
        await completeProviderError(
          checkout,
          presentation.error.code,
          onComplete,
        )
        return
      }

      const status = await checkout.waitForAuthoritativeStatus()
      onComplete(result(checkout, status.state))
    }

    void run().catch(onError)
  }, [checkout, merchantDisplayName, onComplete, onError, returnUrl, stripe])

  return null
}

async function completeProviderError(
  checkout: GivingPaymentHandlerProps['checkout'],
  providerCode: string,
  onComplete: GivingPaymentHandlerProps['onComplete'],
): Promise<void> {
  try {
    const status = await checkout.getAuthoritativeStatus()
    if (status.state !== 'pending') {
      onComplete(result(checkout, status.state))
      return
    }
  } catch {
    // The local provider result remains useful if this advisory refresh fails.
  }
  onComplete(
    result(
      checkout,
      providerCode.toLowerCase().includes('cancel') ? 'cancelled' : 'failed',
    ),
  )
}

function result(
  checkout: GivingPaymentHandlerProps['checkout'],
  state: GivingPaymentResult['state'],
): GivingPaymentResult {
  return {
    donationId: checkout.session.donationId,
    provider: checkout.session.provider,
    state,
  }
}

export const stripeGivingPaymentHandler =
  createStripeGivingPaymentHandler()
