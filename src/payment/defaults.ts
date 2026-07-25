import {
  flutterwaveGivingPaymentHandler,
  paypalGivingPaymentHandler,
} from './hosted'
import { stripeGivingPaymentHandler } from './stripe'
import type { GivingPaymentHandler } from './types'

export const defaultGivingPaymentHandlers: readonly GivingPaymentHandler[] = [
  stripeGivingPaymentHandler,
  paypalGivingPaymentHandler,
  flutterwaveGivingPaymentHandler,
]
