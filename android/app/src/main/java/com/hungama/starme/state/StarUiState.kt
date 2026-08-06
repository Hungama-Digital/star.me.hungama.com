package com.hungama.starme.state

import com.hungama.starme.network.EpisodeDto
import java.io.File

/** Status of one row in the Capture verification sequence (spec §3.3). */
enum class VerifyState { WAITING, CHECKING, PASSED, FAILED }

data class VerifyRow(val label: String, val state: VerifyState = VerifyState.WAITING)

/** The four verification rows, in order. Row index 1 is the ML Kit face gate. */
val defaultVerifyRows: List<VerifyRow> = listOf(
    VerifyRow("Live selfie matches this photo"),
    VerifyRow("Face is yours · own face only"),
    VerifyRow("Age check · 18 and above"),
    VerifyRow("Photo quality for casting"),
)

/**
 * Single source of truth for the linear flow — the Compose analogue of the
 * demo's `state` object. Held by [StarViewModel], scoped to the activity.
 */
data class StarUiState(
    // Controlled prototype access
    val accessCode: String = "",
    val authenticating: Boolean = false,
    val authenticated: Boolean = false,
    val accessError: String? = null,

    // Membership / wallet
    val credits: Int = 0,
    val subscribed: Boolean = false,
    val subscribing: Boolean = false,

    // Identity
    val photoFile: File? = null,     // captured photo, pre-consent (may be null if restored)
    val photoPath: String? = null,   // absolute path for display
    val name: String = "",
    val verifying: Boolean = false,
    val verified: Boolean = false,
    val verifyRows: List<VerifyRow> = defaultVerifyRows,
    val verifyError: String? = null,

    // Consent
    val consentRef: String? = null,
    val signed: Boolean = false,

    // Story
    val shellId: String? = null,
    val roleId: String? = null,
    val packageId: String? = null,

    // Order + production
    val orderId: Long? = null,
    val remoteOrderId: String? = null,
    val rendering: Boolean = false,
    val renderComplete: Boolean = false,
    val renderStageLabel: String? = null,
    val renderProgress: Float = 0f,
    val awaitingFirstLook: Boolean = false,
    val firstLookUrl: String? = null,
    val retakeRequired: Boolean = false,
    val remoteEpisodes: List<EpisodeDto> = emptyList(),
) {
    val hasPhoto: Boolean get() = photoPath != null
    val canContinueCapture: Boolean get() = verified && name.isNotBlank()
    val canContinueConsent: Boolean get() = signed && consentRef != null
    val canContinueConcept: Boolean get() = shellId != null && roleId != null
}

/** One-shot events the host collects for navigation and snackbars. */
sealed interface StarEvent {
    data class Toast(val message: String) : StarEvent
    data object SubscribeComplete : StarEvent
    data object OrderCreated : StarEvent
    data object RenderComplete : StarEvent
    data object RetakeRequested : StarEvent
    data object CreditsToppedUp : StarEvent
    data object AccessGranted : StarEvent
    data class Error(val message: String) : StarEvent
}
