package com.hungama.starme.ui.screens

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.hungama.starme.state.StarUiState
import com.hungama.starme.ui.components.Eyebrow
import com.hungama.starme.ui.components.Lead
import com.hungama.starme.ui.components.ScreenHeading
import com.hungama.starme.ui.components.Stage
import com.hungama.starme.ui.components.StarButton
import com.hungama.starme.ui.theme.StarTheme

@Composable
fun AccessScreen(
    state: StarUiState,
    onCodeChanged: (String) -> Unit,
    onRedeem: () -> Unit,
) {
    val colors = StarTheme.colors
    Stage {
        Eyebrow("Private internal prototype")
        ScreenHeading("Enter your tester code")
        Lead("StarME is currently limited to named adult testers on approved devices.")
        Spacer(Modifier.height(18.dp))
        OutlinedTextField(
            value = state.accessCode,
            onValueChange = onCodeChanged,
            label = { Text("Single-use access code") },
            singleLine = true,
            // Access codes are case-sensitive (mixed case), so never force capitalization,
            // which silently corrupted the entered code (uppercased it) and failed redemption.
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None),
            modifier = Modifier.fillMaxWidth(),
        )
        state.accessError?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, style = MaterialTheme.typography.bodySmall, color = colors.orange)
        }
        Spacer(Modifier.height(18.dp))
        StarButton(
            label = if (state.authenticating) "Verifying…" else "Continue Securely",
            onClick = onRedeem,
            enabled = state.accessCode.length >= 8 && !state.authenticating,
        )
    }
}
