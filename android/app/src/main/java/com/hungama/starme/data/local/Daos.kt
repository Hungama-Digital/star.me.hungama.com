package com.hungama.starme.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface WalletDao {
    @Query("SELECT credits FROM wallet WHERE id = 1")
    fun creditsFlow(): Flow<Int?>

    @Query("SELECT credits FROM wallet WHERE id = 1")
    suspend fun credits(): Int?

    @Upsert
    suspend fun upsert(wallet: Wallet)

    @Query("UPDATE wallet SET credits = credits + :delta WHERE id = 1")
    suspend fun addCredits(delta: Int)
}

@Dao
interface ConsentDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(record: ConsentRecord)

    @Query("SELECT * FROM consent_records WHERE ref = :ref")
    suspend fun byRef(ref: String): ConsentRecord?

    @Query("SELECT * FROM consent_records ORDER BY signedAtEpoch DESC")
    fun allFlow(): Flow<List<ConsentRecord>>

    @Query("UPDATE consent_records SET revokedAtEpoch = :epoch WHERE ref = :ref")
    suspend fun revoke(ref: String, epoch: Long)

    @Query("UPDATE consent_records SET photoUri = NULL, signaturePngUri = NULL WHERE ref = :ref")
    suspend fun clearBiometricFiles(ref: String)
}

@Dao
interface OrderDao {
    @Insert
    suspend fun insert(order: Order): Long

    @Query("SELECT * FROM orders WHERE id = :id")
    suspend fun byId(id: Long): Order?

    @Query("SELECT * FROM orders WHERE id = :id")
    fun byIdFlow(id: Long): Flow<Order?>

    @Query("SELECT * FROM orders ORDER BY createdAt DESC")
    fun allFlow(): Flow<List<Order>>

    @Query("UPDATE orders SET status = :status, readyAt = :readyAt WHERE id = :id")
    suspend fun updateStatus(id: Long, status: OrderStatus, readyAt: Long?)

    @Query("DELETE FROM orders WHERE id = :id AND status = 'PENDING'")
    suspend fun deletePending(id: Long)
}

@Dao
interface DownloadDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(episode: DownloadedEpisode)

    @Query("SELECT * FROM downloaded_episodes WHERE orderId = :orderId")
    fun forOrderFlow(orderId: Long): Flow<List<DownloadedEpisode>>

    @Query("SELECT EXISTS(SELECT 1 FROM downloaded_episodes WHERE orderId = :orderId AND epNumber = :ep)")
    suspend fun isDownloaded(orderId: Long, ep: Int): Boolean

    @Query("DELETE FROM downloaded_episodes WHERE orderId = :orderId")
    suspend fun deleteForOrder(orderId: Long)
}
