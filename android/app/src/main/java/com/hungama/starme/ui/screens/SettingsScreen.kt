package com.hungama.starme.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.hungama.starme.state.StarUiState
import com.hungama.starme.ui.components.Eyebrow
import com.hungama.starme.ui.components.Lead
import com.hungama.starme.ui.components.ScreenHeading
import com.hungama.starme.ui.components.SmallDim
import com.hungama.starme.ui.components.Stage
import com.hungama.starme.ui.components.StarButton
import com.hungama.starme.ui.components.StarButtonStyle
import com.hungama.starme.ui.components.StarCard
import com.hungama.starme.ui.components.tapClickable
import com.hungama.starme.ui.theme.StarTheme

@Composable
fun SettingsScreen(
    state: StarUiState,
    onRevoke: () -> Unit,
    onBack: () -> Unit,
) {
    val colors = StarTheme.colors
    var confirming by remember { mutableStateOf(false) }

    Stage {
        Text(
            "← Back",
            color = colors.dim,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier
                .padding(bottom = 10.dp)
                .tapClickable(onBack),
        )
        Eyebrow("Settings")
        ScreenHeading("Your likeness & consent")
        Lead("StarME casts you and only you. You are always in control of your face and your data.")

        if (state.consentRef != null) {
            StarCard {
                CardRow("Star name", state.name.ifBlank { "Not set" })
                Spacer(Modifier.height(10.dp))
                CardRow("Consent ref", state.consentRef)
                Spacer(Modifier.height(10.dp))
                CardRow("Status", "Active")
            }
            Spacer(Modifier.height(18.dp))
            Text(
                "Revoke consent",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = colors.text,
            )
            Spacer(Modifier.height(6.dp))
            SmallDim(
                "On revocation we stop any new renders immediately and delete your photo and face template within 30 days. " +
                    "Episodes you have already saved remain yours. Your consent record is kept for audit, without the biometric files."
            )
            Spacer(Modifier.height(14.dp))
            StarButton(
                label = "Revoke Consent & Delete My Biometrics",
                style = StarButtonStyle.GHOST,
                onClick = { confirming = true },
            )
        } else {
            StarCard {
                Text(
                    "No active consent on record.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.text,
                )
                Spacer(Modifier.height(6.dp))
                SmallDim("Start a debut to add a signed consent and identity.")
            }
        }
    }

    if (confirming) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text("Revoke consent?") },
            text = {
                Text(
                    "This stops new renders and deletes your photo and face template. " +
                        "You can subscribe and re-consent anytime. This cannot be undone."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirming = false
                    onRevoke()
                }) { Text("Revoke", color = colors.orange) }
            },
            dismissButton = {
                TextButton(onClick = { confirming = false }) { Text("Keep consent", color = colors.dim) }
            },
            containerColor = colors.surface,
        )
    }
}

@Composable
private fun CardRow(label: String, value: String) {
    val colors = StarTheme.colors
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = colors.dim)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = colors.text)
    }
}
