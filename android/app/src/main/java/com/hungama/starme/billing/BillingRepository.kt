package com.hungama.starme.billing

import kotlinx.coroutines.delay

/**
 * Simulated billing. No real payments in this build — Google Play Billing drops
 * in behind this interface later (spec §1). Every method reports what *would*
 * have been charged and how many credits to grant.
 */
interface BillingRepository {
    /** ₹499/yr Fast TV membership. Grants welcome credits on success. */
    suspend fun purchaseSubscription(welcomeCredits: Int): BillingResult

    /** Demo credit top-up (Play Billing consumable later). */
    suspend fun purchaseCredits(amount: Int): BillingResult
}

data class BillingResult(
    val success: Boolean,
    val creditsGranted: Int,
)

/**
 * Demo implementation: always succeeds, instantly. Kept deliberately trivial so
 * the swap to real Play Billing is isolated to this file.
 */
class FakeBillingRepository : BillingRepository {

    override suspend fun purchaseSubscription(welcomeCredits: Int): BillingResult {
        delay(150) // token latency so the UI's pending state is exercised
        return BillingResult(success = true, creditsGranted = welcomeCredits)
    }

    override suspend fun purchaseCredits(amount: Int): BillingResult {
        delay(150)
        return BillingResult(success = true, creditsGranted = amount)
    }
}
