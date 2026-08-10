package com.hungama.starme.network

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ApiContractTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun redeemRequestUsesServerFieldName() {
        val payload = json.encodeToString(RedeemRequest("single-use-code", "device-binding"))
        assertTrue(payload.contains("\"device_id\":\"device-binding\""))
    }

    @Test
    fun orderResponseDecodesSignedDeliveryFields() {
        val payload = """
            {
              "id":"order-1",
              "status":"READY",
              "shell_id":"synthetic-love-001",
              "role_id":"synthetic_lead",
              "package_id":"lead-debut-3",
              "jobs":[],
              "episodes":[{
                "episode_number":1,
                "checksum_sha256":"abc",
                "stream_url":"https://private.example/stream",
                "download_url":"https://private.example/download"
              }]
            }
        """.trimIndent()
        val order = json.decodeFromString<OrderDto>(payload)
        assertEquals("READY", order.status)
        assertEquals(1, order.episodes.single().episodeNumber)
        assertEquals("https://private.example/stream", order.episodes.single().streamUrl)
    }

    @Test
    fun capabilitiesDecodeServerManagedConsentVersion() {
        val payload = """
            {
              "identity_capture":false,
              "consent_collection":true,
              "consent_version":"development-placeholder-v1",
              "legal_text_status":"configured",
              "rendering":true,
              "media_delivery":true,
              "reason":"Internal staging configuration"
            }
        """.trimIndent()

        val capabilities = json.decodeFromString<CapabilityDto>(payload)

        assertEquals("development-placeholder-v1", capabilities.consentVersion)
        assertEquals("configured", capabilities.legalTextStatus)
    }
}
