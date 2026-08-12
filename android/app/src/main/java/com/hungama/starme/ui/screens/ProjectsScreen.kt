package com.hungama.starme.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.hungama.starme.data.manifest.ShellManifest
import com.hungama.starme.R
import com.hungama.starme.state.StarUiState
import com.hungama.starme.ui.components.Lead
import com.hungama.starme.ui.components.ScreenHeading
import com.hungama.starme.ui.components.Stage
import com.hungama.starme.ui.components.StarButton
import com.hungama.starme.ui.components.StarButtonStyle
import com.hungama.starme.ui.theme.StarTheme

@Composable
fun ProjectsScreen(
    manifest: ShellManifest,
    state: StarUiState,
    onCreate: () -> Unit,
    onOpenProject: () -> Unit,
) {
    val colors = StarTheme.colors
    val shell = manifest.shell(state.shellId)
    Stage {
        ScreenHeading("My Premieres")
        Lead("Your stories, first looks and finished episodes live here.")

        if (state.remoteOrderId != null || state.orderId != null) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(listOf(colors.surface2, colors.surface)),
                        RoundedCornerShape(24.dp),
                    )
                    .padding(20.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Image(
                        painter = painterResource(
                            if (shell?.id == "act") R.drawable.story_action_keyart else R.drawable.story_love_keyart
                        ),
                        contentDescription = "${shell?.title ?: "Project"} thumbnail",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(width = 92.dp, height = 126.dp).clip(RoundedCornerShape(14.dp)),
                    )
                    Column {
                        Text(shell?.title ?: "Your StarME Story", style = MaterialTheme.typography.titleLarge)
                        Text(
                            when {
                                state.renderComplete -> "Premiere Ready"
                                state.awaitingFirstLook -> "First Look Ready"
                                state.rendering -> state.renderStageLabel ?: "In Production"
                                else -> "Project Created"
                            },
                            color = if (state.renderComplete) colors.good else colors.orange,
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                }
                Spacer(Modifier.height(18.dp))
                StarButton(
                    label = if (state.renderComplete) "Watch Premiere" else "View Production",
                    onClick = onOpenProject,
                )
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.surface, RoundedCornerShape(24.dp))
                    .padding(horizontal = 24.dp, vertical = 36.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(Icons.Rounded.AutoAwesome, contentDescription = null, tint = colors.gold)
                Spacer(Modifier.height(12.dp))
                Text("Your First Premiere Starts Here", fontWeight = FontWeight.Bold)
                Text(
                    "Choose a world, step into a role and create your personalised drama.",
                    color = colors.dim,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(vertical = 12.dp),
                )
                StarButton("Create A Drama", onCreate, style = StarButtonStyle.GHOST)
            }
        }
    }
}
