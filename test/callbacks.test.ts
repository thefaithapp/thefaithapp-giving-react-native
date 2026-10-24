import { describe, expect, it } from 'vitest'
import { trustedGivingCallback } from '../src/payment/hosted'

describe('trustedGivingCallback', () => {
  const paths = new Set(['/paypal/giving/success'])

  it('accepts the exact API origin, path, and donation', () => {
    expect(
      trustedGivingCallback(
        'https://api.thefaithapp.com/paypal/giving/success?donation_id=42',
        'https://api.thefaithapp.com',
        42,
        paths,
      )?.pathname,
    ).toBe('/paypal/giving/success')
  })

  it.each([
    'https://evil.example/paypal/giving/success?donation_id=42',
    'https://api.thefaithapp.com.evil.example/paypal/giving/success?donation_id=42',
    'https://api.thefaithapp.com@evil.example/paypal/giving/success?donation_id=42',
    'http://api.thefaithapp.com/paypal/giving/success?donation_id=42',
    'https://api.thefaithapp.com/paypal/giving/cancel?donation_id=42',
    'https://api.thefaithapp.com/paypal/giving/success?donation_id=99',
  ])('rejects untrusted callback %s', (candidate) => {
    expect(
      trustedGivingCallback(
        candidate,
        'https://api.thefaithapp.com',
        42,
        paths,
      ),
    ).toBeNull()
  })

  it('permits HTTP only for an exact loopback API origin', () => {
    expect(
      trustedGivingCallback(
        'http://127.0.0.1:8000/paypal/giving/success?donation_id=42',
        'http://127.0.0.1:8000',
        42,
        paths,
      ),
    ).not.toBeNull()
  })
})
