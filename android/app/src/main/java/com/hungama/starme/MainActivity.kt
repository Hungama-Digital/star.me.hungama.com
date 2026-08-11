package com.hungama.starme

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddCircle
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.hungama.starme.state.StarEvent
import com.hungama.starme.state.StarUiState
import com.hungama.starme.state.StarViewModel
import com.hungama.starme.ui.components.StarButton
import com.hungama.starme.ui.components.StarStepper
import com.hungama.starme.ui.components.StarTopBar
import com.hungama.starme.ui.nav.Routes
import com.hungama.starme.ui.nav.Step
import com.hungama.starme.ui.screens.CaptureScreen
import com.hungama.starme.ui.screens.AccessScreen
import com.hungama.starme.ui.screens.ConceptScreen
import com.hungama.starme.ui.screens.ConsentScreen
import com.hungama.starme.ui.screens.PackageScreen
import com.hungama.starme.ui.screens.PremiereScreen
import com.hungama.starme.ui.screens.ProductionScreen
import com.hungama.starme.ui.screens.ProjectsScreen
import com.hungama.starme.ui.screens.PromoScreen
import com.hungama.starme.ui.screens.SettingsScreen
import com.hungama.starme.ui.screens.SubscribeScreen
import com.hungama.starme.ui.theme.StarMeTheme
import com.hungama.starme.ui.theme.StarPalette
import com.hungama.starme.work.PremiereNotificationWorker
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as StarMeApp).container
        setContent {
            StarMeTheme {
                StarApp(container)
            }
        }
    }
}

@Composable
private fun StarApp(container: AppContainer) {
    val vm: StarViewModel = viewModel(factory = StarViewModel.factory(container))
    val state by vm.state.collectAsStateWithLifecycle()
    val nav = rememberNavController()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    val backEntry by nav.currentBackStackEntryAsState()
    val route = backEntry?.destination?.route
    val step = Step.fromRoute(route)
    val showProductNavigation = state.authenticated && route in setOf(
        Step.PROMO.route,
        Step.PRODUCTION.route,
        Step.PREMIERE.route,
        Routes.PROJECTS,
        Routes.SETTINGS,
    )

    // One-shot events → navigation + snackbars.
    LaunchedEffect(Unit) {
        vm.events.collect { event ->
            when (event) {
                is StarEvent.Toast -> scope.launch { snackbar.showSnackbar(event.message) }
                is StarEvent.Error -> scope.launch { snackbar.showSnackbar(event.message) }
                StarEvent.SubscribeComplete -> nav.navigateStep(Step.CAPTURE)
                StarEvent.OrderCreated -> nav.navigateStep(Step.PRODUCTION)
                StarEvent.RenderComplete -> nav.navigateStep(Step.PREMIERE)
                StarEvent.CreditsToppedUp -> Unit // stay on Package
                StarEvent.AccessGranted -> nav.navigate(Step.PROMO.route) {
                    popUpTo(Routes.ACCESS) { inclusive = true }
                }
                StarEvent.RetakeRequested -> nav.navigate(Step.CAPTURE.route) {
                    popUpTo(Step.CAPTURE.route) { inclusive = true }
                }
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(Color(0xFF291329), StarPalette.Bg),
                    radius = 1500f,
                ),
            ),
    ) {
    Scaffold(
        containerColor = Color.Transparent,
        topBar = {
            Column(modifier = Modifier.statusBarsPadding()) {
                StarTopBar(credits = state.credits, walletVisible = state.subscribed || state.credits > 0)
                StarStepper(current = Routes.stepperIndex(route), total = Routes.STEP_COUNT)
            }
        },
        bottomBar = {
            Column {
                if (step != null) {
                    CtaDock { CtaButton(step = step, state = state, vm = vm, nav = nav) }
                }
                if (showProductNavigation) {
                    ProductNavigation(
                        route = route,
                        onHome = { nav.navigateProductRoot(Step.PROMO.route) },
                        onCreate = { nav.navigateProductRoot(nextCreationRoute(state)) },
                        onProjects = { nav.navigateProductRoot(Routes.PROJECTS) },
                        onProfile = { nav.navigateProductRoot(Routes.SETTINGS) },
                    )
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = if (state.authenticated) Step.PROMO.route else Routes.ACCESS,
            modifier = Modifier
                .fillMaxSize()
                .padding(
                    top = padding.calculateTopPadding(),
                    bottom = padding.calculateBottomPadding(),
                ),
            enterTransition = {
                slideInHorizontally(tween(320)) { it / 4 } + fadeIn(tween(320))
            },
            exitTransition = {
                slideOutHorizontally(tween(320)) { -it / 5 } + fadeOut(tween(220))
            },
            popEnterTransition = {
                slideInHorizontally(tween(320)) { -it / 4 } + fadeIn(tween(320))
            },
            popExitTransition = {
                slideOutHorizontally(tween(320)) { it / 5 } + fadeOut(tween(220))
            },
        ) {
            composable(Routes.ACCESS) {
                AccessScreen(
                    state = state,
                    onCodeChanged = vm::onAccessCodeChanged,
                    onRedeem = vm::redeemAccessCode,
                )
            }
            composable(Step.PROMO.route) { PromoScreen() }
            composable(Step.SUBSCRIBE.route) { SubscribeScreen(welcomeCredits = vm.manifest.welcomeCredits) }
            composable(Step.CAPTURE.route) {
                CaptureScreen(
                    state = state,
                    onNameChanged = vm::onNameChanged,
                    onPhotoSelected = vm::onPhotoSelected,
                )
            }
            composable(Step.CONSENT.route) {
                ConsentScreen(
                    state = state,
                    onSigned = vm::onConsentSigned,
                    onSignatureCleared = vm::onSignatureCleared,
                )
            }
            composable(Step.CONCEPT.route) {
                ConceptScreen(
                    manifest = vm.manifest,
                    state = state,
                    onSelectShell = vm::selectShell,
                    onSelectRole = vm::selectRole,
                )
            }
            composable(Step.PACKAGE.route) {
                PackageScreen(
                    manifest = vm.manifest,
                    state = state,
                    onSelectPackage = vm::selectPackage,
                )
            }
            composable(Step.PRODUCTION.route) {
                ProductionScreen(
                    manifest = vm.manifest,
                    state = state,
                    onScheduleNotification = {
                        vm.schedulePremiereNotification { name ->
                            PremiereNotificationWorker.schedule(context, name)
                        }
                    },
                    onApproveFirstLook = vm::approveFirstLook,
                    onRetake = vm::requestRetake,
                    onRefresh = vm::pollProductionStatus,
                )
            }
            composable(Step.PREMIERE.route) {
                PremiereScreen(
                    manifest = vm.manifest,
                    state = state,
                    downloadRepo = container.downloads,
                    fileStore = container.fileStore,
                    onOpenSettings = { nav.navigate(Routes.SETTINGS) },
                )
            }
            composable(Routes.SETTINGS) {
                SettingsScreen(
                    state = state,
                    onRevoke = { vm.revokeConsent { nav.popBackStack() } },
                    onBack = { nav.popBackStack() },
                )
            }
            composable(Routes.PROJECTS) {
                ProjectsScreen(
                    manifest = vm.manifest,
                    state = state,
                    onCreate = { nav.navigateProductRoot(nextCreationRoute(state)) },
                    onOpenProject = {
                        nav.navigateProductRoot(
                            if (state.renderComplete) Step.PREMIERE.route else Step.PRODUCTION.route
                        )
                    },
                )
            }
        }
    }
    }
}

private data class ProductDestination(
    val label: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val selected: Boolean,
    val onClick: () -> Unit,
)

@Composable
private fun ProductNavigation(
    route: String?,
    onHome: () -> Unit,
    onCreate: () -> Unit,
    onProjects: () -> Unit,
    onProfile: () -> Unit,
) {
    val items = listOf(
        ProductDestination("Home", Icons.Rounded.Home, route == Step.PROMO.route, onHome),
        ProductDestination("Create", Icons.Rounded.AddCircle, false, onCreate),
        ProductDestination(
            "Premieres",
            Icons.Rounded.Movie,
            route == Routes.PROJECTS || route == Step.PRODUCTION.route || route == Step.PREMIERE.route,
            onProjects,
        ),
        ProductDestination("Profile", Icons.Rounded.Person, route == Routes.SETTINGS, onProfile),
    )
    NavigationBar(
        containerColor = StarPalette.Surface.copy(alpha = 0.98f),
        tonalElevation = 8.dp,
        modifier = Modifier.navigationBarsPadding(),
    ) {
        items.forEach { item ->
            NavigationBarItem(
                selected = item.selected,
                onClick = item.onClick,
                icon = { Icon(item.icon, contentDescription = item.label) },
                label = { Text(item.label) },
            )
        }
    }
}

private fun nextCreationRoute(state: StarUiState): String = when {
    !state.subscribed -> Step.SUBSCRIBE.route
    !state.canContinueCapture -> Step.CAPTURE.route
    !state.canContinueConsent -> Step.CONSENT.route
    !state.canContinueConcept -> Step.CONCEPT.route
    state.packageId == null -> Step.PACKAGE.route
    state.renderComplete -> Step.CONCEPT.route
    state.remoteOrderId != null || state.orderId != null -> Step.PRODUCTION.route
    else -> Step.PACKAGE.route
}

private fun NavHostController.navigateProductRoot(route: String) {
    navigate(route) {
        launchSingleTop = true
        restoreState = true
    }
}

/** The persistent bottom CTA dock with the demo's fade-up gradient. */
@Composable
private fun CtaDock(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .background(Brush.verticalGradient(listOf(Color.Transparent, StarPalette.Bg.copy(alpha = 0.94f))))
            .navigationBarsPadding()
            .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 18.dp),
    ) {
        content()
    }
}

@Composable
private fun CtaButton(
    step: Step,
    state: StarUiState,
    vm: StarViewModel,
    nav: NavHostController,
) {
    when (step) {
        Step.PROMO -> StarButton("Start Your Debut", { nav.navigateStep(Step.SUBSCRIBE) })
        Step.SUBSCRIBE -> StarButton(
            label = if (state.subscribing) "Subscribing…"
            else "Subscribe · ₹499 And Claim ${vm.manifest.welcomeCredits} Credits",
            onClick = { vm.onSubscribe() },
            enabled = !state.subscribing,
        )
        Step.CAPTURE -> StarButton(
            label = if (state.canContinueCapture) "Continue To Consent" else "Add Your Photo And Name",
            onClick = { nav.navigateStep(Step.CONSENT) },
            enabled = state.canContinueCapture,
        )
        Step.CONSENT -> StarButton(
            label = if (state.canContinueConsent) "Continue · Consent Recorded" else "Tick Both Boxes And Sign",
            onClick = { nav.navigateStep(Step.CONCEPT) },
            enabled = state.canContinueConsent,
        )
        Step.CONCEPT -> StarButton(
            label = if (state.canContinueConcept) "Continue" else "Choose A Story And Role",
            onClick = { nav.navigateStep(Step.PACKAGE) },
            enabled = state.canContinueConcept,
        )
        Step.PACKAGE -> {
            val pkg = vm.manifest.pkg(state.packageId)
            when {
                pkg == null -> StarButton("Choose Your Billing", {}, enabled = false)
                pkg.credits > state.credits -> StarButton(
                    "Add ${pkg.credits - state.credits} Credits · Demo Top-Up",
                    { vm.onConfirmPackage() },
                )
                else -> StarButton("Confirm · ${pkg.credits} Credits", { vm.onConfirmPackage() })
            }
        }
        Step.PRODUCTION -> StarButton(
            if (state.awaitingFirstLook) "Approve First Look" else "Refresh Production Status",
            if (state.awaitingFirstLook) vm::approveFirstLook else vm::onStartRender,
            enabled = !state.rendering && !state.renderComplete,
        )
        Step.PREMIERE -> StarButton(
            "Make Another Drama",
            {
                vm.onMakeAnother()
                nav.navigate(Step.CONCEPT.route) {
                    popUpTo(Step.CONCEPT.route) { inclusive = true }
                    launchSingleTop = true
                }
            },
        )
    }
}

private fun NavHostController.navigateStep(step: Step) {
    navigate(step.route) { launchSingleTop = true }
}
