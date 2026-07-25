import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { GivingError } from '../errors'
import type { GivingPaymentResult } from '../models'
import type { TheFaithAppGiving } from '../client'
import type { GivingCheckoutContext } from './types'

export interface GivingPaymentHandlerHostProps {
  readonly giving: TheFaithAppGiving
  readonly checkout: GivingCheckoutContext
  readonly onComplete: (result: GivingPaymentResult) => void
  readonly onError?: (error: unknown) => void
  readonly fallback?: React.ReactNode
}

/**
 * Renders the registered provider and owns advisory abandoned-checkout
 * cleanup. Keep this component mounted until its completion callback fires.
 */
export function GivingPaymentHandlerHost({
  giving,
  checkout,
  onComplete,
  onError,
  fallback,
}: GivingPaymentHandlerHostProps) {
  const [settled, setSettled] = useState(false)
  const mounted = useRef(true)
  const settledRef = useRef(false)
  const handler = giving.getPaymentHandler(checkout.session.provider)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (!settledRef.current) void giving.abandonCheckout(checkout)
    }
  }, [checkout, giving])

  const complete = useCallback(
    async (result: GivingPaymentResult) => {
      if (settled) return
      try {
        const checked = await giving.finalizeCheckout(checkout, result)
        if (mounted.current) {
          settledRef.current = true
          setSettled(true)
          onComplete(checked)
        }
      } catch (error) {
        if (mounted.current) {
          settledRef.current = true
          setSettled(true)
          onError?.(error)
        }
      }
    },
    [checkout, giving, onComplete, onError, settled],
  )

  const fail = useCallback(
    (error: unknown) => {
      if (settled) return
      settledRef.current = true
      setSettled(true)
      void giving.abandonCheckout(checkout)
      onError?.(error)
    },
    [checkout, giving, onError, settled],
  )

  if (!handler) {
    fail(
      new GivingError(
        'unsupported_payment_provider',
        `No payment handler is registered for ${checkout.session.provider}.`,
      ),
    )
    return fallback ?? null
  }
  if (settled) return fallback ?? null

  const Handler = handler.Component
  return (
    <View style={styles.host}>
      {fallback ?? <ActivityIndicator accessibilityLabel="Loading checkout" />}
      <Handler checkout={checkout} onComplete={complete} onError={fail} />
    </View>
  )
}

const styles = StyleSheet.create({
  host: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
