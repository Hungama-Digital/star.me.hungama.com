package com.hungama.starme.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import com.hungama.starme.data.manifest.ShellManifest
import com.hungama.starme.state.StarUiState
import com.hungama.starme.ui.components.CheckLine
import com.hungama.starme.ui.components.Eyebrow
import com.hungama.starme.ui.components.Lead
import com.hungama.starme.ui.components.ScreenHeading
import com.hungama.starme.ui.components.StarCard
import com.hungama.starme.ui.components.StarButton
import com.hungama.starme.ui.components.StarButtonStyle
import com.hungama.starme.ui.components.Stage
import com.hungama.starme.ui.theme.DisplayFontFamily
import com.hungama.starme.ui.theme.StarTheme
import com.hungama.starme.util.Demo
import kotlinx.coroutines.delay

@Composable
fun ProductionScreen(
    manifest: ShellManifest,
    state: StarUiState,
    onScheduleNotification: () -> Unit,
    onApproveFirstLook: () -> Unit,
    onRetake: () -> Unit,
) {
    val colors = StarTheme.colors
    val shell = manifest.shell(state.shellId)
    val pkg = manifest.pkg(state.packageId)

    // Schedule the premiere notification once, in parallel with the countdown (spec §3.7).
    LaunchedEffect(state.orderId) {
        if (state.orderId != null) onScheduleNotification()
    }

    // Countdown ticks while not rendering.
    var secondsLeft by remember { mutableIntStateOf(Demo.COUNTDOWN_SECONDS - 1) }
    LaunchedEffect(state.rendering) {
        if (!state.rendering) {
            while (secondsLeft > 0 && !state.rendering) {
                delay(1000)
                secondsLeft -= 1
            }
        }
    }

    val progress by animateFloatAsState(targetValue = state.renderProgress, label = "renderProgress")

    Stage {
        Eyebrow("In production")
        ScreenHeading(if (state.rendering) "Rolling." else "Lights. Camera. You.")
        Lead(
            if (state.rendering)
                "Fast-forwarding twelve hours for the demo. This is the pipeline your subscribers never see."
            else
                "Our studio is directing your drama now. We will notify you the moment it premieres."
        )

        StarCard {
            if (state.awaitingFirstLook) {
                Text(
                    "Your protected first look is ready. Approve it to release the three-episode render, or retake your identity capture.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.text,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    StarButton(
                        label = "Retake",
                        onClick = onRetake,
                        style = StarButtonStyle.GHOST,
                        modifier = Modifier.weight(1f),
                    )
                    StarButton(
                        label = "Approve",
                        onClick = onApproveFirstLook,
                        modifier = Modifier.weight(1f),
                    )
                }
                return@StarCard
            }
            if (!state.rendering && !state.renderComplete) {
                Row(
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    formatCountdown(secondsLeft).forEach { ch ->
                        AnimatedContent(
                            targetState = ch,
                            transitionSpec = {
                                (slideInVertically(tween(220)) { -it } + fadeIn(tween(220))) togetherWith
                                    (slideOutVertically(tween(220)) { it } + fadeOut(tween(160)))
                            },
                            label = "countdownDigit",
                        ) { digit ->
                            Text(
                                text = digit.toString(),
                                fontFamily = DisplayFontFamily,
                                fontWeight = FontWeight.Black,
                                fontSize = 64.sp,
                                letterSpacing = 0.04.em,
                                color = colors.text,
                            )
                        }
                    }
                }
                Text(
                    "UNTIL YOUR PREMIERE",
                    color = colors.dim,
                    fontSize = 11.sp,
                    letterSpacing = 0.3.em,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                )
            } else {
                // Renderer
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(colors.line),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(progress.coerceIn(0f, 1f))
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(Brush.horizontalGradient(listOf(colors.orange, colors.gold)))
                    )
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    text = state.renderStageLabel ?: "Preparing your shoot…",
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.dim,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        Spacer(Modifier.height(14.dp))
        val summary = buildString {
            append(pkg?.name ?: "Your debut")
            append(" · ")
            append(pkg?.episodes ?: 0)
            append(if ((pkg?.episodes ?: 0) > 1) " episodes of " else " episode of ")
            append(shell?.title ?: "your drama")
            append(" starring ")
            append(state.name.ifBlank { "you" })
        }
        CheckLine(summary)
        CheckLine("Consent ref ${state.consentRef ?: "pending"} attached to this render")
        CheckLine("Human quality check before delivery · one free re-render if we miss")
    }
}

private fun formatCountdown(totalSeconds: Int): String {
    val h = totalSeconds / 3600
    val m = (totalSeconds % 3600) / 60
    val s = totalSeconds % 60
    return "%02d:%02d:%02d".format(h, m, s)
}
