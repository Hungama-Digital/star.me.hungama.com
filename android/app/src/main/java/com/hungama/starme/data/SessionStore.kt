package com.hungama.starme.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.util.UUID

private val Context.dataStore by preferencesDataStore(name = "starme_session")

/**
 * Lightweight session flags (spec §1: DataStore for session flags). Room holds
 * the durable records; this remembers whether the member is subscribed and
 * which consent ref is the active identity, so "Make another drama" and process
 * death keep identity + consent.
 */
class SessionStore(context: Context) {

    private val ds = context.applicationContext.dataStore

    val subscribed: Flow<Boolean> = ds.data.map { it[KEY_SUBSCRIBED] ?: false }
    val activeConsentRef: Flow<String?> = ds.data.map { it[KEY_CONSENT_REF] }
    val starName: Flow<String> = ds.data.map { it[KEY_NAME] ?: "" }
    val accessToken: Flow<String?> = ds.data.map { it[KEY_ACCESS_TOKEN] }
    val activeRemoteOrderId: Flow<String?> = ds.data.map { it[KEY_REMOTE_ORDER_ID] }
    val activeLocalOrderId: Flow<Long?> = ds.data.map { it[KEY_LOCAL_ORDER_ID]?.toLongOrNull() }

    suspend fun subscribedOnce(): Boolean = subscribed.first()
    suspend fun activeConsentRefOnce(): String? = activeConsentRef.first()
    suspend fun accessTokenOnce(): String? = accessToken.first()
    suspend fun activeRemoteOrderIdOnce(): String? = activeRemoteOrderId.first()
    suspend fun activeLocalOrderIdOnce(): Long? = activeLocalOrderId.first()

    suspend fun setAccessToken(token: String) {
        ds.edit { it[KEY_ACCESS_TOKEN] = token }
    }

    suspend fun clearAccessToken() {
        ds.edit { it.remove(KEY_ACCESS_TOKEN) }
    }

    suspend fun deviceBindingId(): String {
        val existing = ds.data.first()[KEY_DEVICE_BINDING]
        if (existing != null) return existing
        val generated = UUID.randomUUID().toString()
        ds.edit { preferences ->
            if (preferences[KEY_DEVICE_BINDING] == null) {
                preferences[KEY_DEVICE_BINDING] = generated
            }
        }
        return ds.data.first()[KEY_DEVICE_BINDING] ?: generated
    }

    suspend fun setSubscribed(value: Boolean) {
        ds.edit { it[KEY_SUBSCRIBED] = value }
    }

    suspend fun setActiveConsent(ref: String?, name: String) {
        ds.edit {
            if (ref == null) it.remove(KEY_CONSENT_REF) else it[KEY_CONSENT_REF] = ref
            it[KEY_NAME] = name
        }
    }

    suspend fun clearConsent() {
        ds.edit { it.remove(KEY_CONSENT_REF) }
    }

    suspend fun setActiveOrder(remoteOrderId: String, localOrderId: Long) {
        ds.edit {
            it[KEY_REMOTE_ORDER_ID] = remoteOrderId
            it[KEY_LOCAL_ORDER_ID] = localOrderId.toString()
        }
    }

    suspend fun clearActiveOrder() {
        ds.edit {
            it.remove(KEY_REMOTE_ORDER_ID)
            it.remove(KEY_LOCAL_ORDER_ID)
        }
    }

    private companion object {
        val KEY_SUBSCRIBED = booleanPreferencesKey("subscribed")
        val KEY_CONSENT_REF = stringPreferencesKey("active_consent_ref")
        val KEY_NAME = stringPreferencesKey("star_name")
        val KEY_ACCESS_TOKEN = stringPreferencesKey("access_token")
        val KEY_DEVICE_BINDING = stringPreferencesKey("device_binding_id")
        val KEY_REMOTE_ORDER_ID = stringPreferencesKey("active_remote_order_id")
        val KEY_LOCAL_ORDER_ID = stringPreferencesKey("active_local_order_id")
    }
}
