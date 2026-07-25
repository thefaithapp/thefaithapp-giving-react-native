import { AuthenticatedGivingApi } from './api'
import type {
  GivingApi,
  TheFaithAppAuthorizedClient,
} from './contracts'
import { GivingError } from './errors'
import {
  activeGivingProvider,
  campaignGivingTarget,
  generalGivingTarget,
  type CampaignGivingRequest,
  type GeneralGivingRequest,
  type GivingCheckoutSession,
  type GivingPaymentResult,
  type GivingPaymentStatus,
  type GivingSubscription,
  type GivingTarget,
} from './models'
import { defaultGivingPaymentHandlers } from './payment/defaults'
import type {
  GivingCheckoutContext,
  GivingPaymentHandler,
} from './payment/types'

export interface GivingClientOptions {
  readonly auth: TheFaithAppAuthorizedClient
  readonly paymentHandlers?: readonly GivingPaymentHandler[]
  readonly statusPollIntervalMs?: number
  readonly maxStatusPollAttempts?: number
}

export interface GivingTestingOptions
  extends Omit<GivingClientOptions, 'auth'> {
  readonly api: GivingApi
}

/**
 * Authenticated entry point for general and campaign giving.
 *
 * Member and client identifiers are deliberately not accepted. The auth
 * package supplies credentials and the platform derives identity from them.
 */
export class TheFaithAppGiving {
  private readonly api: GivingApi
  private readonly handlers = new Map<string, GivingPaymentHandler>()
  readonly statusPollIntervalMs: number
  readonly maxStatusPollAttempts: number

  constructor(options: GivingClientOptions)
  /** @internal Test-only network boundary. Production apps pass auth. */
  constructor(options: GivingTestingOptions)
  constructor(options: GivingClientOptions | GivingTestingOptions) {
    this.api =
      'api' in options ? options.api : new AuthenticatedGivingApi(options.auth)
    this.statusPollIntervalMs = validatePollInterval(
      options.statusPollIntervalMs ?? 1_000,
    )
    this.maxStatusPollAttempts = validatePollAttempts(
      options.maxStatusPollAttempts ?? 12,
    )
    this.registerAll(options.paymentHandlers)
  }

  static forTesting(options: GivingTestingOptions): TheFaithAppGiving {
    return new TheFaithAppGiving(options)
  }

  private registerAll(customHandlers?: readonly GivingPaymentHandler[]) {
    for (const handler of defaultGivingPaymentHandlers) {
      this.registerHandler(handler)
    }
    for (const handler of customHandlers ?? []) {
      this.registerHandler(handler)
    }
  }

  getConfig() {
    return this.api.getConfig()
  }

  getFunds() {
    return this.api.getFunds()
  }

  getCampaign(campaignId: number) {
    return this.api.getCampaign(campaignId)
  }

  getSubscriptions() {
    return this.api.getSubscriptions()
  }

  cancelSubscription(subscription: GivingSubscription) {
    return this.api.cancelSubscription(subscription.target, subscription.id)
  }

  getPaymentHandler(provider: string): GivingPaymentHandler | null {
    return this.handlers.get(provider) ?? null
  }

  async createGeneralCheckout(
    request: GeneralGivingRequest,
  ): Promise<GivingCheckoutContext> {
    validateGeneralRequest(request)
    const target = generalGivingTarget()
    const provider = await this.activeProvider()
    const session = await this.api.checkoutGeneral(request, provider)
    return this.checkoutContext(target, provider, session)
  }

  async createCampaignCheckout(
    campaignId: number,
    request: CampaignGivingRequest,
  ): Promise<GivingCheckoutContext> {
    if (
      !Number.isInteger(campaignId) ||
      campaignId < 1 ||
      !Number.isFinite(request.amount) ||
      request.amount < 1
    ) {
      throw new GivingError(
        'invalid_request',
        'Enter a valid campaign gift amount.',
      )
    }
    const target = campaignGivingTarget(campaignId)
    const provider = await this.activeProvider()
    const session = await this.api.checkoutCampaign(
      campaignId,
      request,
      provider,
    )
    return this.checkoutContext(target, provider, session)
  }

  async finalizeCheckout(
    checkout: GivingCheckoutContext,
    result: GivingPaymentResult,
  ): Promise<GivingPaymentResult> {
    if (
      result.donationId !== checkout.session.donationId ||
      result.provider !== checkout.session.provider
    ) {
      await this.abandonCheckout(checkout)
      throw new GivingError(
        'malformed_response',
        'The payment handler returned a result for a different checkout.',
      )
    }
    if (
      result.state === 'cancelled' ||
      (result.state === 'failed' && result.provider === 'flutterwave')
    ) {
      await this.abandonCheckout(checkout)
    }
    return result
  }

  async abandonCheckout(checkout: GivingCheckoutContext): Promise<void> {
    try {
      await this.api.abandonCheckout(
        checkout.target,
        checkout.session.donationId,
      )
    } catch {
      // Platform-side expiry remains the fallback if the app is offline or
      // terminates before this advisory cleanup can be delivered.
    }
  }

  registerHandler(handler: GivingPaymentHandler): void {
    const provider = handler.provider
    if (!provider || provider.trim() !== provider) {
      throw new TypeError(
        'Payment provider identifiers must be non-empty with no surrounding whitespace.',
      )
    }
    this.handlers.set(provider, handler)
  }

  private async activeProvider(): Promise<string> {
    const provider = activeGivingProvider(await this.api.getConfig())
    if (!provider) {
      throw new GivingError(
        'unavailable',
        'Giving is not currently available for this church.',
      )
    }
    if (!this.handlers.has(provider)) {
      throw new GivingError(
        'unsupported_payment_provider',
        `No payment handler is registered for ${provider}.`,
      )
    }
    return provider
  }

  private async checkoutContext(
    target: GivingTarget,
    expectedProvider: string,
    session: GivingCheckoutSession,
  ): Promise<GivingCheckoutContext> {
    if (session.donationId < 1 || session.provider !== expectedProvider) {
      if (session.donationId > 0) {
        await bestEffort(() =>
          this.api.abandonCheckout(target, session.donationId),
        )
      }
      throw new GivingError(
        'malformed_response',
        'The giving service returned an invalid checkout session.',
      )
    }

    const getStatus = async (): Promise<GivingPaymentStatus> => {
      const status = await this.api.getStatus(target, session.donationId)
      if (
        status.donationId !== session.donationId ||
        (status.provider !== session.provider && status.provider !== 'unknown')
      ) {
        throw new GivingError(
          'malformed_response',
          'The giving service returned a status for a different checkout.',
        )
      }
      return status
    }

    return Object.freeze({
      session,
      target,
      apiOrigin: this.api.apiOrigin,
      getAuthoritativeStatus: getStatus,
      waitForAuthoritativeStatus: async () => {
        let status: GivingPaymentStatus | undefined
        for (
          let attempt = 0;
          attempt < this.maxStatusPollAttempts;
          attempt += 1
        ) {
          status = await getStatus()
          if (status.state !== 'pending') return status
          if (
            attempt + 1 < this.maxStatusPollAttempts &&
            this.statusPollIntervalMs > 0
          ) {
            await delay(this.statusPollIntervalMs)
          }
        }
        return status!
      },
      capturePayPal: () => this.api.capturePayPal(target, session),
      verifyFlutterwave: (transactionId: string) =>
        this.api.verifyFlutterwave(target, session, transactionId),
    })
  }
}

function validateGeneralRequest(request: GeneralGivingRequest): void {
  if (
    request.allocations.length === 0 ||
    request.allocations.some(
      ({ amount }) => !Number.isFinite(amount) || amount < 1,
    )
  ) {
    throw new GivingError(
      'invalid_request',
      'Enter a valid gift amount for every fund.',
    )
  }
  const fundIds = request.allocations.flatMap(({ fundId }) =>
    fundId == null ? [] : [fundId],
  )
  if (new Set(fundIds).size !== fundIds.length) {
    throw new GivingError(
      'invalid_request',
      'Each fund can only be selected once.',
    )
  }
  if (
    request.prayerRoomId != null &&
    (!Number.isInteger(request.prayerRoomId) || request.prayerRoomId < 1)
  ) {
    throw new GivingError(
      'invalid_request',
      'Enter a valid prayer room ID.',
    )
  }
}

function validatePollInterval(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError('statusPollIntervalMs must be non-negative.')
  }
  return value
}

function validatePollAttempts(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError('maxStatusPollAttempts must be at least one.')
  }
  return value
}

async function bestEffort(callback: () => Promise<void>): Promise<void> {
  try {
    await callback()
  } catch {
    // Server expiry remains the fallback cleanup.
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
