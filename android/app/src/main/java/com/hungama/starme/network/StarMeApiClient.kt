package com.hungama.starme.network

import com.hungama.starme.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.net.HttpURLConnection
import java.net.URL

@Serializable
data class RedeemRequest(val code: String, @SerialName("device_id") val deviceId: String)

@Serializable
data class SessionDto(
    @SerialName("access_token") val accessToken: String,
    @SerialName("expires_at") val expiresAt: String,
)

@Serializable
data class CapabilityDto(
    @SerialName("identity_capture") val identityCapture: Boolean,
    @SerialName("consent_collection") val consentCollection: Boolean,
    @SerialName("consent_version") val consentVersion: String? = null,
    @SerialName("legal_text_status") val legalTextStatus: String,
    val rendering: Boolean,
    @SerialName("media_delivery") val mediaDelivery: Boolean,
    val reason: String,
)

@Serializable
data class ConsentRequest(
    @SerialName("typed_name") val typedName: String,
    @SerialName("consent_version") val consentVersion: String,
    @SerialName("checked_likeness") val checkedLikeness: Boolean,
    @SerialName("checked_revocation") val checkedRevocation: Boolean,
    @SerialName("signature_attested") val signatureAttested: Boolean,
)

@Serializable
data class ConsentDto(val reference: String)

@Serializable
data class OrderRequest(
    @SerialName("consent_reference") val consentReference: String,
    @SerialName("shell_id") val shellId: String,
    @SerialName("role_id") val roleId: String,
    @SerialName("package_id") val packageId: String,
    @SerialName("face_asset_id") val faceAssetId: String,
)

@Serializable
data class FirstLookDto(val status: String, @SerialName("preview_url") val previewUrl: String? = null)

@Serializable
data class EpisodeDto(
    @SerialName("episode_number") val episodeNumber: Int,
    @SerialName("checksum_sha256") val checksumSha256: String,
    @SerialName("stream_url") val streamUrl: String,
    @SerialName("download_url") val downloadUrl: String,
)

@Serializable
data class OrderDto(
    val id: String,
    val status: String,
    @SerialName("shell_id") val shellId: String,
    @SerialName("role_id") val roleId: String,
    @SerialName("package_id") val packageId: String,
    @SerialName("first_look") val firstLook: FirstLookDto? = null,
    val episodes: List<EpisodeDto> = emptyList(),
)

@Serializable
data class FirstLookDecisionRequest(val decision: String)

class ApiException(val statusCode: Int, message: String) : IllegalStateException(message)

class StarMeApiClient(
    private val baseUrl: String = BuildConfig.STARME_API_BASE_URL.trimEnd('/'),
) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun capabilities(): CapabilityDto = call("GET", "/v1/capabilities")

    suspend fun redeem(code: String, deviceId: String): SessionDto =
        call("POST", "/v1/access/redeem", json.encodeToString(RedeemRequest(code, deviceId)))

    suspend fun createConsent(token: String, request: ConsentRequest): ConsentDto =
        call("POST", "/v1/consents", json.encodeToString(request), token)

    suspend fun createOrder(token: String, request: OrderRequest): OrderDto =
        call("POST", "/v1/orders", json.encodeToString(request), token)

    suspend fun order(token: String, orderId: String): OrderDto =
        call("GET", "/v1/orders/$orderId", token = token)

    suspend fun decideFirstLook(token: String, orderId: String, decision: String): OrderDto =
        call(
            "POST",
            "/v1/orders/$orderId/first-look",
            json.encodeToString(FirstLookDecisionRequest(decision)),
            token,
        )

    suspend fun revokeConsent(token: String, reference: String) {
        callText("DELETE", "/v1/consents/$reference", token = token)
    }

    private suspend inline fun <reified T> call(
        method: String,
        path: String,
        body: String? = null,
        token: String? = null,
    ): T = json.decodeFromString(callText(method, path, body, token))

    private suspend fun callText(
        method: String,
        path: String,
        body: String? = null,
        token: String? = null,
    ): String = withContext(Dispatchers.IO) {
        val connection = (URL("$baseUrl$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 30_000
            setRequestProperty("Accept", "application/json")
            if (token != null) setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                outputStream.bufferedWriter().use { it.write(body) }
            }
        }
        try {
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val payload = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) throw ApiException(status, payload.ifBlank { "Request failed" })
            payload
        } finally {
            connection.disconnect()
        }
    }
}
