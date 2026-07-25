export const StripeProvider = () => null

export function useStripe() {
  return {
    initPaymentSheet: async () => ({}),
    presentPaymentSheet: async () => ({}),
  }
}
