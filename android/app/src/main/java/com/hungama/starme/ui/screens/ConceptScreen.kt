package com.hungama.starme.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import com.hungama.starme.data.manifest.ShellDef
import com.hungama.starme.data.manifest.ShellManifest
import com.hungama.starme.state.StarUiState
import com.hungama.starme.ui.components.Eyebrow
import com.hungama.starme.ui.components.Lead
import com.hungama.starme.ui.components.ScreenHeading
import com.hungama.starme.ui.components.Stage
import com.hungama.starme.ui.theme.DisplayFontFamily
import com.hungama.starme.ui.theme.StarPalette
import com.hungama.starme.ui.theme.StarTheme

@Composable
fun ConceptScreen(
    manifest: ShellManifest,
    state: StarUiState,
    onSelectShell: (String) -> Unit,
    onSelectRole: (String) -> Unit,
) {
    val colors = StarTheme.colors
    Stage {
        Eyebrow("Step 4 · Your story")
        ScreenHeading("Pick your world")
        Lead("Two worlds are casting now. Four more open soon.")

        // 2-column shell grid, in manifest order, with a staggered entrance.
        var entered by remember { mutableStateOf(false) }
        LaunchedEffect(Unit) { entered = true }
        manifest.shells.chunked(2).forEach { pair ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                pair.forEachIndexed { _, shell ->
                    val index = manifest.shells.indexOf(shell)
                    AnimatedVisibility(
                        visible = entered,
                        enter = fadeIn(tween(320, delayMillis = index * 70)) +
                            slideInVertically(tween(320, delayMillis = index * 70)) { it / 6 },
                        modifier = Modifier.weight(1f),
                    ) {
                        ShellCard(
                            shell = shell,
                            loveStyle = index % 2 == 0,
                            selected = state.shellId == shell.id,
                            onClick = { if (shell.isLive) onSelectShell(shell.id) },
                        )
                    }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }

        // Role picker appears after a shell is chosen, sliding into place.
        val selectedShell = manifest.shell(state.shellId)
        if (selectedShell != null && selectedShell.isLive) {
            var roleEntered by remember(selectedShell.id) { mutableStateOf(false) }
            LaunchedEffect(selectedShell.id) { roleEntered = true }
            AnimatedVisibility(
                visible = roleEntered,
                enter = fadeIn(tween(260)) + expandVertically(tween(260)),
            ) {
                Column {
            Spacer(Modifier.height(4.dp))
            Text(
                "YOUR ROLE",
                color = colors.dim,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp,
                letterSpacing = 0.14.em,
                modifier = Modifier.padding(bottom = 8.dp),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                selectedShell.roles.forEach { role ->
                    RoleCard(
                        name = role.name,
                        desc = role.desc,
                        selected = state.roleId == role.id,
                        modifier = Modifier.weight(1f),
                        onClick = { onSelectRole(role.id) },
                    )
                }
            }
                }
            }
        }
    }
}

@Composable
private fun ShellCard(
    shell: ShellDef,
    loveStyle: Boolean,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val colors = StarTheme.colors
    val gradient = if (loveStyle) {
        Brush.radialGradient(
            colors = listOf(StarPalette.Love2, StarPalette.Love1, Color(0xFF0E0710)),
            center = Offset(360f, 0f),
            radius = 700f,
        )
    } else {
        Brush.radialGradient(
            colors = listOf(StarPalette.Act2, StarPalette.Act1, Color(0xFF070C12)),
            center = Offset(120f, 0f),
            radius = 700f,
        )
    }
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .aspectRatio(3f / 4.1f)
            .clip(RoundedCornerShape(16.dp))
            .alpha(if (shell.isLive) 1f else 0.45f)
            .background(gradient)
            .border(
                width = 2.dp,
                color = if (selected) colors.orange else colors.line,
                shape = RoundedCornerShape(16.dp),
            )
            .clickable(
                enabled = shell.isLive,
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .padding(14.dp),
    ) {
        // Bottom scrim for legibility
        Box(
            Modifier
                .matchParentSize()
                .background(
                    Brush.verticalGradient(0.4f to Color.Transparent, 1f to Color(0xE6080608))
                )
        )
        if (!shell.isLive) {
            Text(
                "SOON",
                color = colors.dim,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.14.em,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0x8C000000))
                    .border(1.dp, colors.line, RoundedCornerShape(999.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
        Column(modifier = Modifier.align(Alignment.BottomStart)) {
            Text(
                text = shell.title,
                fontFamily = DisplayFontFamily,
                fontWeight = FontWeight.Black,
                fontSize = 21.sp,
                lineHeight = 22.sp,
                color = colors.text,
            )
            Text(
                text = shell.kicker.uppercase(),
                color = Color(0xFFD8CFE2),
                fontSize = 10.sp,
                letterSpacing = 0.18.em,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}

@Composable
private fun RoleCard(
    name: String,
    desc: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val colors = StarTheme.colors
    val interaction = remember { MutableInteractionSource() }
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(if (selected) StarPalette.Surface2 else colors.surface)
            .border(
                2.dp,
                if (selected) colors.orange else colors.line,
                RoundedCornerShape(14.dp),
            )
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 16.dp),
    ) {
        Text(name, style = MaterialTheme.typography.titleMedium, color = colors.text)
        Spacer(Modifier.height(4.dp))
        Text(desc, style = MaterialTheme.typography.bodySmall, color = colors.dim)
    }
}
