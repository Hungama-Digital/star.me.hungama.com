package com.hungama.starme.data.repo

import com.hungama.starme.data.local.ConsentDao
import com.hungama.starme.data.local.Order
import com.hungama.starme.data.local.OrderDao
import com.hungama.starme.data.local.OrderStatus
import kotlinx.coroutines.flow.Flow

/**
 * Orders. The non-negotiable lives here: **no order is created without a valid,
 * unrevoked consent ref** (spec §8). The DB also enforces the FK, but we fail
 * fast with a clear reason before touching the wallet.
 */
class OrderRepository(
    private val orderDao: OrderDao,
    private val consentDao: ConsentDao,
) {
    fun byIdFlow(id: Long): Flow<Order?> = orderDao.byIdFlow(id)
    fun allFlow(): Flow<List<Order>> = orderDao.allFlow()
    suspend fun byId(id: Long): Order? = orderDao.byId(id)

    /**
     * Creates a PENDING order after verifying consent. Returns the new order id,
     * or a failure describing why (used by the ViewModel to block the flow).
     */
    suspend fun createOrder(
        consentRef: String,
        shellId: String,
        roleId: String,
        packageId: String,
        episodesUnlocked: Int,
    ): Result<Long> {
        val consent = consentDao.byRef(consentRef)
            ?: return Result.failure(IllegalStateException("No consent on record for this order."))
        if (!consent.isValid) {
            return Result.failure(IllegalStateException("Consent $consentRef is revoked or incomplete."))
        }
        val order = Order(
            consentRef = consentRef,
            shellId = shellId,
            roleId = roleId,
            packageId = packageId,
            episodesUnlocked = episodesUnlocked,
            status = OrderStatus.PENDING,
            createdAt = System.currentTimeMillis(),
            readyAt = null,
        )
        return Result.success(orderDao.insert(order))
    }

    suspend fun markRendering(id: Long) =
        orderDao.updateStatus(id, OrderStatus.RENDERING, readyAt = null)

    suspend fun markReady(id: Long) =
        orderDao.updateStatus(id, OrderStatus.READY, readyAt = System.currentTimeMillis())

    suspend fun discardPending(id: Long) = orderDao.deletePending(id)
}
