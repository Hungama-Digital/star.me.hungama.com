package com.hungama.starme.state

import com.hungama.starme.network.ApiException
import java.io.IOException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class UserFacingErrorsTest {

    @Test
    fun consentGate503ExplainsLegalApprovalNotAServerFault() {
        val message = UserFacingErrors.consent(
            ApiException(503, "Legal-approved consent version is not configured"),
        )
        assertTrue(message.contains("awaiting Legal approval"))
        assertFalse(message.contains("private server"))
    }

    @Test
    fun consent401AsksForNewAccessCode() {
        val message = UserFacingErrors.consent(ApiException(401, "Bearer token is required"))
        assertTrue(message.contains("Enter a new access code"))
    }

    @Test
    fun consentUnknownApiErrorSuggestsRetry() {
        val message = UserFacingErrors.consent(ApiException(500, "Internal error"))
        assertTrue(message.contains("try again"))
        assertFalse(message.contains("private server"))
    }

    @Test
    fun consentNetworkFailureMentionsConnection() {
        val message = UserFacingErrors.consent(IOException("timeout"))
        assertTrue(message.contains("connection"))
    }

    @Test
    fun order409ExplainsInactiveConsent() {
        val message = UserFacingErrors.order(ApiException(409, "Active consent is required"))
        assertTrue(message.contains("consent is no longer active"))
    }

    @Test
    fun order401AndConsent401UseTheSameSessionCopy() {
        assertEquals(
            UserFacingErrors.consent(ApiException(401, "expired")),
            UserFacingErrors.order(ApiException(401, "expired")),
        )
    }

    @Test
    fun orderNetworkFailureMentionsConnection() {
        val message = UserFacingErrors.order(IOException("unreachable"))
        assertTrue(message.contains("connection"))
    }
}
