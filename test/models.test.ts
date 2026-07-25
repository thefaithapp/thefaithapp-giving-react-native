import { describe, expect, it } from 'vitest'
import {
  activeGivingProvider,
  campaignRequestPayload,
  generalRequestPayload,
  parseGivingCampaign,
  parseGivingConfig,
  parsePaymentStatus,
} from '../src/models'

describe('giving models', () => {
  it('serializes general giving without accepting identity fields', () => {
    expect(
      generalRequestPayload(
        {
          allocations: [
            { amount: 25, fundId: 9 },
            { amount: 10 },
          ],
          currency: 'USD',
          frequency: 'monthly',
          coverFees: true,
          memo: '  Thank you  ',
        },
        'stripe',
      ),
    ).toEqual({
      items: [
        { amount: 25, fund_id: 9 },
        { amount: 10 },
      ],
      currency: 'USD',
      frequency: 'monthly',
      payment_provider: 'stripe',
      cover_fees: true,
      memo: 'Thank you',
    })
  })

  it('serializes campaign fields while keeping authentication out of payloads', () => {
    const payload = campaignRequestPayload(
      {
        amount: 30,
        currency: 'UGX',
        formFields: {
          shirt_size: 'M',
          attending: true,
        },
      },
      'flutterwave',
    )

    expect(payload).toEqual({
      amount: 30,
      currency: 'UGX',
      frequency: 'one_time',
      payment_provider: 'flutterwave',
      cover_fees: false,
      form_fields: {
        shirt_size: 'M',
        attending: true,
      },
    })
    expect(payload).not.toHaveProperty('member_id')
    expect(payload).not.toHaveProperty('client_id')
    expect(payload).not.toHaveProperty('api_key')
  })

  it('uses only the configured active/default provider', () => {
    const config = parseGivingConfig({
      default_payment_provider: 'paypal',
      available_providers: ['stripe', 'paypal'],
      default_currency: 'USD',
      supported_currencies: [],
      cover_fees_enabled: false,
    })
    expect(activeGivingProvider(config)).toBe('paypal')
    expect(config.supportedCurrencies).toEqual([
      { code: 'USD', name: 'US Dollar', symbol: '$' },
    ])
  })

  it('parses and sorts all campaign field metadata', () => {
    const campaign = parseGivingCampaign({
      id: 4,
      title: 'School supplies',
      accepts_cash: true,
      form_fields: [
        {
          id: 2,
          label: 'Email',
          name: 'email',
          type: 'email',
          required: 1,
          sort_order: 20,
        },
        {
          id: 1,
          label: 'Size',
          name: 'size',
          type: 'select',
          options: ['S', 'M', 'L'],
          sort_order: 10,
        },
      ],
    })
    expect(campaign.formFields.map((field) => field.name)).toEqual([
      'size',
      'email',
    ])
    expect(campaign.formFields[1]?.required).toBe(true)
  })

  it.each([
    ['completed', 'succeeded'],
    ['donated', 'succeeded'],
    ['succeeded', 'succeeded'],
    ['failed', 'failed'],
    ['cancelled', 'cancelled'],
    ['processing', 'pending'],
  ] as const)('maps %s to %s', (status, expected) => {
    expect(
      parsePaymentStatus({
        donation_id: 12,
        provider: 'stripe',
        status,
      }).state,
    ).toBe(expected)
  })
})
