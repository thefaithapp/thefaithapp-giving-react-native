export const givingFrequencies = [
  'one_time',
  'weekly',
  'monthly',
  'quarterly',
  'semi_annual',
  'annual',
] as const

export type GivingFrequency = (typeof givingFrequencies)[number]
export type GivingPaymentState =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export type GivingTarget =
  | { readonly type: 'general' }
  | { readonly type: 'campaign'; readonly campaignId: number }

export const generalGivingTarget = (): GivingTarget => ({ type: 'general' })
export const campaignGivingTarget = (campaignId: number): GivingTarget => ({
  type: 'campaign',
  campaignId,
})

export interface SupportedCurrency {
  readonly code: string
  readonly name: string
  readonly symbol: string
}

export interface GivingConfig {
  readonly defaultPaymentProvider: string | null
  readonly availableProviders: readonly string[]
  readonly defaultCurrency: string
  readonly supportedCurrencies: readonly SupportedCurrency[]
  readonly coverFeesEnabled: boolean
  readonly coverFeesPercentage: number | null
  readonly recurringGivingEnabled?: boolean
}

export function activeGivingProvider(config: GivingConfig): string | null {
  return config.defaultPaymentProvider ?? config.availableProviders[0] ?? null
}

export interface GivingFund {
  readonly id: number
  readonly name: string
  readonly description: string | null
}

export type CampaignFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'tel'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'date'
  | (string & {})

export interface GivingCampaignFormField {
  readonly id: number
  readonly label: string
  readonly name: string
  readonly type: CampaignFieldType
  readonly options: readonly string[]
  readonly placeholder: string | null
  readonly helpText: string | null
  readonly required: boolean
  readonly sortOrder: number
}

export interface GivingCampaign {
  readonly id: number
  readonly title: string
  readonly acceptsCash: boolean
  readonly description: string | null
  readonly imageUrl: string | null
  readonly formFields: readonly GivingCampaignFormField[]
}

export interface GivingSubscription {
  readonly id: number
  readonly target: GivingTarget
  readonly amount: number
  readonly currency: string
  readonly frequency: GivingFrequency
  readonly provider: string | null
  readonly nextPaymentDate: Date | null
  readonly createdAt: Date | null
  readonly campaignTitle: string | null
}

export interface GivingAllocation {
  readonly amount: number
  readonly fundId?: number | null
}

export interface GeneralGivingRequest {
  readonly allocations: readonly GivingAllocation[]
  readonly currency: string
  readonly frequency?: GivingFrequency
  readonly memo?: string | null
  readonly coverFees?: boolean
  readonly prayerRoomId?: number | null
}

export type CampaignFormValue = string | number | boolean | readonly string[]

export interface CampaignGivingRequest {
  readonly amount: number
  readonly currency: string
  readonly frequency?: GivingFrequency
  readonly memo?: string | null
  readonly coverFees?: boolean
  readonly formFields?: Readonly<Record<string, CampaignFormValue>>
}

export interface GivingCheckoutSession {
  readonly provider: string
  readonly donationId: number
  readonly donationReference: string | null
  readonly clientSecret: string | null
  readonly ephemeralKey: string | null
  readonly customerId: string | null
  readonly paymentIntentId: string | null
  readonly stripeConnectAccountId: string | null
  readonly publishableKey: string | null
  readonly approvalUrl: string | null
  readonly paypalOrderId: string | null
  readonly paypalFlow: string | null
  readonly paypalTokenId: string | null
  readonly paypalSubscriptionId: string | null
  readonly flutterwaveChargeId: string | null
  readonly transactionReference: string | null
  readonly amount: number | null
  readonly currency: string | null
  /**
   * Complete ephemeral provider payload for custom handlers.
   * Do not persist or log it.
   */
  readonly providerData: Readonly<Record<string, unknown>>
}

export interface GivingPaymentStatus {
  readonly donationId: number
  readonly state: GivingPaymentState
  readonly provider: string
}

export interface GivingPaymentResult {
  readonly donationId: number
  readonly provider: string
  readonly state: GivingPaymentState
}

export function givingSucceeded(result: GivingPaymentResult): boolean {
  return result.state === 'succeeded'
}

export function generalRequestPayload(
  request: GeneralGivingRequest,
  provider: string,
): Record<string, unknown> {
  return {
    items: request.allocations.map(({ amount, fundId }) => ({
      ...(fundId == null ? {} : { fund_id: fundId }),
      amount,
    })),
    currency: request.currency,
    frequency: request.frequency ?? 'one_time',
    payment_provider: provider,
    cover_fees: request.coverFees ?? false,
    ...optionalTrimmed('memo', request.memo),
    ...(request.prayerRoomId == null
      ? {}
      : { prayer_room_id: request.prayerRoomId }),
  }
}

export function campaignRequestPayload(
  request: CampaignGivingRequest,
  provider: string,
): Record<string, unknown> {
  return {
    amount: request.amount,
    currency: request.currency,
    frequency: request.frequency ?? 'one_time',
    payment_provider: provider,
    cover_fees: request.coverFees ?? false,
    ...optionalTrimmed('memo', request.memo),
    ...(request.formFields && Object.keys(request.formFields).length > 0
      ? { form_fields: request.formFields }
      : {}),
  }
}

export function parseGivingConfig(value: unknown): GivingConfig {
  const data = object(value)
  const currencies = array(data.supported_currencies).map((item) => {
    const currency = object(item)
    return {
      code: string(currency, 'code'),
      name: string(currency, 'name'),
      symbol: string(currency, 'symbol'),
    }
  })
  return {
    defaultPaymentProvider: nullableString(data.default_payment_provider),
    availableProviders: stringArray(data.available_providers),
    defaultCurrency: nullableString(data.default_currency) ?? 'USD',
    supportedCurrencies:
      currencies.length > 0
        ? currencies
        : [{ code: 'USD', name: 'US Dollar', symbol: '$' }],
    coverFeesEnabled: data.cover_fees_enabled === true,
    coverFeesPercentage: nullableNumber(data.cover_fees_percentage),
    recurringGivingEnabled: data.recurring_giving_enabled === true,
  }
}

export function parseGivingFund(value: unknown): GivingFund {
  const data = object(value)
  return {
    id: integer(data, 'id'),
    name: string(data, 'name'),
    description: nullableString(data.description),
  }
}

export function parseGivingCampaign(value: unknown): GivingCampaign {
  const data = object(value)
  return {
    id: integer(data, 'id'),
    title: string(data, 'title'),
    acceptsCash: data.accepts_cash === true,
    description: nullableString(data.description),
    imageUrl: nullableString(data.image_url),
    formFields: array(data.form_fields)
      .map(parseCampaignFormField)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }
}

export function parseCampaignFormField(
  value: unknown,
): GivingCampaignFormField {
  const data = object(value)
  return {
    id: integer(data, 'id'),
    label: string(data, 'label'),
    name: string(data, 'name'),
    type: string(data, 'type'),
    options: stringArray(data.options),
    placeholder: nullableString(data.placeholder),
    helpText: nullableString(data.help_text),
    required: data.required === true || data.required === 1,
    sortOrder: nullableInteger(data.sort_order) ?? 0,
  }
}

export function parseGivingSubscription(value: unknown): GivingSubscription {
  const data = object(value)
  const source = data.source
  const target =
    source === 'giving'
      ? generalGivingTarget()
      : source === 'campaign'
        ? campaignGivingTarget(integer(data, 'campaign_id'))
        : invalid('Subscription source is invalid.')
  return {
    id: integer(data, 'id'),
    target,
    amount: requiredNumber(data, 'amount'),
    currency: string(data, 'currency'),
    frequency: isGivingFrequency(data.frequency)
      ? data.frequency
      : 'one_time',
    provider: nullableString(data.method),
    nextPaymentDate: nullableDate(data.next_payment_date),
    createdAt: nullableDate(data.created_at),
    campaignTitle: nullableString(data.campaign_title),
  }
}

export function parseCheckoutSession(value: unknown): GivingCheckoutSession {
  const data = object(value)
  return {
    provider: string(data, 'provider'),
    donationId: integer(data, 'donation_id'),
    donationReference: nullableString(data.donation_reference),
    clientSecret: nullableString(data.client_secret),
    ephemeralKey: nullableString(data.ephemeral_key),
    customerId: nullableString(data.customer_id),
    paymentIntentId: nullableString(data.payment_intent_id),
    stripeConnectAccountId: nullableString(data.stripe_connect_account_id),
    publishableKey: nullableString(data.publishable_key),
    approvalUrl: nullableUrl(data.approval_url),
    paypalOrderId: nullableString(data.paypal_order_id),
    paypalFlow: nullableString(data.paypal_flow),
    paypalTokenId: nullableString(data.paypal_token_id),
    paypalSubscriptionId: nullableString(data.paypal_subscription_id),
    flutterwaveChargeId: nullableString(data.fw_charge_id),
    transactionReference: nullableString(data.tx_ref),
    amount: nullableNumber(data.amount),
    currency: nullableString(data.currency),
    providerData: Object.freeze({ ...data }),
  }
}

export function parsePaymentStatus(value: unknown): GivingPaymentStatus {
  const data = object(value)
  const raw = data.status
  const state: GivingPaymentState =
    raw === 'completed' || raw === 'donated' || raw === 'succeeded'
      ? 'succeeded'
      : raw === 'failed'
        ? 'failed'
        : raw === 'cancelled' || raw === 'canceled'
          ? 'cancelled'
          : 'pending'
  return {
    donationId: integer(data, 'donation_id'),
    state,
    provider: nullableString(data.provider) ?? 'unknown',
  }
}

function optionalTrimmed(
  key: string,
  value: string | null | undefined,
): Record<string, string> {
  const normalized = value?.trim()
  return normalized ? { [key]: normalized } : {}
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected an object.')
  }
  return value as Record<string, unknown>
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

function string(data: Record<string, unknown>, key: string): string {
  const value = data[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${key} is missing.`)
  }
  return value
}

function integer(data: Record<string, unknown>, key: string): number {
  const value = data[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`${key} is missing.`)
  }
  return value
}

function requiredNumber(data: Record<string, unknown>, key: string): number {
  const value = nullableNumber(data[key])
  if (value == null) throw new TypeError(`${key} is missing.`)
  return value
}

function nullableInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const result = Number(value)
    if (Number.isFinite(result)) return result
  }
  return null
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function nullableUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  try {
    return new URL(value).toString()
  } catch {
    return null
  }
}

function nullableDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function stringArray(value: unknown): readonly string[] {
  return array(value).filter(
    (item): item is string => typeof item === 'string',
  )
}

function isGivingFrequency(value: unknown): value is GivingFrequency {
  return givingFrequencies.includes(value as GivingFrequency)
}

function invalid(message: string): never {
  throw new TypeError(message)
}
