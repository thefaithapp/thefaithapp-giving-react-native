import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import WebView, {
  type WebViewNavigation,
} from 'react-native-webview'
import { GivingError } from '../errors'
import type {
  GivingPaymentResult,
  GivingPaymentState,
} from '../models'
import type { GivingPaymentHandlerProps } from './types'

export function PayPalGivingPayment({
  checkout,
  onComplete,
  onError,
}: GivingPaymentHandlerProps) {
  const campaign = checkout.target.type === 'campaign'
  return (
    <HostedGivingPayment
      title="PayPal"
      checkout={checkout}
      successPaths={
        new Set(
          campaign
            ? ['/paypal/campaigns/success']
            : ['/paypal/giving/success', '/paypal/giving/billing-approved'],
        )
      }
      cancelPaths={
        new Set([
          campaign ? '/paypal/campaigns/cancel' : '/paypal/giving/cancel',
        ])
      }
      onApproved={async () => {
        await checkout.capturePayPal()
        return (await checkout.waitForAuthoritativeStatus()).state
      }}
      onComplete={onComplete}
      onError={onError}
    />
  )
}

export function FlutterwaveGivingPayment({
  checkout,
  onComplete,
  onError,
}: GivingPaymentHandlerProps) {
  return (
    <HostedGivingPayment
      title="Flutterwave"
      checkout={checkout}
      successPaths={
        new Set([
          checkout.target.type === 'campaign'
            ? '/flutterwave/campaigns/callback'
            : '/flutterwave/giving/callback',
        ])
      }
      cancelPaths={new Set()}
      onApproved={async (callback) => {
        const callbackStatus = callback.searchParams.get('status')
        if (callbackStatus === 'cancelled' || callbackStatus === 'failed') {
          return callbackStatus
        }
        const transactionId =
          callback.searchParams.get('transaction_id') ??
          callback.searchParams.get('id')
        if (!transactionId) {
          throw new GivingError(
            'payment_failed',
            'Flutterwave did not return a transaction identifier.',
          )
        }
        await checkout.verifyFlutterwave(transactionId)
        return (await checkout.waitForAuthoritativeStatus()).state
      }}
      onComplete={onComplete}
      onError={onError}
    />
  )
}

interface HostedGivingPaymentProps extends GivingPaymentHandlerProps {
  readonly title: string
  readonly successPaths: ReadonlySet<string>
  readonly cancelPaths: ReadonlySet<string>
  readonly onApproved: (callback: URL) => Promise<GivingPaymentState>
}

function HostedGivingPayment({
  title,
  checkout,
  successPaths,
  cancelPaths,
  onApproved,
  onComplete,
  onError,
}: HostedGivingPaymentProps) {
  const [loading, setLoading] = useState(true)
  const finishing = useRef(false)
  const approvalUrl = secureApprovalUrl(checkout.session.approvalUrl)
  useEffect(() => {
    if (!approvalUrl) {
      onError(
        new GivingError(
          'malformed_response',
          `${title} checkout URL is unavailable.`,
        ),
      )
    }
  }, [approvalUrl, onError, title])

  const finish = useCallback(
    async (callback: URL) => {
      if (finishing.current) return
      finishing.current = true
      setLoading(true)
      try {
        const state = await onApproved(callback)
        onComplete(result(checkout, state))
      } catch (error) {
        onError(error)
      }
    },
    [checkout, onApproved, onComplete, onError],
  )

  const cancel = useCallback(() => {
    if (finishing.current) return
    finishing.current = true
    onComplete(result(checkout, 'cancelled'))
  }, [checkout, onComplete])

  if (!approvalUrl) return null

  const inspectNavigation = (navigation: WebViewNavigation): boolean => {
    const callback = trustedGivingCallback(
      navigation.url,
      checkout.apiOrigin,
      checkout.session.donationId,
      new Set([...successPaths, ...cancelPaths]),
    )
    if (!callback) return true
    if (cancelPaths.has(callback.pathname)) {
      cancel()
    } else if (successPaths.has(callback.pathname)) {
      void finish(callback)
    }
    return false
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={cancel}
      presentationStyle="pageSheet"
      visible
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <Pressable
            accessibilityLabel={`Close ${title} checkout`}
            accessibilityRole="button"
            onPress={cancel}
            style={styles.closeButton}
          >
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <WebView
          javaScriptEnabled
          onLoadEnd={() => setLoading(false)}
          onLoadStart={() => setLoading(true)}
          onShouldStartLoadWithRequest={inspectNavigation}
          sharedCookiesEnabled={false}
          source={{ uri: approvalUrl }}
          thirdPartyCookiesEnabled
        />
        {loading ? (
          <View pointerEvents="none" style={styles.loading}>
            <ActivityIndicator accessibilityLabel={`Loading ${title}`} />
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  )
}

export function trustedGivingCallback(
  candidate: string,
  apiOrigin: string,
  donationId: number,
  allowedPaths: ReadonlySet<string>,
): URL | null {
  try {
    const callback = new URL(candidate)
    const api = new URL(apiOrigin)
    const loopback =
      callback.hostname === 'localhost' ||
      callback.hostname === '127.0.0.1' ||
      callback.hostname === '[::1]' ||
      callback.hostname === '::1'
    const secure =
      callback.protocol === 'https:' ||
      (callback.protocol === 'http:' && loopback)
    if (
      !secure ||
      callback.origin !== api.origin ||
      !allowedPaths.has(callback.pathname) ||
      callback.searchParams.get('donation_id') !== String(donationId)
    ) {
      return null
    }
    return callback
  } catch {
    return null
  }
}

function secureApprovalUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function result(
  checkout: GivingPaymentHandlerProps['checkout'],
  state: GivingPaymentResult['state'],
): GivingPaymentResult {
  return {
    donationId: checkout.session.donationId,
    provider: checkout.session.provider,
    state,
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    minHeight: 52,
    paddingHorizontal: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 17, fontWeight: '600', color: '#111827' },
  closeButton: { paddingHorizontal: 8, paddingVertical: 10 },
  closeText: { color: '#2563eb', fontSize: 16 },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    justifyContent: 'center',
  },
})

export const paypalGivingPaymentHandler = {
  provider: 'paypal',
  Component: PayPalGivingPayment,
} as const

export const flutterwaveGivingPaymentHandler = {
  provider: 'flutterwave',
  Component: FlutterwaveGivingPayment,
} as const
