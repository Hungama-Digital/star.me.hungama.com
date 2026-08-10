package com.hungama.starme.data.repo

import android.graphics.Bitmap
import com.hungama.starme.data.local.ConsentDao
import com.hungama.starme.data.local.ConsentRecord
import com.hungama.starme.util.FileStore
import kotlinx.coroutines.flow.Flow
import java.io.File
import java.security.SecureRandom
import java.time.Year

/**
 * "Consent is not a screen, it is a record." Creates, reads and revokes
 * [ConsentRecord]s and owns the on-device biometric files that back them.
 */
class ConsentRepository(
    private val dao: ConsentDao,
    private val fileStore: FileStore,
) {
    val allFlow: Flow<List<ConsentRecord>> = dao.allFlow()

    suspend fun byRef(ref: String): ConsentRecord? = dao.byRef(ref)

    suspend fun isValid(ref: String): Boolean = dao.byRef(ref)?.isValid == true

    /**
     * Persists a signed consent: generates `STARME-{year}-{6 alphanum}`, commits
     * the photo + signature to internal storage, writes the record. Returns it.
     */
    suspend fun recordConsent(
        reference: String? = null,
        name: String,
        photoSource: File?,
        signature: Bitmap?,
        checkedA: Boolean,
        checkedB: Boolean,
        consentVersion: String,
    ): ConsentRecord {
        val ref = reference ?: generateRef()
        val (photoPath, sigPath) = fileStore.commitConsentAssets(ref, photoSource, signature)
        val record = ConsentRecord(
            ref = ref,
            name = name,
            photoUri = photoPath,
            signaturePngUri = sigPath,
            consentVersion = consentVersion,
            checkedA = checkedA,
            checkedB = checkedB,
            signedAtEpoch = System.currentTimeMillis(),
            revokedAtEpoch = null,
        )
        dao.insert(record)
        return record
    }

    /**
     * Revocation: stamp revokedAtEpoch, delete the photo + signature files, null
     * their DB columns, but keep the record row for auditability (spec §4).
     */
    suspend fun revoke(ref: String) {
        dao.revoke(ref, System.currentTimeMillis())
        dao.clearBiometricFiles(ref)
        fileStore.deleteConsentAssets(ref)
    }

    private fun generateRef(): String {
        val year = Year.now().value
        val sb = StringBuilder(6)
        repeat(6) { sb.append(ALPHANUM[random.nextInt(ALPHANUM.length)]) }
        return "STARME-$year-$sb"
    }

    companion object {
        private const val ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        private val random = SecureRandom()
    }
}
