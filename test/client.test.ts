import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TheFaithAppGiving } from '../src/client'
import type { GivingApi } from '../src/contracts'
import type {
  GivingCheckoutSession,
  GivingPaymentStatus,
  GivingTarget,
} from '../src/models'
import type { GivingPaymentHandlerProps } from '../src/payment/types'

const emptyComponent = (_props: GivingPaymentHandlerProps) => null

class FakeGivingApi implements GivingApi {
  readonly apiOrigin = 'https://api.thefaithapp.com'
  provider = 'custom'
  session: GivingCheckoutSession = checkoutSession()
  statuses: GivingPaymentStatus[] = [
    { donationId: 44, provider: 'custom', state: 'succeeded' },
  ]
  statusIndex = 0
  checkoutGeneral = vi.fn(async () => this.session)
  checkoutCampaign = vi.fn(async () => this.session)
  abandonCheckout = vi.fn(async () => {})
  capturePayPal = vi.fn(async () => {})
  verifyFlutterwave = vi.fn(async () => {})

  async getConfig() {
    return {
      defaultPaymentProvider: this.provider,
      availableProviders: [this.provider],
      defaultCurrency: 'USD',
      supportedCurrencies: [
        { code: 'USD', name: 'US Dollar', symbol: '$' },
      ],
      coverFeesEnabled: false,
      coverFeesPercentage: null,
    }
  }

  async getFunds() {
    return []
  }

  async getCampaign(campaignId: number) {
    return {
      id: campaignId,
      title: 'Campaign',
      acceptsCash: true,
      description: null,
      imageUrl: null,
      formFields: [],
    }
  }

  async getSubscriptions() {
    return []
  }

  async cancelSubscription() {}

  async getStatus(
    _target: GivingTarget,
    _donationId: number,
  ): Promise<GivingPaymentStatus> {
    const status =
      this.statuses[Math.min(this.statusIndex, this.statuses.length - 1)]!
    this.statusIndex += 1
    return status
  }
}

function checkoutSession(
  update: Partial<GivingCheckoutSession> = {},
): GivingCheckoutSession {
  return {
    provider: 'custom',
    donationId: 44,
    donationReference: null,
    clientSecret: null,
    ephemeralKey: null,
    customerId: null,
    paymentIntentId: null,
    stripeConnectAccountId: null,
    publishableKey: null,
    approvalUrl: null,
    paypalOrderId: null,
    paypalFlow: null,
    paypalTokenId: null,
    paypalSubscriptionId: null,
    flutterwaveChargeId: null,
    transactionReference: null,
    amount: 10,
    currency: 'USD',
    providerData: {},
    ...update,
  }
}

function client(api: FakeGivingApi) {
  return TheFaithAppGiving.forTesting({
    api,
    paymentHandlers: [
      {
        provider: 'custom',
        Component: emptyComponent,
      },
    ],
    statusPollIntervalMs: 0,
    maxStatusPollAttempts: 3,
  })
}

describe('TheFaithAppGiving', () => {
  let api: FakeGivingApi

  beforeEach(() => {
    api = new FakeGivingApi()
  })

  it('validates gifts before creating server records', async () => {
    await expect(
      client(api).createGeneralCheckout({
        allocations: [{ amount: 0 }],
        currency: 'USD',
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })
    expect(api.checkoutGeneral).not.toHaveBeenCalled()
  })

  it('rejects duplicate fund allocations before checkout', async () => {
    await expect(
      client(api).createGeneralCheckout({
        allocations: [
          { amount: 10, fundId: 3 },
          { amount: 20, fundId: 3 },
        ],
        currency: 'USD',
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' })
  })

  it('does not create a checkout for an unregistered provider', async () => {
    api.provider = 'new-provider'
    await expect(
      client(api).createGeneralCheckout({
        allocations: [{ amount: 10 }],
        currency: 'USD',
      }),
    ).rejects.toMatchObject({ code: 'unsupported_payment_provider' })
    expect(api.checkoutGeneral).not.toHaveBeenCalled()
  })

  it('abandons a checkout with a mismatched provider', async () => {
    api.session = checkoutSession({ provider: 'stripe' })
    await expect(
      client(api).createGeneralCheckout({
        allocations: [{ amount: 10 }],
        currency: 'USD',
      }),
    ).rejects.toMatchObject({ code: 'malformed_response' })
    expect(api.abandonCheckout).toHaveBeenCalledWith(
      { type: 'general' },
      44,
    )
  })

  it('polls platform status because provider UI return is not authoritative', async () => {
    api.statuses = [
      { donationId: 44, provider: 'custom', state: 'pending' },
      { donationId: 44, provider: 'custom', state: 'succeeded' },
    ]
    const checkout = await client(api).createGeneralCheckout({
      allocations: [{ amount: 10 }],
      currency: 'USD',
    })
    const status = await checkout.waitForAuthoritativeStatus()
    expect(status.state).toBe('succeeded')
    expect(api.statusIndex).toBe(2)
  })

  it('rejects status for a different donation', async () => {
    api.statuses = [
      { donationId: 99, provider: 'custom', state: 'succeeded' },
    ]
    const checkout = await client(api).createGeneralCheckout({
      allocations: [{ amount: 10 }],
      currency: 'USD',
    })
    await expect(checkout.getAuthoritativeStatus()).rejects.toMatchObject({
      code: 'malformed_response',
    })
  })

  it('abandons cancelled checkouts', async () => {
    const giving = client(api)
    const checkout = await giving.createGeneralCheckout({
      allocations: [{ amount: 10 }],
      currency: 'USD',
    })
    await giving.finalizeCheckout(checkout, {
      donationId: 44,
      provider: 'custom',
      state: 'cancelled',
    })
    expect(api.abandonCheckout).toHaveBeenCalledWith(
      { type: 'general' },
      44,
    )
  })

  it('rejects a handler result for another checkout and cleans up', async () => {
    const giving = client(api)
    const checkout = await giving.createGeneralCheckout({
      allocations: [{ amount: 10 }],
      currency: 'USD',
    })
    await expect(
      giving.finalizeCheckout(checkout, {
        donationId: 999,
        provider: 'custom',
        state: 'succeeded',
      }),
    ).rejects.toMatchObject({ code: 'malformed_response' })
    expect(api.abandonCheckout).toHaveBeenCalled()
  })
})
