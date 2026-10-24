import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import type { TheFaithAppGiving } from './client'
import { GivingError } from './errors'
import {
  activeGivingProvider,
  givingFrequencies,
  type CampaignFormValue,
  type GivingCampaign,
  type GivingCampaignFormField,
  type GivingConfig,
  type GivingFrequency,
  type GivingFund,
  type GivingPaymentResult,
} from './models'
import { GivingPaymentHandlerHost } from './payment/host'
import type { GivingCheckoutContext } from './payment/types'

export interface GivingStrings {
  readonly generalTitle: string
  readonly campaignTitle: string
  readonly amount: string
  readonly fund: string
  readonly generalFund: string
  readonly currency: string
  readonly frequency: string
  readonly memo: string
  readonly coverFees: string
  readonly additionalInformation: string
  readonly addFund: string
  readonly remove: string
  readonly submit: string
  readonly requiredField: string
  readonly loading: string
  readonly processing: string
  readonly unavailable: string
  readonly invalidAmount: string
  readonly duplicateFund: string
  readonly pending: string
  readonly success: string
  readonly cancelled: string
  readonly failed: string
}

export const defaultGivingStrings: GivingStrings = {
  generalTitle: 'Give',
  campaignTitle: 'Give to campaign',
  amount: 'Amount',
  fund: 'Fund',
  generalFund: 'General',
  currency: 'Currency',
  frequency: 'Frequency',
  memo: 'Memo (optional)',
  coverFees: 'Help cover processing fees',
  additionalInformation: 'Additional information',
  addFund: 'Split across another fund',
  remove: 'Remove',
  submit: 'Continue',
  requiredField: 'This field is required.',
  loading: 'Loading giving options…',
  processing: 'Preparing secure checkout…',
  unavailable: 'Giving is not currently available.',
  invalidAmount: 'Enter an amount of at least 1.',
  duplicateFund: 'Each fund can only be selected once.',
  pending: 'Your payment is processing. It will appear once confirmed.',
  success: 'Thank you. Your gift was confirmed.',
  cancelled: 'Payment cancelled.',
  failed: 'Payment could not be confirmed.',
}

interface SharedGivingViewProps {
  readonly giving: TheFaithAppGiving
  readonly strings?: Partial<GivingStrings>
  readonly allowRecurring?: boolean
  readonly showMemo?: boolean
  readonly contentContainerStyle?: StyleProp<ViewStyle>
  readonly onCompleted?: (result: GivingPaymentResult) => void
  readonly onError?: (error: unknown) => void
}

export interface GeneralGivingViewProps extends SharedGivingViewProps {
  readonly prayerRoomId?: number
}

export interface CampaignGivingViewProps extends SharedGivingViewProps {
  readonly campaignId: number
}

export function GeneralGivingView(props: GeneralGivingViewProps) {
  return <GivingView {...props} target={{ type: 'general' }} />
}

export function CampaignGivingView({
  campaignId,
  ...props
}: CampaignGivingViewProps) {
  return (
    <GivingView
      {...props}
      target={{ type: 'campaign', campaignId }}
    />
  )
}

type InternalGivingViewProps = SharedGivingViewProps & {
  readonly target:
    | { readonly type: 'general' }
    | { readonly type: 'campaign'; readonly campaignId: number }
  readonly prayerRoomId?: number
}

interface AllocationInput {
  readonly key: number
  readonly amount: string
  readonly fundId: number | null
}

function GivingView({
  giving,
  target,
  prayerRoomId,
  strings: stringOverrides,
  allowRecurring = true,
  showMemo = true,
  contentContainerStyle,
  onCompleted,
  onError,
}: InternalGivingViewProps) {
  const strings = useMemo(
    () => ({ ...defaultGivingStrings, ...stringOverrides }),
    [stringOverrides],
  )
  const [config, setConfig] = useState<GivingConfig | null>(null)
  const recurringAllowed = allowRecurring && prayerRoomId == null &&
    config?.recurringGivingEnabled === true
  const [funds, setFunds] = useState<readonly GivingFund[]>([])
  const [campaign, setCampaign] = useState<GivingCampaign | null>(null)
  const [currency, setCurrency] = useState<string | null>(null)
  const [frequency, setFrequency] =
    useState<GivingFrequency>('one_time')
  const [memo, setMemo] = useState('')
  const [coverFees, setCoverFees] = useState(false)
  const [allocations, setAllocations] = useState<readonly AllocationInput[]>([
    { key: 1, amount: '', fundId: null },
  ])
  const [nextAllocationKey, setNextAllocationKey] = useState(2)
  const [campaignValues, setCampaignValues] = useState<
    Readonly<Record<string, CampaignFormValue>>
  >({})
  const [errors, setErrors] = useState<
    Readonly<Record<string, string>>
  >({})
  const [loadError, setLoadError] = useState<unknown>(null)
  const [interactionError, setInteractionError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [checkout, setCheckout] = useState<GivingCheckoutContext | null>(null)
  const [result, setResult] = useState<GivingPaymentResult | null>(null)
  const mounted = useRef(true)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(null)
    const load = async () => {
      const [nextConfig, nextFunds, nextCampaign] = await Promise.all([
        giving.getConfig(),
        target.type === 'general' ? giving.getFunds() : [],
        target.type === 'campaign'
          ? giving.getCampaign(target.campaignId)
          : null,
      ])
      if (nextCampaign && !nextCampaign.acceptsCash) {
        throw new GivingError(
          'unavailable',
          'This campaign does not accept cash gifts.',
        )
      }
      if (!active) return
      const supportedCurrency =
        nextConfig.supportedCurrencies.find(
          (item) => item.code === nextConfig.defaultCurrency,
        ) ?? nextConfig.supportedCurrencies[0]
      setConfig(nextConfig)
      setFunds(nextFunds)
      setCampaign(nextCampaign)
      setCurrency(supportedCurrency?.code ?? null)
      setLoading(false)
    }
    void load().catch((error) => {
      if (!active) return
      setLoading(false)
      setLoadError(error)
      onErrorRef.current?.(error)
    })
    return () => {
      active = false
    }
  }, [giving, target.type, target.type === 'campaign' ? target.campaignId : null])

  const updateAllocation = useCallback(
    (key: number, update: Partial<Omit<AllocationInput, 'key'>>) => {
      setAllocations((current) =>
        current.map((item) =>
          item.key === key ? { ...item, ...update } : item,
        ),
      )
    },
    [],
  )

  const submit = async () => {
    if (submitting || checkout) return
    const validation = validateForm(
      allocations,
      campaign?.formFields ?? [],
      campaignValues,
      strings,
    )
    setErrors(validation)
    if (Object.keys(validation).length > 0 || !currency) return

    setSubmitting(true)
    setResult(null)
    setInteractionError(null)
    try {
      const nextCheckout =
        target.type === 'general'
          ? await giving.createGeneralCheckout({
              allocations: allocations.map((item) => ({
                amount: Number(item.amount),
                fundId: item.fundId,
              })),
              currency,
              frequency:
                recurringAllowed ? frequency : 'one_time',
              memo,
              coverFees,
              prayerRoomId,
            })
          : await giving.createCampaignCheckout(target.campaignId, {
              amount: Number(allocations[0]!.amount),
              currency,
              frequency: recurringAllowed ? frequency : 'one_time',
              memo,
              coverFees,
              formFields: normalizedCampaignValues(
                campaign?.formFields ?? [],
                campaignValues,
              ),
            })
      if (!mounted.current) {
        await giving.abandonCheckout(nextCheckout)
        return
      }
      setCheckout(nextCheckout)
    } catch (error) {
      onErrorRef.current?.(error)
      setInteractionError(error)
    } finally {
      setSubmitting(false)
    }
  }

  const completePayment = (paymentResult: GivingPaymentResult) => {
    setCheckout(null)
    setResult(paymentResult)
    onCompleted?.(paymentResult)
  }

  const paymentError = (error: unknown) => {
    setCheckout(null)
    setInteractionError(error)
    onErrorRef.current?.(error)
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator accessibilityLabel={strings.loading} />
        <Text style={styles.secondaryText}>{strings.loading}</Text>
      </View>
    )
  }
  if (!config || loadError) {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="alert" style={styles.errorText}>
          {errorMessage(loadError) ?? strings.unavailable}
        </Text>
      </View>
    )
  }
  if (!activeGivingProvider(config)) {
    return (
      <View style={styles.centered}>
        <Text>{strings.unavailable}</Text>
      </View>
    )
  }

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={[styles.container, contentContainerStyle]}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
    >
      <Text accessibilityRole="header" style={styles.heading}>
        {campaign?.title ??
          (target.type === 'general'
            ? strings.generalTitle
            : strings.campaignTitle)}
      </Text>
      {campaign?.description ? (
        <Text style={styles.description}>
          {plainTextFromHtml(campaign.description)}
        </Text>
      ) : null}

      {allocations.map((allocation, index) => (
        <View key={allocation.key} style={styles.section}>
          {target.type === 'general' && funds.length > 0 ? (
            <ChoiceGroup
              label={strings.fund}
              options={[
                { label: strings.generalFund, value: '' },
                ...funds.map((fund) => ({
                  label: fund.name,
                  value: String(fund.id),
                })),
              ]}
              value={
                allocation.fundId == null ? '' : String(allocation.fundId)
              }
              onChange={(value) =>
                updateAllocation(allocation.key, {
                  fundId: value ? Number(value) : null,
                })
              }
            />
          ) : null}
          <FieldLabel text={strings.amount} required />
          <TextInput
            accessibilityLabel={`${strings.amount} ${index + 1}`}
            keyboardType="decimal-pad"
            onChangeText={(amount) =>
              updateAllocation(allocation.key, { amount })
            }
            placeholder="0.00"
            style={[
              styles.input,
              errors[`amount.${index}`] ? styles.inputError : null,
            ]}
            value={allocation.amount}
          />
          {errors[`amount.${index}`] ? (
            <FieldError message={errors[`amount.${index}`]!} />
          ) : null}
          {allocations.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setAllocations((current) =>
                  current.filter((item) => item.key !== allocation.key),
                )
              }
            >
              <Text style={styles.link}>{strings.remove}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      {errors.funds ? <FieldError message={errors.funds} /> : null}
      {target.type === 'general' && funds.length > allocations.length ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setAllocations((current) => [
              ...current,
              { key: nextAllocationKey, amount: '', fundId: null },
            ])
            setNextAllocationKey((value) => value + 1)
          }}
        >
          <Text style={styles.link}>＋ {strings.addFund}</Text>
        </Pressable>
      ) : null}

      <ChoiceGroup
        label={strings.currency}
        options={config.supportedCurrencies.map((item) => ({
          value: item.code,
          label: `${item.code} — ${item.name}`,
        }))}
        value={currency ?? ''}
        onChange={setCurrency}
      />

      {recurringAllowed ? (
        <ChoiceGroup
          label={strings.frequency}
          options={givingFrequencies.map((value) => ({
            value,
            label: frequencyLabel(value),
          }))}
          value={frequency}
          onChange={(value) => setFrequency(value as GivingFrequency)}
        />
      ) : null}

      {showMemo ? (
        <View style={styles.section}>
          <FieldLabel text={strings.memo} />
          <TextInput
            maxLength={500}
            multiline
            onChangeText={setMemo}
            style={[styles.input, styles.multilineInput]}
            value={memo}
          />
        </View>
      ) : null}

      {campaign?.formFields.length ? (
        <View style={styles.section}>
          <Text style={styles.subheading}>
            {strings.additionalInformation}
          </Text>
          {campaign.formFields.map((field) => (
            <CampaignField
              error={errors[`field.${field.name}`]}
              field={field}
              key={field.id}
              onChange={(value) =>
                setCampaignValues((current) => ({
                  ...current,
                  [field.name]: value,
                }))
              }
              strings={strings}
              value={campaignValues[field.name]}
            />
          ))}
        </View>
      ) : null}

      {config.coverFeesEnabled ? (
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text>{strings.coverFees}</Text>
            {config.coverFeesPercentage != null ? (
              <Text style={styles.helpText}>
                {config.coverFeesPercentage}%
              </Text>
            ) : null}
          </View>
          <Switch onValueChange={setCoverFees} value={coverFees} />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={submitting || checkout != null}
        onPress={() => void submit()}
        style={({ pressed }) => [
          styles.submit,
          pressed ? styles.pressed : null,
          submitting || checkout ? styles.disabled : null,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.submitText}>{strings.submit}</Text>
        )}
      </Pressable>

      {interactionError ? (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {errorMessage(interactionError) ?? strings.failed}
        </Text>
      ) : null}

      {checkout ? (
        <GivingPaymentHandlerHost
          checkout={checkout}
          giving={giving}
          onComplete={completePayment}
          onError={paymentError}
          fallback={
            <View style={styles.processing}>
              <ActivityIndicator />
              <Text>{strings.processing}</Text>
            </View>
          }
        />
      ) : null}
      {result ? (
        <Text
          accessibilityLiveRegion="polite"
          style={
            result.state === 'failed' ? styles.errorText : styles.resultText
          }
        >
          {resultMessage(result, strings)}
        </Text>
      ) : null}
    </ScrollView>
  )
}

interface CampaignFieldProps {
  readonly field: GivingCampaignFormField
  readonly value: CampaignFormValue | undefined
  readonly error: string | undefined
  readonly strings: GivingStrings
  readonly onChange: (value: CampaignFormValue) => void
}

function CampaignField({
  field,
  value,
  error,
  onChange,
}: CampaignFieldProps) {
  if (field.type === 'checkbox') {
    return (
      <View style={styles.field}>
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <FieldLabel text={field.label} required={field.required} />
            {field.helpText ? (
              <Text style={styles.helpText}>{field.helpText}</Text>
            ) : null}
          </View>
          <Switch
            onValueChange={onChange}
            value={value === true}
          />
        </View>
        {error ? <FieldError message={error} /> : null}
      </View>
    )
  }
  if (field.type === 'select' || field.type === 'radio') {
    return (
      <View style={styles.field}>
        <ChoiceGroup
          helpText={field.helpText}
          label={field.label}
          onChange={onChange}
          options={field.options.map((option) => ({
            value: option,
            label: option,
          }))}
          required={field.required}
          value={typeof value === 'string' ? value : ''}
        />
        {error ? <FieldError message={error} /> : null}
      </View>
    )
  }
  const stringValue =
    typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : ''
  return (
    <View style={styles.field}>
      <FieldLabel text={field.label} required={field.required} />
      {field.helpText ? (
        <Text style={styles.helpText}>{field.helpText}</Text>
      ) : null}
      <TextInput
        autoCapitalize={field.type === 'email' ? 'none' : 'sentences'}
        keyboardType={campaignKeyboardType(field.type)}
        multiline={field.type === 'textarea'}
        onChangeText={onChange}
        placeholder={
          field.placeholder ??
          (field.type === 'date' ? 'YYYY-MM-DD' : undefined)
        }
        style={[
          styles.input,
          field.type === 'textarea' ? styles.multilineInput : null,
          error ? styles.inputError : null,
        ]}
        value={stringValue}
      />
      {error ? <FieldError message={error} /> : null}
    </View>
  )
}

interface ChoiceGroupProps {
  readonly label: string
  readonly options: readonly { readonly label: string; readonly value: string }[]
  readonly value: string
  readonly onChange: (value: string) => void
  readonly required?: boolean
  readonly helpText?: string | null
}

function ChoiceGroup({
  label,
  options,
  value,
  onChange,
  required,
  helpText,
}: ChoiceGroupProps) {
  return (
    <View style={styles.section}>
      <FieldLabel required={required} text={label} />
      {helpText ? <Text style={styles.helpText}>{helpText}</Text> : null}
      <View accessibilityRole="radiogroup" style={styles.choices}>
        {options.map((option) => {
          const selected = option.value === value
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[
                styles.choice,
                selected ? styles.choiceSelected : null,
              ]}
            >
              <Text
                style={
                  selected ? styles.choiceTextSelected : styles.choiceText
                }
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function FieldLabel({
  text,
  required = false,
}: {
  readonly text: string
  readonly required?: boolean
}) {
  return (
    <Text style={styles.label}>
      {text}
      {required ? ' *' : ''}
    </Text>
  )
}

function FieldError({ message }: { readonly message: string }) {
  return (
    <Text accessibilityRole="alert" style={styles.fieldError}>
      {message}
    </Text>
  )
}

function validateForm(
  allocations: readonly AllocationInput[],
  fields: readonly GivingCampaignFormField[],
  values: Readonly<Record<string, CampaignFormValue>>,
  strings: GivingStrings,
): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {}
  allocations.forEach((allocation, index) => {
    const amount = Number(allocation.amount)
    if (!Number.isFinite(amount) || amount < 1) {
      errors[`amount.${index}`] = strings.invalidAmount
    }
  })
  const fundIds = allocations.flatMap((item) =>
    item.fundId == null ? [] : [item.fundId],
  )
  if (new Set(fundIds).size !== fundIds.length) {
    errors.funds = strings.duplicateFund
  }
  for (const field of fields) {
    const value = values[field.name]
    const empty =
      value == null ||
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && value.length === 0) ||
      (field.type === 'checkbox' && value !== true)
    if (field.required && empty) {
      errors[`field.${field.name}`] = strings.requiredField
    } else if (
      field.type === 'number' &&
      typeof value === 'string' &&
      value.trim() &&
      !Number.isFinite(Number(value))
    ) {
      errors[`field.${field.name}`] = 'Enter a valid number.'
    }
  }
  return errors
}

function normalizedCampaignValues(
  fields: readonly GivingCampaignFormField[],
  values: Readonly<Record<string, CampaignFormValue>>,
): Readonly<Record<string, CampaignFormValue>> {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = values[field.name]
      if (value == null || (typeof value === 'string' && !value.trim())) {
        return []
      }
      return [[field.name, typeof value === 'string' ? value.trim() : value]]
    }),
  )
}

function frequencyLabel(value: GivingFrequency): string {
  switch (value) {
    case 'one_time':
      return 'One time'
    case 'weekly':
      return 'Weekly'
    case 'monthly':
      return 'Monthly'
    case 'quarterly':
      return 'Quarterly'
    case 'semi_annual':
      return 'Every six months'
    case 'annual':
      return 'Annual'
  }
}

function campaignKeyboardType(type: string): KeyboardTypeOptions {
  if (type === 'number') return 'decimal-pad'
  if (type === 'email') return 'email-address'
  if (type === 'tel') return 'phone-pad'
  return 'default'
}

function resultMessage(
  result: GivingPaymentResult,
  strings: GivingStrings,
): string {
  switch (result.state) {
    case 'succeeded':
      return strings.success
    case 'pending':
      return strings.pending
    case 'cancelled':
      return strings.cancelled
    case 'failed':
      return strings.failed
  }
}

function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null
}

function plainTextFromHtml(value: string): string {
  return value
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(?:p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .trim()
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    padding: 20,
  },
  centered: {
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
    minHeight: 180,
    padding: 20,
  },
  heading: {
    color: '#111827',
    fontSize: 26,
    fontWeight: '700',
  },
  subheading: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '600',
  },
  description: {
    color: '#4b5563',
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    gap: 8,
    marginTop: 4,
  },
  field: {
    gap: 6,
    marginTop: 12,
  },
  label: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
  },
  helpText: {
    color: '#6b7280',
    fontSize: 13,
  },
  secondaryText: {
    color: '#6b7280',
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d1d5db',
    borderRadius: 10,
    borderWidth: 1,
    color: '#111827',
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  multilineInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#b91c1c',
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choice: {
    backgroundColor: '#ffffff',
    borderColor: '#d1d5db',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  choiceSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  choiceText: {
    color: '#374151',
  },
  choiceTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  switchCopy: {
    flex: 1,
  },
  link: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 6,
  },
  submit: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 50,
    paddingHorizontal: 18,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.55,
  },
  processing: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  resultText: {
    color: '#166534',
    fontSize: 15,
    paddingVertical: 8,
    textAlign: 'center',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 15,
    textAlign: 'center',
  },
  fieldError: {
    color: '#b91c1c',
    fontSize: 13,
  },
})
