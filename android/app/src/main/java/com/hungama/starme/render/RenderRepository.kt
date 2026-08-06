package com.hungama.starme.render

import kotlinx.coroutines.flow.Flow

/**
 * The render service boundary — **the one class to swap** when real in-video
 * face transfer replaces the client-side illusion (spec "two truths" #1 and §7).
 *
 * Future real contract (spec §7), implemented later behind this same interface:
 * ```
 * POST   /v1/orders      { consentRef, shellId, roleId, packageId, faceAssetId } -> { orderId, status }
 * GET    /v1/orders/{id} -> { status: QUEUED|RENDERING|QA|READY|FAILED, episodes:[{n,url,checksum}], posterUrl, trailerUrl }
 * POST   /v1/consents    { record + signature blob } -> { consentRef }
 * DELETE /v1/consents/{ref}   // revocation: stop renders, delete biometrics
 * ```
 * The real implementation would POST the order, then poll GET until READY,
 * translating server status into the same [RenderProgress] stream the UI reads.
 */
interface RenderRepository {
    /** Emits one [RenderProgress] per pipeline stage; the last has `done = true`. */
    fun render(request: RenderRequest): Flow<RenderProgress>
}

data class RenderRequest(
    val consentRef: String,
    val name: String,
    val shellId: String,
    val shellTitle: String,
    val roleId: String,
    val packageId: String,
)

data class RenderProgress(
    val stageIndex: Int,   // 1-based
    val total: Int,
    val label: String,
    val done: Boolean,
)

/** Mirrors the future server statuses (spec §7) for when the real repo lands. */
enum class RemoteRenderStatus { QUEUED, RENDERING, QA, READY, FAILED }
