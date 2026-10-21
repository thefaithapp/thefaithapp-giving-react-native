import type {
  GivingApi,
  TheFaithAppAuthorizedClient,
} from './contracts'
import { GivingError, type GivingPlanAccess } from './errors'
import {
  campaignRequestPayload,
  generalRequestPayload,
  parseCheckoutSession,
  parseGivingCampaign,
  parseGivingConfig,
  parseGivingFund,
  parseGivingSubscription,
  parsePaymentStatus,
  type CampaignGivingRequest,
  type GeneralGivingRequest,
  type GivingCheckoutSession,
  type GivingPaymentStatus,
  type GivingTarget,
} from './models'

export class AuthenticatedGivingApi implements GivingApi {
  readonly apiOrigin: string

  constructor(private readonly auth: TheFaithAppAuthorizedClient) {
    this.apiOrigin = new URL(auth.apiUrl('/')).origin
  }

  async getConfig() {
    return parseGivingConfig(await this.get('/v1/giving/config'))
  }

  async getFunds() {
    const data = await this.get('/v1/giving/funds')
    return list(data).map(parseGivingFund)
  }

  async getCampaign(campaignId: number) {
    requirePositiveInteger(campaignId, 'campaign ID')
    return parseGivingCampaign(await this.get(`/v1/campaigns/${campaignId}`))
  }

  async getSubscriptions() {
    const data = await this.get('/v1/giving/subscriptions')
    return list(data).map(parseGivingSubscription)
  }

  async cancelSubscription(target: GivingTarget, subscriptionId: number) {
    requirePositiveInteger(subscriptionId, 'subscription ID')
    await this.post(
      target.type === 'general'
        ? `/v1/giving/subscriptions/${subscriptionId}/cancel`
        : `/v1/campaigns/${target.campaignId}/subscriptions/${subscriptionId}/cancel`,
      {},
    )
  }

  async checkoutGeneral(
    request: GeneralGivingRequest,
    provider: string,
  ): Promise<GivingCheckoutSession> {
    return parseCheckoutSession(
      await this.post(
        '/v1/giving/checkout',
        generalRequestPayload(request, provider),
      ),
    )
  }

  async checkoutCampaign(
    campaignId: number,
    request: CampaignGivingRequest,
    provider: string,
  ): Promise<GivingCheckoutSession> {
    requirePositiveInteger(campaignId, 'campaign ID')
    return parseCheckoutSession(
      await this.post(
        `/v1/campaigns/${campaignId}/checkout`,
        campaignRequestPayload(request, provider),
      ),
    )
  }

  async getStatus(
    target: GivingTarget,
    donationId: number,
  ): Promise<GivingPaymentStatus> {
    requirePositiveInteger(donationId, 'donation ID')
    const path =
      target.type === 'general'
        ? `/v1/giving/checkouts/${donationId}/status`
        : `/v1/campaigns/${target.campaignId}/checkouts/${donationId}/status`
    return parsePaymentStatus(await this.get(path))
  }

  async abandonCheckout(target: GivingTarget, donationId: number) {
    requirePositiveInteger(donationId, 'donation ID')
    const path =
      target.type === 'general'
        ? `/v1/giving/checkouts/${donationId}/abandon`
        : `/v1/campaigns/${target.campaignId}/checkouts/${donationId}/abandon`
    await this.post(path, {})
  }

  async capturePayPal(
    target: GivingTarget,
    session: GivingCheckoutSession,
  ) {
    const path =
      target.type === 'general'
        ? '/v1/giving/paypal/capture'
        : `/v1/campaigns/${target.campaignId}/paypal/capture`
    await this.post(path, {
      donation_id: session.donationId,
      paypal_flow: session.paypalFlow ?? 'order',
      ...(session.paypalOrderId
        ? { paypal_order_id: session.paypalOrderId }
        : {}),
      ...(session.paypalTokenId
        ? { paypal_token_id: session.paypalTokenId }
        : {}),
      ...(session.paypalSubscriptionId
        ? { paypal_subscription_id: session.paypalSubscriptionId }
        : {}),
    })
  }

  async verifyFlutterwave(
    target: GivingTarget,
    session: GivingCheckoutSession,
    transactionId: string,
  ) {
    if (!transactionId.trim()) {
      throw new GivingError(
        'invalid_request',
        'Flutterwave transaction ID is required.',
      )
    }
    const path =
      target.type === 'general'
        ? '/v1/giving/flutterwave/verify'
        : `/v1/campaigns/${target.campaignId}/flutterwave/verify`
    await this.post(path, {
      donation_id: session.donationId,
      transaction_id: transactionId,
    })
  }

  private async get(path: string): Promise<unknown> {
    return this.request(path)
  }

  private async post(
    path: string,
    body: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    let response: Response
    try {
      response = await this.auth.authorizedFetch(path, init)
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'not_authenticated'
      ) {
        throw new GivingError(
          'not_authenticated',
          'Sign in before making a gift.',
          undefined,
          { cause: error },
        )
      }
      throw error
    }

    if (response.status === 204) return {}

    let payload: unknown
    try {
      const body = await response.text()
      if (!body && response.ok) return {}
      payload = JSON.parse(body)
    } catch (error) {
      throw new GivingError(
        'malformed_response',
        'The giving service returned an invalid response.',
        response.status,
        { cause: error },
      )
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new GivingError(
        'malformed_response',
        'The giving service returned an invalid response.',
        response.status,
      )
    }
    const envelope = payload as Record<string, unknown>
    if (!response.ok) {
      const serverErrorCode = identifier(envelope.error_code)
      const message =
        typeof envelope.message === 'string' && envelope.message
          ? envelope.message
          : 'The giving request could not be completed.'
      throw new GivingError(
        response.status === 401
          ? 'not_authenticated'
          : response.status === 403
            ? isPlanDenial(serverErrorCode)
              ? 'plan_access_denied'
              : 'forbidden'
            : response.status === 422
              ? 'invalid_request'
              : 'server',
        message,
        response.status,
        {
          serverErrorCode,
          planAccess:
            response.status === 403 && isPlanDenial(serverErrorCode)
              ? parsePlanAccess(envelope.plan_access, serverErrorCode)
              : undefined,
        },
      )
    }
    if (!('data' in envelope)) {
      throw new GivingError(
        'malformed_response',
        'The giving service returned an invalid response.',
        response.status,
      )
    }
    return envelope.data
  }
}

function isPlanDenial(code: string | undefined): boolean {
  return (
    code === 'plan_product_unavailable' || code === 'plan_entitlement_required'
  )
}

function identifier(value: unknown): string | undefined {
  return typeof value === 'string' &&
    /^[a-z][a-z0-9_]{0,79}$/.exec(value)?.[0] === value
    ? value
    : undefined
}

function parsePlanAccess(
  value: unknown,
  serverErrorCode: string | undefined,
): GivingPlanAccess | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  const plan = value as Record<string, unknown>
  const type = plan.type
  if (type !== 'product' && type !== 'entitlement') return undefined
  if (
    type !==
    (serverErrorCode === 'plan_product_unavailable' ? 'product' : 'entitlement')
  )
    return undefined
  const key = identifier(plan[type])
  if (!key) return undefined
  return Object.freeze({
    type,
    ...(type === 'product' ? { product: key } : { entitlement: key }),
    currentPlan: identifier(plan.current_plan),
    recommendedPlan: identifier(plan.recommended_plan),
  })
}

function list(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as Record<string, unknown>).items)
  ) {
    return (value as { items: readonly unknown[] }).items
  }
  {
    throw new GivingError(
      'malformed_response',
      'The giving service returned an invalid list.',
    )
  }
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new GivingError('invalid_request', `Enter a valid ${label}.`)
  }
}
