package com.hungama.starme.state

import android.graphics.Bitmap
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import com.hungama.starme.AppContainer
import com.hungama.starme.data.manifest.ShellManifest
import com.hungama.starme.face.FaceChecker
import com.hungama.starme.network.ConsentRequest
import com.hungama.starme.network.OrderRequest
import com.hungama.starme.util.Demo
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Owns the linear-flow state and every side effect that drives it. Screens read
 * [state] and call intents; the host ([MainActivity]) collects [events] for
 * navigation and snackbars.
 */
class StarViewModel(private val container: AppContainer) : ViewModel() {

    /** Parsed once; the manifest asset is tiny (spec §5, single source of truth). */
    val manifest: ShellManifest = container.manifest.load()

    private val faceChecker = FaceChecker()

    private val _state = MutableStateFlow(StarUiState())
    val state: StateFlow<StarUiState> = _state.asStateFlow()

    private val _events = Channel<StarEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    init {
        viewModelScope.launch {
            val authenticated = container.session.accessTokenOnce() != null
            _state.update { it.copy(authenticated = authenticated) }
            if (authenticated) _events.send(StarEvent.AccessGranted)
        }
        viewModelScope.launch { container.wallet.ensureInitialized() }
        // Mirror the wallet balance into UI state.
        viewModelScope.launch {
            container.wallet.creditsFlow.collect { c -> _state.update { it.copy(credits = c) } }
        }
        // Restore identity + consent so "Make another drama" and process death persist them.
        viewModelScope.launch {
            val subscribed = container.session.subscribedOnce()
            val ref = container.session.activeConsentRefOnce()
            val record = ref?.let { container.consent.byRef(it) }?.takeIf { it.isValid }
            _state.update {
                it.copy(
                    subscribed = subscribed,
                    consentRef = record?.ref,
                    signed = record != null,
                    name = record?.name ?: it.name,
                    photoPath = record?.photoUri ?: it.photoPath,
                    verified = record != null || it.verified,
                )
            }
        }
    }

    // ---- Controlled tester access ----
    fun onAccessCodeChanged(value: String) {
        _state.update {
            it.copy(
                accessCode = value.trim().take(100),
                accessError = null,
            )
        }
    }

    fun redeemAccessCode() {
        val code = _state.value.accessCode
        if (code.length < 8 || _state.value.authenticating) return
        viewModelScope.launch {
            _state.update { it.copy(authenticating = true, accessError = null) }
            runCatching { container.api.redeem(code, container.session.deviceBindingId()) }
                .onSuccess { remoteSession ->
                    container.session.setAccessToken(remoteSession.accessToken)
                    _state.update {
                        it.copy(
                            authenticating = false,
                            authenticated = true,
                            accessCode = "",
                        )
                    }
                    _events.send(StarEvent.AccessGranted)
                }
                .onFailure {
                    _state.update {
                        it.copy(
                            authenticating = false,
                            authenticated = false,
                            accessError = "That code is invalid, expired or already used.",
                        )
                    }
                }
        }
    }

    // ---- Subscribe (Step 1) ----
    fun onSubscribe() {
        if (_state.value.subscribing || _state.value.subscribed) {
            viewModelScope.launch { _events.send(StarEvent.SubscribeComplete) }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(subscribing = true) }
            val result = container.billing.purchaseSubscription(manifest.welcomeCredits)
            if (result.success) {
                container.wallet.add(result.creditsGranted)
                container.session.setSubscribed(true)
                _state.update { it.copy(subscribing = false, subscribed = true) }
                _events.send(StarEvent.Toast("Welcome to Fast TV · ${result.creditsGranted} credits added"))
                _events.send(StarEvent.SubscribeComplete)
            } else {
                _state.update { it.copy(subscribing = false) }
                _events.send(StarEvent.Error("Subscription could not be completed."))
            }
        }
    }

    // ---- Capture (Step 2) ----
    fun onNameChanged(name: String) {
        _state.update { it.copy(name = name.take(28)) }
    }

    fun onPhotoSelected(uri: Uri) {
        viewModelScope.launch {
            val file = runCatching { container.fileStore.copyImageToTemp(uri) }.getOrNull()
            if (file == null) {
                _events.send(StarEvent.Error("We couldn't read that photo. Try another."))
                return@launch
            }
            _state.update {
                it.copy(
                    photoFile = file,
                    photoPath = file.absolutePath,
                    verified = false,
                    verifyError = null,
                    verifyRows = defaultVerifyRows,
                )
            }
            runVerification()
        }
    }

    private suspend fun runVerification() {
        val file = _state.value.photoFile ?: return
        _state.update { it.copy(verifying = true, verified = false, verifyError = null, verifyRows = defaultVerifyRows) }

        val faceResult = runCatching { faceChecker.analyze(file) }
            .getOrElse { FaceChecker.Result(faceCount = 0, eyesOpen = false) }

        val rows = defaultVerifyRows.toMutableList()
        for (i in rows.indices) {
            rows[i] = rows[i].copy(state = VerifyState.CHECKING)
            _state.update { it.copy(verifyRows = rows.toList()) }
            kotlinx.coroutines.delay(Demo.VERIFY_ROW_MS)

            // Row index 1 is the real ML Kit gate: exactly one face (spec §8).
            if (i == FACE_ROW && !faceResult.singleFace) {
                rows[i] = rows[i].copy(state = VerifyState.FAILED)
                _state.update {
                    it.copy(
                        verifyRows = rows.toList(),
                        verifying = false,
                        verified = false,
                        verifyError = faceGuidance(faceResult.faceCount),
                    )
                }
                return
            }
            // Row index 2 (age) is a stub that passes; the real service fails closed (spec §8).
            rows[i] = rows[i].copy(state = VerifyState.PASSED)
            _state.update { it.copy(verifyRows = rows.toList()) }
        }
        _state.update { it.copy(verifying = false, verified = true, verifyError = null) }
        _events.send(StarEvent.Toast("Verified · this face is yours"))
    }

    private fun faceGuidance(faceCount: Int): String = when (faceCount) {
        0 -> "We couldn't find a face. Retake in even, front-facing light, no sunglasses, no filters."
        else -> "More than one face detected. StarME casts you and only you. Retake solo."
    }

    // ---- Consent (Step 3) ----
    fun onConsentSigned(signature: Bitmap, checkedA: Boolean, checkedB: Boolean) {
        if (!checkedA || !checkedB) return
        // Already have a valid ref this session: just re-arm the gate (no duplicate record).
        if (_state.value.consentRef != null) {
            _state.update { it.copy(signed = true) }
            return
        }
        _state.update { it.copy(consentSubmitFailed = false) }
        viewModelScope.launch {
            val token = container.session.accessTokenOnce()
            if (token == null) {
                _state.update { it.copy(consentSubmitFailed = true) }
                _events.send(StarEvent.Error("Tester session expired. Enter a new access code."))
                return@launch
            }
            val request = ConsentRequest(
                typedName = _state.value.name,
                consentVersion = "development-placeholder-v1",
                checkedLikeness = checkedA,
                checkedRevocation = checkedB,
                signatureAttested = true,
            )
            // Up to three attempts so a transient network blip cannot dead-end Step 3 in a demo.
            var lastError: Throwable? = null
            repeat(3) { attempt ->
                val result = runCatching { container.api.createConsent(token, request) }
                result.onSuccess { remote ->
                    val record = container.consent.recordConsent(
                        reference = remote.reference,
                        name = _state.value.name,
                        photoSource = _state.value.photoFile,
                        signature = signature,
                        checkedA = checkedA,
                        checkedB = checkedB,
                    )
                    container.session.setActiveConsent(record.ref, record.name)
                    _state.update {
                        it.copy(
                            consentRef = record.ref,
                            signed = true,
                            consentSubmitFailed = false,
                            photoPath = record.photoUri ?: it.photoPath,
                        )
                    }
                    return@launch
                }
                lastError = result.exceptionOrNull()
                if (attempt < 2) delay(1200)
            }
            _state.update { it.copy(consentSubmitFailed = true) }
            _events.send(StarEvent.Error(UserFacingErrors.consent(lastError ?: IllegalStateException("consent failed"))))
        }
    }

    fun onSignatureCleared() {
        _state.update { it.copy(signed = false) }
    }

    // ---- Concept (Step 4) ----
    fun selectShell(shellId: String) {
        _state.update { it.copy(shellId = shellId, roleId = null) }
    }

    fun selectRole(roleId: String) {
        _state.update { it.copy(roleId = roleId) }
    }

    // ---- Package (Step 5) ----
    fun selectPackage(packageId: String) {
        _state.update { it.copy(packageId = packageId) }
    }

    /**
     * Confirm: if short on credits, run the demo top-up; otherwise verify consent,
     * create the order and debit the wallet. Emits [StarEvent.OrderCreated] to
     * advance to Production.
     */
    fun onConfirmPackage() {
        val s = _state.value
        val pkg = manifest.pkg(s.packageId) ?: return
        val ref = s.consentRef
        if (ref == null) {
            viewModelScope.launch { _events.send(StarEvent.Error("Consent is required before ordering.")) }
            return
        }
        viewModelScope.launch {
            if (s.credits < pkg.credits) {
                val result = container.billing.purchaseCredits(Demo.TOP_UP_CREDITS)
                if (result.success) {
                    container.wallet.add(result.creditsGranted)
                    _events.send(StarEvent.Toast("${result.creditsGranted} credits added · demo"))
                    _events.send(StarEvent.CreditsToppedUp)
                }
                return@launch
            }
            val token = container.session.accessTokenOnce()
            if (token == null) {
                _events.send(StarEvent.Error("Tester session expired. Enter a new access code."))
                return@launch
            }
            val created = container.orders.createOrder(
                consentRef = ref,
                shellId = s.shellId.orEmpty(),
                roleId = s.roleId.orEmpty(),
                packageId = pkg.id,
                episodesUnlocked = pkg.episodes,
            )
            created.onSuccess { localId ->
                val remote = runCatching {
                    container.api.createOrder(
                        token,
                        OrderRequest(
                            consentReference = ref,
                            shellId = "ek-love-story-001",
                            roleId = s.roleId ?: "arjun",
                            packageId = "lead-debut-3",
                            faceAssetId = "synthetic-device-capture",
                        ),
                    )
                }
                remote.onSuccess { order ->
                    container.wallet.add(-pkg.credits)
                    _state.update {
                        it.copy(
                            orderId = localId,
                            remoteOrderId = order.id,
                            awaitingFirstLook = order.status == "AWAITING_FIRST_LOOK",
                            firstLookUrl = order.firstLook?.previewUrl,
                            remoteEpisodes = order.episodes,
                        )
                    }
                    _events.send(StarEvent.OrderCreated)
                }.onFailure { error ->
                    _events.send(StarEvent.Error(UserFacingErrors.order(error)))
                }
            }.onFailure { e ->
                _events.send(StarEvent.Error(e.message ?: "Order could not be created."))
            }
        }
    }

    // ---- Production (Step 6) ----
    fun schedulePremiereNotification(scheduler: (name: String) -> Unit) {
        scheduler(_state.value.name)
    }

    /**
     * Quiet background poll used by the production screen to auto-advance without the
     * tester tapping "Refresh": surfaces the first look when ready and opens the premiere
     * on READY. Transient failures are ignored so a blip does not interrupt the demo.
     */
    fun pollProductionStatus() {
        val remoteOrderId = _state.value.remoteOrderId ?: return
        viewModelScope.launch {
            val token = container.session.accessTokenOnce() ?: return@launch
            runCatching { container.api.order(token, remoteOrderId) }.onSuccess { order ->
                val ready = order.status == "READY"
                val awaiting = order.status == "AWAITING_FIRST_LOOK"
                _state.update {
                    it.copy(
                        awaitingFirstLook = awaiting,
                        renderComplete = ready,
                        firstLookUrl = order.firstLook?.previewUrl ?: it.firstLookUrl,
                        renderProgress = when {
                            ready -> 1f
                            awaiting -> 0.5f
                            else -> it.renderProgress
                        },
                        remoteEpisodes = if (order.episodes.isNotEmpty()) order.episodes else it.remoteEpisodes,
                    )
                }
                if (ready) {
                    _events.send(StarEvent.Toast("Now premiering · you"))
                    _events.send(StarEvent.RenderComplete)
                }
            }
        }
    }

    fun onStartRender() {
        val s = _state.value
        val remoteOrderId = s.remoteOrderId ?: return
        if (s.rendering) return
        viewModelScope.launch {
            _state.update { it.copy(rendering = true, renderComplete = false, renderProgress = 0f) }
            val token = container.session.accessTokenOnce() ?: return@launch
            runCatching { container.api.order(token, remoteOrderId) }
                .onSuccess { order ->
                    val ready = order.status == "READY"
                    val awaiting = order.status == "AWAITING_FIRST_LOOK"
                    _state.update {
                        it.copy(
                            rendering = false,
                            awaitingFirstLook = awaiting,
                            renderComplete = ready,
                            firstLookUrl = order.firstLook?.previewUrl,
                            renderStageLabel = when {
                                awaiting -> "First look ready for your approval"
                                ready -> "Ready to premiere"
                                else -> order.status
                            },
                            renderProgress = when {
                                ready -> 1f
                                awaiting -> 0.5f
                                else -> it.renderProgress
                            },
                            remoteEpisodes = order.episodes,
                        )
                    }
                    if (ready) {
                        _events.send(StarEvent.Toast("Now premiering · you"))
                        _events.send(StarEvent.RenderComplete)
                    }
                }
                .onFailure {
                    _state.update { it.copy(rendering = false) }
                    _events.send(StarEvent.Error("Render status could not be refreshed."))
                }
        }
    }

    fun approveFirstLook() {
        decideFirstLook("APPROVE")
    }

    fun requestRetake() {
        decideFirstLook("RETAKE")
    }

    private fun decideFirstLook(decision: String) {
        val orderId = _state.value.remoteOrderId ?: return
        viewModelScope.launch {
            val token = container.session.accessTokenOnce() ?: return@launch
            runCatching { container.api.decideFirstLook(token, orderId, decision) }
                .onSuccess { order ->
                    if (decision == "RETAKE") {
                        _state.update {
                            it.copy(
                                awaitingFirstLook = false,
                                retakeRequired = true,
                                verified = false,
                                photoFile = null,
                                photoPath = null,
                            )
                        }
                        _events.send(StarEvent.RetakeRequested)
                    } else {
                        _state.update {
                            it.copy(
                                awaitingFirstLook = false,
                                rendering = false,
                                renderComplete = order.status == "READY",
                                renderProgress = if (order.status == "READY") 1f else it.renderProgress,
                                renderStageLabel = order.status,
                                remoteEpisodes = order.episodes,
                            )
                        }
                        if (order.status == "READY") {
                            _events.send(StarEvent.Toast("Now premiering · you"))
                            _events.send(StarEvent.RenderComplete)
                        }
                    }
                }
                .onFailure { _events.send(StarEvent.Error("First-look decision could not be saved.")) }
        }
    }

    // ---- Premiere (Step 7) ----
    /** "Make another drama" — reset the story/order, keep identity + consent + credits. */
    fun onMakeAnother() {
        _state.update {
            it.copy(
                shellId = null,
                roleId = null,
                packageId = null,
                orderId = null,
                remoteOrderId = null,
                rendering = false,
                renderComplete = false,
                renderStageLabel = null,
                renderProgress = 0f,
                awaitingFirstLook = false,
                firstLookUrl = null,
                remoteEpisodes = emptyList(),
            )
        }
    }

    // ---- Settings ----
    fun revokeConsent(onDone: () -> Unit) {
        val ref = _state.value.consentRef ?: return
        viewModelScope.launch {
            val token = container.session.accessTokenOnce()
            if (token != null) {
                runCatching { container.api.revokeConsent(token, ref) }
                    .onFailure {
                        _events.send(StarEvent.Error("Server revocation failed; local data was not changed."))
                        return@launch
                    }
            }
            container.consent.revoke(ref)
            container.session.clearConsent()
            _state.update {
                it.copy(
                    consentRef = null,
                    signed = false,
                    photoFile = null,
                    photoPath = null,
                    verified = false,
                )
            }
            _events.send(StarEvent.Toast("Consent revoked · biometric data scheduled for deletion"))
            onDone()
        }
    }

    companion object {
        private const val FACE_ROW = 1

        fun factory(container: AppContainer): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
                    return StarViewModel(container) as T
                }
            }
    }
}
