// src/starme/services/billing.ts
// BillingRepository interface + the FakeBillingRepository (guide section 12.5),
// kept trivial so the swap to react-native-iap is isolated to this file.
export type BillingResult = { success: boolean; creditsGranted: number };

export interface BillingRepository {
  purchaseSubscription(welcomeCredits: number): Promise<BillingResult>; // rupees 499/yr
  purchaseCredits(amount: number): Promise<BillingResult>; // consumable top-up
}

/** Demo top-up is a flat 250 credits, not the exact shortfall. Intentional. */
export const TOP_UP_CREDITS = 250;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class FakeBillingRepository implements BillingRepository {
  async purchaseSubscription(welcomeCredits: number): Promise<BillingResult> {
    await sleep(150); // token latency, exercises the pending state
    return { success: true, creditsGranted: welcomeCredits };
  }
  async purchaseCredits(amount: number): Promise<BillingResult> {
    await sleep(150);
    return { success: true, creditsGranted: amount };
  }
}

export const billing: BillingRepository = new FakeBillingRepository();
