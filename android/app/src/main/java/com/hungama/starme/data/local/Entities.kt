package com.hungama.starme.data.local

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Room schema — 1:1 with spec §4.
 *
 *   ConsentRecord(ref PK, name, photoUri, signaturePngUri, consentVersion,
 *                 checkedA, checkedB, signedAtEpoch, revokedAtEpoch?)
 *   Wallet(id=1, credits)
 *   Order(id PK, consentRef FK, shellId, roleId, packageId, episodesUnlocked,
 *         status[PENDING|RENDERING|READY], createdAt, readyAt?)
 *   DownloadedEpisode(orderId, shellId, epNumber, localUri, downloadedAt)
 */

@Entity(tableName = "consent_records")
data class ConsentRecord(
    @PrimaryKey val ref: String,
    val name: String,
    val photoUri: String?,
    val signaturePngUri: String?,
    val consentVersion: String,
    val checkedA: Boolean,
    val checkedB: Boolean,
    val signedAtEpoch: Long,
    val revokedAtEpoch: Long? = null,
) {
    val isRevoked: Boolean get() = revokedAtEpoch != null
    val isValid: Boolean get() = checkedA && checkedB && !isRevoked
}

@Entity(tableName = "wallet")
data class Wallet(
    @PrimaryKey val id: Int = 1,
    val credits: Int,
)

enum class OrderStatus { PENDING, RENDERING, READY }

@Entity(
    tableName = "orders",
    foreignKeys = [
        ForeignKey(
            entity = ConsentRecord::class,
            parentColumns = ["ref"],
            childColumns = ["consentRef"],
            onDelete = ForeignKey.RESTRICT,
        ),
    ],
    indices = [Index("consentRef")],
)
data class Order(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val consentRef: String,
    val shellId: String,
    val roleId: String,
    val packageId: String,
    val episodesUnlocked: Int,
    val status: OrderStatus,
    val createdAt: Long,
    val readyAt: Long? = null,
)

@Entity(
    tableName = "downloaded_episodes",
    primaryKeys = ["orderId", "epNumber"],
    indices = [Index("orderId")],
)
data class DownloadedEpisode(
    val orderId: Long,
    val shellId: String,
    val epNumber: Int,
    val localUri: String,
    val downloadedAt: Long,
)
