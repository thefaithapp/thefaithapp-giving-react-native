import type { ComponentType } from 'react'
import type {
  GivingCheckoutSession,
  GivingPaymentResult,
  GivingPaymentStatus,
  GivingTarget,
} from '../models'

/**
 * Narrow, checkout-scoped capabilities given to a payment handler.
 * It contains no API key, bearer token, member ID, or client ID.
 */
export interface GivingCheckoutContext {
  readonly session: GivingCheckoutSession
  readonly target: GivingTarget
  readonly apiOrigin: string
  getAuthoritativeStatus(): Promise<GivingPaymentStatus>
  waitForAuthoritativeStatus(): Promise<GivingPaymentStatus>
  capturePayPal(): Promise<void>
  verifyFlutterwave(transactionId: string): Promise<void>
}

export interface GivingPaymentHandlerProps {
  readonly checkout: GivingCheckoutContext
  readonly onComplete: (result: GivingPaymentResult) => void
  readonly onError: (error: unknown) => void
}

/**
 * A pluggable provider presentation adapter.
 *
 * Handler components must not persist or log checkout session values. The
 * platform API and webhooks remain authoritative for payment status.
 */
export interface GivingPaymentHandler {
  readonly provider: string
  readonly Component: ComponentType<GivingPaymentHandlerProps>
}
