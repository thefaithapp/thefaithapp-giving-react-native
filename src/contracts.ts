import type {
  CampaignGivingRequest,
  GeneralGivingRequest,
  GivingCampaign,
  GivingCheckoutSession,
  GivingConfig,
  GivingFund,
  GivingPaymentStatus,
  GivingSubscription,
  GivingTarget,
} from './models'

/**
 * The narrow surface supplied by @thefaithapp/auth-react-native.
 * The giving SDK never accepts member/client IDs or raw credentials.
 */
export interface TheFaithAppAuthorizedClient {
  apiUrl(path: string, query?: Record<string, string>): string
  authorizedFetch(path: string, init?: RequestInit): Promise<Response>
}

export interface GivingApi {
  readonly apiOrigin: string
  getConfig(): Promise<GivingConfig>
  getFunds(): Promise<readonly GivingFund[]>
  getCampaign(campaignId: number): Promise<GivingCampaign>
  getSubscriptions(): Promise<readonly GivingSubscription[]>
  cancelSubscription(
    target: GivingTarget,
    subscriptionId: number,
  ): Promise<void>
  checkoutGeneral(
    request: GeneralGivingRequest,
    provider: string,
  ): Promise<GivingCheckoutSession>
  checkoutCampaign(
    campaignId: number,
    request: CampaignGivingRequest,
    provider: string,
  ): Promise<GivingCheckoutSession>
  getStatus(
    target: GivingTarget,
    donationId: number,
  ): Promise<GivingPaymentStatus>
  abandonCheckout(target: GivingTarget, donationId: number): Promise<void>
  capturePayPal(
    target: GivingTarget,
    session: GivingCheckoutSession,
  ): Promise<void>
  verifyFlutterwave(
    target: GivingTarget,
    session: GivingCheckoutSession,
    transactionId: string,
  ): Promise<void>
}
