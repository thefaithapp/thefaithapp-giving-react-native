import { describe, expect, it } from 'vitest'
import planDenial from './fixtures/plan-product-unavailable.json'
import { AuthenticatedGivingApi } from '../src/api'
import type { TheFaithAppAuthorizedClient } from '../src/contracts'

class FakeAuth implements TheFaithAppAuthorizedClient {
  readonly calls: { path: string; init?: RequestInit }[] = []

  apiUrl(path: string): string {
    return new URL(path, 'https://api.thefaithapp.com').toString()
  }

  async authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
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
  function rejectingApi(payload: unknown, status = 403) {
    return new AuthenticatedGivingApi({
      apiUrl: (path) => new URL(path, 'https://api.thefaithapp.com').toString(),
      authorizedFetch: async () => Response.json(payload, { status }),
    })
  }

  // Matches EnsurePlanProduct's public envelope on protected giving routes.
  it('keeps the actual plan denial distinct from an expired session', async () => {
    await expect(rejectingApi(planDenial).getConfig()).rejects.toMatchObject({
      code: 'plan_access_denied',
      statusCode: 403,
      message: planDenial.message,
      serverErrorCode: 'plan_product_unavailable',
      planAccess: {
        type: 'product',
        product: 'platform_integrations',
        currentPlan: 'free',
        recommendedPlan: 'large',
      },
    })
  })

  it('recognizes the entitlement-denied envelope without retaining raw fields', async () => {
    const payload = {
      error_code: 'plan_entitlement_required',
      plan_access: {
        type: 'entitlement',
        entitlement: 'some_feature',
        current_plan: 'free',
        recommended_plan: null,
        token: 'must-not-be-retained',
      },
      token: 'must-not-be-retained',
    }
    const error = await rejectingApi(payload)
      .getConfig()
      .catch((value: unknown) => value)
    expect(error).toMatchObject({
      code: 'plan_access_denied',
      serverErrorCode: 'plan_entitlement_required',
      planAccess: {
        type: 'entitlement',
        entitlement: 'some_feature',
        currentPlan: 'free',
      },
    })
    expect(error).not.toHaveProperty('token')
    expect((error as { planAccess: object }).planAccess).not.toHaveProperty(
      'token',
    )
    expect(Object.isFrozen((error as { planAccess: object }).planAccess)).toBe(
      true,
    )
  })

  it.each([
    { message: 'You cannot access this resource.' },
    { error_code: 'another_permission', plan_access: planDenial.plan_access },
    {
      error_code: ['plan_product_unavailable'],
      plan_access: planDenial.plan_access,
    },
    {
      error_code: 'plan_product_unavailable\n',
      plan_access: planDenial.plan_access,
    },
  ])(
    'treats other or malformed 403 codes as forbidden: %j',
    async (payload) => {
      const error = await rejectingApi(payload)
        .getConfig()
        .catch((value: unknown) => value)
      expect(error).toMatchObject({ code: 'forbidden', statusCode: 403 })
      expect((error as { planAccess?: object }).planAccess).toBeUndefined()
    },
  )

  it.each([
    null,
    [],
    'raw',
    { type: 'product' },
    { type: 'unknown', product: 'x' },
    { type: 'entitlement', entitlement: 'some_feature' },
  ])(
    'ignores malformed plan context without losing the plan denial: %j',
    async (plan_access) => {
      const error = await rejectingApi({ ...planDenial, plan_access })
        .getConfig()
        .catch((value: unknown) => value)
      expect(error).toMatchObject({
        code: 'plan_access_denied',
        serverErrorCode: 'plan_product_unavailable',
      })
      expect((error as { planAccess?: object }).planAccess).toBeUndefined()
    },
  )

  it('retains only bounded plan identifiers from a valid plan context', async () => {
    const error = await rejectingApi({
      ...planDenial,
      plan_access: {
        ...planDenial.plan_access,
        current_plan: { secret: 'not-an-identifier' },
        recommended_plan: 'large\n',
        authorization: 'must-not-be-retained',
      },
    })
      .getConfig()
      .catch((value: unknown) => value)
    expect((error as { planAccess: object }).planAccess).toEqual({
      type: 'product',
      product: 'platform_integrations',
      currentPlan: undefined,
      recommendedPlan: undefined,
    })
  })

  it('preserves the real API key 401 shape and does not treat it as plan denial', async () => {
    await expect(
      rejectingApi(
        { success: false, error_message: 'Invalid API key.' },
        401,
      ).getConfig(),
    ).rejects.toMatchObject({
      code: 'not_authenticated',
      statusCode: 401,
    })
    const error = await rejectingApi(planDenial, 401)
      .getConfig()
      .catch((value: unknown) => value)
    expect(error).toMatchObject({ code: 'not_authenticated', statusCode: 401 })
    expect((error as { planAccess?: object }).planAccess).toBeUndefined()
  })

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
      apiUrl: (path) => new URL(path, 'https://api.thefaithapp.com').toString(),
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
      apiUrl: (path) => new URL(path, 'https://api.thefaithapp.com').toString(),
      authorizedFetch: async () => Response.json({ ok: true }),
    }
    const api = new AuthenticatedGivingApi(auth)

    await expect(api.getConfig()).rejects.toMatchObject({
      code: 'malformed_response',
    })
  })
})
