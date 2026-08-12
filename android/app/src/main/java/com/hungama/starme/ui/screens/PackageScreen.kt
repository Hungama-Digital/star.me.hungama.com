package com.hungama.starme.ui.screens

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import com.hungama.starme.data.manifest.PackageDef
import com.hungama.starme.data.manifest.ShellManifest
import com.hungama.starme.state.StarUiState
import com.hungama.starme.ui.components.Coin
import com.hungama.starme.ui.components.Eyebrow
import com.hungama.starme.ui.components.Lead
import com.hungama.starme.ui.components.ScreenHeading
import com.hungama.starme.ui.components.SmallDim
import com.hungama.starme.ui.components.Stage
import com.hungama.starme.ui.components.StarButton
import com.hungama.starme.ui.theme.DisplayFontFamily
import com.hungama.starme.ui.theme.StarPalette
import com.hungama.starme.ui.theme.StarTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PackageScreen(
    manifest: ShellManifest,
    state: StarUiState,
    onSelectPackage: (String) -> Unit,
) {
    val colors = StarTheme.colors
    var previewPackage by remember { mutableStateOf<PackageDef?>(null) }
    Stage {
        Eyebrow("Step 5 · Your billing")
        ScreenHeading("How big is your debut?")
        Lead("Every tier premieres with your poster and your name in the credits.")

        manifest.packages.forEach { pkg ->
            PackageRow(
                pkg = pkg,
                selected = state.packageId == pkg.id,
                onClick = { previewPackage = pkg },
            )
        }

        val selected = manifest.pkg(state.packageId)
        if (selected != null) {
            Spacer(Modifier.height(4.dp))
            val note = if (selected.credits <= state.credits) {
                "Covered by your credit balance of ${state.credits}."
            } else {
                "You have ${state.credits} credits. Top up the balance to confirm."
            }
            SmallDim(note)
        }
    }

    previewPackage?.let { pkg ->
        ModalBottomSheet(
            onDismissRequest = { previewPackage = null },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = colors.surface,
        ) {
            Column(Modifier.padding(horizontal = 22.dp, vertical = 8.dp)) {
                Text(pkg.name, style = MaterialTheme.typography.headlineSmall)
                Text(pkg.desc, color = colors.dim, modifier = Modifier.padding(top = 4.dp))
                Spacer(Modifier.height(20.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("${pkg.episodes} Episodes", fontWeight = FontWeight.Bold)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Coin(14)
                        Text("  ${pkg.credits} Credits", fontWeight = FontWeight.Bold)
                    }
                }
                Spacer(Modifier.height(22.dp))
                StarButton(
                    label = "Choose ${pkg.name}",
                    onClick = {
                        onSelectPackage(pkg.id)
                        previewPackage = null
                    },
                )
                Spacer(Modifier.height(26.dp))
            }
        }
    }
}

@Composable
private fun PackageRow(
    pkg: PackageDef,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val colors = StarTheme.colors
    val interaction = remember { MutableInteractionSource() }
    Column(modifier = Modifier.padding(bottom = 11.dp)) {
        if (pkg.highlight) {
            Text(
                "MOST CHOSEN",
                color = colors.gold,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.12.em,
                modifier = Modifier.padding(start = 4.dp, bottom = 4.dp),
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(if (selected) StarPalette.Surface2 else colors.surface)
                .border(
                    2.dp,
                    if (selected) colors.orange else colors.line,
                    RoundedCornerShape(16.dp),
                )
                .clickable(interactionSource = interaction, indication = null, onClick = onClick)
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Episode numeral
            Column(
                modifier = Modifier.width(44.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = "${pkg.episodes}",
                    fontFamily = DisplayFontFamily,
                    fontWeight = FontWeight.Black,
                    fontSize = 26.sp,
                    color = colors.gold,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = if (pkg.episodes > 1) "EPS" else "EP",
                    fontSize = 9.sp,
                    letterSpacing = 0.14.em,
                    color = colors.dim,
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(pkg.name, style = MaterialTheme.typography.titleMedium, color = colors.text)
                Text(pkg.desc, style = MaterialTheme.typography.bodySmall, color = colors.dim)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Coin(12)
                Text(
                    "${pkg.credits}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = colors.text,
                )
            }
        }
    }
}
