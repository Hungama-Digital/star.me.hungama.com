package com.hungama.starme.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hungama.starme.R
import com.hungama.starme.data.manifest.ShellDef
import com.hungama.starme.data.manifest.ShellManifest
import com.hungama.starme.state.StarUiState
import com.hungama.starme.ui.components.Eyebrow
import com.hungama.starme.ui.components.Lead
import com.hungama.starme.ui.components.ScreenHeading
import com.hungama.starme.ui.components.Stage
import com.hungama.starme.ui.theme.DisplayFontFamily
import com.hungama.starme.ui.theme.StarTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConceptScreen(
    manifest: ShellManifest,
    state: StarUiState,
    onSelectShell: (String) -> Unit,
    onSelectRole: (String) -> Unit,
) {
    val colors = StarTheme.colors
    var roleSheetVisible by remember { mutableStateOf(false) }

    Stage {
        Eyebrow("Step 4 · Your Story")
        ScreenHeading("Choose Your World")
        Lead("Swipe through original worlds. Tap a poster to step into the cast.")

        LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            items(manifest.shells) { shell ->
                WorldPoster(
                    shell = shell,
                    selected = state.shellId == shell.id,
                    onClick = {
                        if (shell.isLive) {
                            onSelectShell(shell.id)
                            roleSheetVisible = true
                        }
                    },
                )
            }
        }

        val selected = manifest.shell(state.shellId)
        if (selected != null) {
            Spacer(Modifier.height(22.dp))
            Text("CURRENT CASTING", color = colors.orange, style = MaterialTheme.typography.labelMedium)
            Text(selected.title, style = MaterialTheme.typography.headlineSmall)
            Text(
                if (state.roleId == null) "Choose a role to continue" else "Your role is selected · tap the poster to change it",
                color = if (state.roleId == null) colors.dim else colors.good,
            )
        }
    }

    val selected = manifest.shell(state.shellId)
    if (roleSheetVisible && selected != null) {
        ModalBottomSheet(
            onDismissRequest = { roleSheetVisible = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = colors.surface,
        ) {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                Text("Choose Your Role", style = MaterialTheme.typography.headlineSmall)
                Text("Who will you become in ${selected.title}?", color = colors.dim)
                Spacer(Modifier.height(18.dp))
                selected.roles.forEach { role ->
                    RoleCard(
                        name = role.name,
                        desc = role.desc,
                        selected = state.roleId == role.id,
                        onClick = {
                            onSelectRole(role.id)
                            roleSheetVisible = false
                        },
                    )
                    Spacer(Modifier.height(12.dp))
                }
                Spacer(Modifier.height(22.dp))
            }
        }
    }
}

@Composable
private fun WorldPoster(shell: ShellDef, selected: Boolean, onClick: () -> Unit) {
    val colors = StarTheme.colors
    val artwork = when (shell.id) {
        "love" -> R.drawable.story_love_keyart
        "act" -> R.drawable.story_action_keyart
        else -> if (shell.id.hashCode() % 2 == 0) R.drawable.story_love_keyart else R.drawable.story_action_keyart
    }
    Box(
        modifier = Modifier
            .size(width = 250.dp, height = 390.dp)
            .clip(RoundedCornerShape(22.dp))
            .alpha(if (shell.isLive) 1f else 0.48f)
            .border(if (selected) 3.dp else 1.dp, if (selected) colors.orange else colors.line, RoundedCornerShape(22.dp))
            .clickable(enabled = shell.isLive, onClick = onClick),
    ) {
        Image(
            painter = painterResource(artwork),
            contentDescription = "${shell.title} poster",
            contentScale = ContentScale.Crop,
            modifier = Modifier.matchParentSize(),
        )
        Box(Modifier.matchParentSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xF209090C)))))
        if (!shell.isLive) {
            Text(
                "COMING SOON",
                modifier = Modifier.align(Alignment.TopEnd).padding(12.dp).background(Color.Black.copy(alpha = .65f), RoundedCornerShape(30.dp)).padding(horizontal = 10.dp, vertical = 6.dp),
                color = Color.White,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Column(Modifier.align(Alignment.BottomStart).padding(18.dp)) {
            Text(shell.kicker.uppercase(), color = colors.gold, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Text(
                shell.title,
                fontFamily = DisplayFontFamily,
                fontSize = 25.sp,
                lineHeight = 28.sp,
                color = Color.White,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (shell.isLive) Text("TAP TO VIEW ROLES", color = Color.White.copy(alpha = .7f), fontSize = 10.sp)
        }
    }
}

@Composable
private fun RoleCard(name: String, desc: String, selected: Boolean, onClick: () -> Unit) {
    val colors = StarTheme.colors
    val interaction = remember { MutableInteractionSource() }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(if (selected) colors.surface2 else colors.surface)
            .border(2.dp, if (selected) colors.orange else colors.line, RoundedCornerShape(18.dp))
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(18.dp),
    ) {
        Text(name, style = MaterialTheme.typography.titleMedium)
        Text(
            desc,
            style = MaterialTheme.typography.bodySmall,
            color = colors.dim,
            modifier = Modifier.padding(top = 4.dp),
        )
        Text(
            if (selected) "SELECTED" else "CHOOSE ROLE",
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier
                .align(Alignment.End)
                .padding(top = 14.dp)
                .background(if (selected) colors.good else colors.orange, RoundedCornerShape(30.dp))
                .padding(horizontal = 16.dp, vertical = 9.dp),
        )
    }
}
