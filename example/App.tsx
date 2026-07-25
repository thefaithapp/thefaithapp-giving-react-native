import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import {
  TheFaithAppAuth,
  TheFaithAuthError,
  type TheFaithAuthSession,
} from '@thefaithapp/auth-react-native'
import {
  CampaignGivingView,
  GeneralGivingView,
  GivingError,
  TheFaithAppGiving,
  createStripeGivingPaymentHandler,
  type GivingPaymentResult,
} from '@thefaithapp/giving-react-native'

const apiKey = process.env.EXPO_PUBLIC_THEFAITHAPP_API_KEY?.trim() ?? ''

export default function App() {
  const auth = useMemo(
    () => (apiKey ? new TheFaithAppAuth({ apiKey }) : null),
    [],
  )
  const giving = useMemo(
    () =>
      auth
        ? new TheFaithAppGiving({
            auth,
            paymentHandlers: [
              createStripeGivingPaymentHandler({
                returnUrl:
                  'thefaithapp-giving-example://stripe-redirect',
                urlScheme: 'thefaithapp-giving-example',
              }),
            ],
          })
        : null,
    [auth],
  )
  const [session, setSession] = useState<TheFaithAuthSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'general' | 'campaign'>('general')
  const [campaignInput, setCampaignInput] = useState('1')
  const [campaignId, setCampaignId] = useState(1)
  const [status, setStatus] = useState(
    apiKey
      ? 'Restore or sign in to start testing.'
      : 'Add EXPO_PUBLIC_THEFAITHAPP_API_KEY to continue.',
  )

  useEffect(() => {
    if (!auth) return
    void auth
      .currentSession()
      .then((saved) => {
        setSession(saved)
        setStatus(
          saved
            ? `Signed in as ${saved.member.name}.`
            : 'Sign in with a member account to give.',
        )
      })
      .catch((error: unknown) => setStatus(messageFor(error)))
  }, [auth])

  const signIn = async () => {
    if (!auth) return
    setBusy(true)
    try {
      const next = await auth.signIn()
      setSession(next)
      setStatus(`Signed in as ${next.member.name}.`)
    } catch (error) {
      setStatus(messageFor(error))
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    if (!auth) return
    setBusy(true)
    try {
      await auth.signOut()
      setSession(null)
      setStatus('Signed out and removed the local member session.')
    } catch (error) {
      setStatus(messageFor(error))
    } finally {
      setBusy(false)
    }
  }

  const completed = (result: GivingPaymentResult) => {
    setStatus(
      `Donation ${result.donationId} returned ${result.state} through ${result.provider}.`,
    )
  }

  if (!session || !giving) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.signInContainer}>
          <Text style={styles.eyebrow}>THEFAITHAPP</Text>
          <Text style={styles.title}>React Native Giving</Text>
          <Text style={styles.subtitle}>
            Sign in as a member before opening a protected checkout.
          </Text>
          <ActionButton
            disabled={!auth || busy}
            label="Sign in"
            onPress={signIn}
            primary
          />
          <StatusCard busy={busy} status={status} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>THEFAITHAPP</Text>
          <Text style={styles.headerTitle}>Giving SDK QA</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={signOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <TabButton
          active={tab === 'general'}
          label="General"
          onPress={() => setTab('general')}
        />
        <TabButton
          active={tab === 'campaign'}
          label="Campaign"
          onPress={() => setTab('campaign')}
        />
      </View>

      {tab === 'campaign' ? (
        <View style={styles.campaignPicker}>
          <TextInput
            accessibilityLabel="Campaign ID"
            keyboardType="number-pad"
            onChangeText={setCampaignInput}
            placeholder="Campaign ID"
            style={styles.input}
            value={campaignInput}
          />
          <ActionButton
            disabled={
              !Number.isInteger(Number(campaignInput)) ||
              Number(campaignInput) < 1
            }
            label="Load"
            onPress={() => setCampaignId(Number(campaignInput))}
          />
        </View>
      ) : null}

      <View style={styles.giving}>
        {tab === 'general' ? (
          <GeneralGivingView
            giving={giving}
            onCompleted={completed}
            onError={(error) => setStatus(messageFor(error))}
          />
        ) : (
          <CampaignGivingView
            campaignId={campaignId}
            giving={giving}
            key={campaignId}
            onCompleted={completed}
            onError={(error) => setStatus(messageFor(error))}
          />
        )}
      </View>
      <StatusCard busy={busy} status={status} />
    </SafeAreaView>
  )
}

function TabButton({
  active,
  label,
  onPress,
}: {
  active: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tab, active && styles.activeTab]}
    >
      <Text style={[styles.tabText, active && styles.activeTabText]}>
        {label}
      </Text>
    </Pressable>
  )
}

function ActionButton({
  label,
  onPress,
  disabled,
  primary = false,
}: {
  label: string
  onPress: () => void
  disabled: boolean
  primary?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        primary && styles.primaryButton,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[styles.buttonText, primary && styles.primaryButtonText]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function StatusCard({
  status,
  busy,
}: {
  status: string
  busy: boolean
}) {
  return (
    <View style={styles.statusCard}>
      {busy ? <ActivityIndicator size="small" /> : null}
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {status}
      </Text>
    </View>
  )
}

function messageFor(error: unknown): string {
  if (error instanceof GivingError || error instanceof TheFaithAuthError) {
    return error.message
  }
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  signInContainer: {
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    padding: 24,
  },
  eyebrow: {
    color: '#977447',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.2,
  },
  title: { color: '#1e2c25', fontSize: 34, fontWeight: '800' },
  subtitle: { color: '#66736c', fontSize: 16, lineHeight: 23 },
  header: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  headerTitle: { color: '#1e2c25', fontSize: 20, fontWeight: '800' },
  signOut: { color: '#345d4b', fontWeight: '700', padding: 8 },
  tabs: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  tab: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  activeTab: { backgroundColor: '#345d4b' },
  tabText: { color: '#345d4b', fontWeight: '700' },
  activeTabText: { color: '#ffffff' },
  campaignPicker: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  input: {
    borderColor: '#d1d5db',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  giving: { flex: 1 },
  button: {
    alignItems: 'center',
    borderColor: '#345d4b',
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButton: { backgroundColor: '#345d4b' },
  buttonText: { color: '#345d4b', fontSize: 15, fontWeight: '700' },
  primaryButtonText: { color: '#ffffff' },
  disabled: { opacity: 0.42 },
  statusCard: {
    alignItems: 'center',
    backgroundColor: '#e8efea',
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  status: { color: '#345d4b', flex: 1, fontSize: 13, lineHeight: 18 },
})
