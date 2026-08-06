package com.hungama.starme.render

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * Demo render pipeline: the five stages from the spec/demo, 1.1s each. The
 * personalisation itself is the client-side illusion (poster + face-zone
 * overlay) drawn elsewhere; this repo only simulates the studio timeline.
 */
class FakeRenderRepository : RenderRepository {

    override fun render(request: RenderRequest): Flow<RenderProgress> = flow {
        val stages = listOf(
            "Casting ${request.name.ifBlank { "you" }} into ${request.shellTitle}",
            "Transferring your performance, shot by shot",
            "Directing scenes and continuity",
            "Scoring, credits and final cut",
            "Quality check · identity match passed",
        )
        stages.forEachIndexed { index, label ->
            delay(STAGE_MS)
            emit(
                RenderProgress(
                    stageIndex = index + 1,
                    total = stages.size,
                    label = label,
                    done = index == stages.lastIndex,
                )
            )
        }
    }

    companion object {
        const val STAGE_MS = 1100L
    }
}
