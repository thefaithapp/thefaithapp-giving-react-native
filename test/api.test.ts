import { describe, expect, it } from 'vitest'
import { AuthenticatedGivingApi } from '../src/api'
import type { TheFaithAppAuthorizedClient } from '../src/contracts'

class FakeAuth implements TheFaithAppAuthorizedClient {
  readonly calls: { path: string; init?: RequestInit }[] = []

  apiUrl(path: string): string {
    return new URL(path, 'https://api.thefaithapp.com').toString()
  }

  async authorizedFetch(
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    this.calls.push({ path, init })
    return Response.json({
      data:
        path === '/v1/giving/config'
          ? {
              default_payment_provider: 'stripe',
              available_providers: ['stripe'],
              default_currency: 'USD',
              supported_currencies: [
                { code: 'USD', name: 'US Dollar', symbol: '$' },
              ],
              cover_fees_enabled: true,
            }
          : {
              provider: 'stripe',
              donation_id: 101,
              client_secret: 'pi_secret',
              publishable_key: 'pk_test',
            },
    })
  }
}

describe('AuthenticatedGivingApi', () => {
  it('uses only relative protected API paths', async () => {
    const auth = new FakeAuth()
    const api = new AuthenticatedGivingApi(auth)

    await api.getConfig()
    await api.checkoutGeneral(
      {
        allocations: [{ amount: 20, fundId: 8 }],
        currency: 'USD',
      },
      'stripe',
    )

    expect(auth.calls.map((call) => call.path)).toEqual([
      '/v1/giving/config',
      '/v1/giving/checkout',
    ])
    const body = JSON.parse(String(auth.calls[1]?.init?.body))
    expect(body).toMatchObject({
      items: [{ amount: 20, fund_id: 8 }],
      payment_provider: 'stripe',
    })
    expect(body).not.toHaveProperty('member_id')
    expect(body).not.toHaveProperty('client_id')
  })

  it('maps authentication failures without exposing auth internals', async () => {
    const auth: TheFaithAppAuthorizedClient = {
      apiUrl: (path) =>
        new URL(path, 'https://api.thefaithapp.com').toString(),
      authorizedFetch: async () =>
        Response.json(
          { message: 'Member session has expired.' },
          { status: 401 },
        ),
    }
    const api = new AuthenticatedGivingApi(auth)

    await expect(api.getConfig()).rejects.toMatchObject({
      code: 'not_authenticated',
      statusCode: 401,
    })
  })

  it('rejects malformed successful envelopes', async () => {
    const auth: TheFaithAppAuthorizedClient = {
      apiUrl: (path) =>
        new URL(path, 'https://api.thefaithapp.com').toString(),
      authorizedFetch: async () => Response.json({ ok: true }),
    }
    const api = new AuthenticatedGivingApi(auth)

    await expect(api.getConfig()).rejects.toMatchObject({
      code: 'malformed_response',
    })
  })
})
