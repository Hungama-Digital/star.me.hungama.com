package com.hungama.starme.data.repo

import com.hungama.starme.data.local.Wallet
import com.hungama.starme.data.local.WalletDao
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/** Credit balance. Row id is always 1 (spec §4: `Wallet(id=1, credits)`). */
class WalletRepository(private val dao: WalletDao) {

    val creditsFlow: Flow<Int> = dao.creditsFlow().map { it ?: 0 }

    suspend fun ensureInitialized() {
        if (dao.credits() == null) dao.upsert(Wallet(id = 1, credits = 0))
    }

    suspend fun credits(): Int = dao.credits() ?: 0

    suspend fun add(delta: Int) {
        ensureInitialized()
        dao.addCredits(delta)
    }

    /** Debits [cost] atomically; returns false (no change) if the balance is short. */
    suspend fun tryDebit(cost: Int): Boolean {
        ensureInitialized()
        val current = dao.credits() ?: 0
        if (current < cost) return false
        dao.addCredits(-cost)
        return true
    }
}
