package com.hungama.starme.state

import com.hungama.starme.network.ApiException

/**
 * Maps backend failures to honest tester-facing copy. The 503 consent case is an
 * intentional server-side Legal gate, not a defect, and must never read as one.
 */
internal object UserFacingErrors {

    fun consent(error: Throwable): String = when {
        error is ApiException && error.statusCode == 503 ->
            "Consent setup is awaiting Legal approval, so this step is paused for everyone. " +
                "Your photo and details stay safely on this device. No retake is needed once it opens."
        error is ApiException && error.statusCode == 401 ->
            "Tester session expired. Enter a new access code to continue."
        error is ApiException ->
            "Consent could not be recorded right now. Please try again in a moment."
        else ->
            "We couldn't reach StarME. Check your connection and try again."
    }

    fun order(error: Throwable): String = when {
        error is ApiException && error.statusCode == 401 ->
            "Tester session expired. Enter a new access code to continue."
        error is ApiException && error.statusCode == 409 ->
            "This consent is no longer active. Please complete consent again before ordering."
        error is ApiException ->
            "Your order could not be created right now. Please try again in a moment."
        else ->
            "We couldn't reach StarME. Check your connection and try again."
    }
}
