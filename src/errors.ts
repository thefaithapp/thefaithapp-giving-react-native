export type GivingErrorCode =
  | 'invalid_request'
  | 'malformed_response'
  | 'not_authenticated'
  | 'plan_access_denied'
  | 'forbidden'
  | 'payment_failed'
  | 'server'
  | 'unavailable'
  | 'unsupported_payment_provider'

/** Allowlisted plan identifiers returned by the API; never the raw response. */
export type GivingPlanAccess = Readonly<{
  type: 'product' | 'entitlement'
  product?: string
  entitlement?: string
  currentPlan?: string
  recommendedPlan?: string
}>

export interface GivingErrorOptions extends ErrorOptions {
  serverErrorCode?: string
  planAccess?: GivingPlanAccess
}

export class GivingError extends Error {
  readonly name = 'GivingError'
  readonly serverErrorCode?: string
  readonly planAccess?: GivingPlanAccess

  constructor(
    readonly code: GivingErrorCode,
    message: string,
    readonly statusCode?: number,
    options?: GivingErrorOptions,
  ) {
    super(message, options)
    this.serverErrorCode = options?.serverErrorCode
    this.planAccess = options?.planAccess
  }
}
