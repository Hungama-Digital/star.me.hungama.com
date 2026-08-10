package com.hungama.starme.state

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class IdentityAssetStateTest {
    @Test
    fun stagingLocalChecksCanContinueWithoutPretendingProviderActivation() {
        val state = StarUiState(
            name = "Synthetic Tester",
            verified = true,
            identityProviderEnabled = false,
            identityAssetState = IdentityAssetState.STAGING_LOCAL_ONLY,
        )

        assertTrue(state.canContinueCapture)
    }

    @Test
    fun realProviderModeFailsClosedUntilAssetIsActive() {
        val awaiting = StarUiState(
            name = "Synthetic Tester",
            verified = true,
            identityProviderEnabled = true,
            identityAssetState = IdentityAssetState.AWAITING_LIVENESS,
        )

        assertFalse(awaiting.canContinueCapture)
        assertTrue(awaiting.copy(identityAssetState = IdentityAssetState.ACTIVE).canContinueCapture)
    }
}
