export type GivingErrorCode =
  | 'invalid_request'
  | 'malformed_response'
  | 'not_authenticated'
  | 'payment_failed'
  | 'server'
  | 'unavailable'
  | 'unsupported_payment_provider'

export class GivingError extends Error {
  readonly name = 'GivingError'

  constructor(
    readonly code: GivingErrorCode,
    message: string,
    readonly statusCode?: number,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}
