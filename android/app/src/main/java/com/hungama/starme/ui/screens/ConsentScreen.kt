package com.hungama.starme.ui.screens

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
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
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import com.hungama.starme.state.StarUiState
import com.hungama.starme.ui.components.Eyebrow
import com.hungama.starme.ui.components.Lead
import com.hungama.starme.ui.components.ScreenHeading
import com.hungama.starme.ui.components.SignaturePad
import com.hungama.starme.ui.components.StarButton
import com.hungama.starme.ui.components.SmallDim
import com.hungama.starme.ui.components.Stage
import com.hungama.starme.ui.components.rememberSignatureController
import com.hungama.starme.ui.theme.StarPalette
import com.hungama.starme.ui.theme.StarTheme
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay

private data class ConsentSection(val heading: String, val body: String)

private val CONSENT_SECTIONS = listOf(
    ConsentSection(
        "What you are agreeing to",
        "You grant Hungama Digital Media Entertainment a licence to use the photo you provided and a face template derived from it, solely to create the personalised Micro Drama episodes you order on StarME, including your poster and trailer.",
    ),
    ConsentSection(
        "What we will never do",
        "We will not use your likeness in advertising, in other people's dramas or to train models, and we will never place any other person's face in your drama or your face in anyone else's without a separate verified consent from that person.",
    ),
    ConsentSection(
        "Generation partner",
        "Rendering uses licensed third party generation technology. Your signed consent is recorded against every render, as required by our generation partner's norms for real-person likenesses.",
    ),
    ConsentSection(
        "Your controls",
        "You can revoke this consent at any time in Settings. On revocation we stop new renders immediately and delete your photo and face template within 30 days. Delivered episodes you choose to keep remain yours.",
    ),
    ConsentSection(
        "Provenance",
        "Every episode carries content credentials and a watermark identifying it as AI personalised content, so your drama is always clearly yours and clearly crafted.",
    ),
    ConsentSection(
        "Eligibility",
        "StarME is for adults. Our checks refuse any face assessed as under 18, with no manual override.",
    ),
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ConsentScreen(
    state: StarUiState,
    onSigned: (Bitmap, Boolean, Boolean) -> Unit,
    onSignatureCleared: () -> Unit,
) {
    val colors = StarTheme.colors
    var checkedA by remember { mutableStateOf(false) }
    var checkedB by remember { mutableStateOf(false) }
    val signature = rememberSignatureController()
    val hasInk = signature.hasInk
    val secondConsentRequester = remember { BringIntoViewRequester() }
    val signatureRequester = remember { BringIntoViewRequester() }

    LaunchedEffect(checkedA, checkedB) {
        when {
            checkedA && !checkedB -> {
                delay(120)
                secondConsentRequester.bringIntoView()
            }
            checkedA && checkedB && !hasInk -> {
                delay(120)
                signatureRequester.bringIntoView()
            }
        }
    }

    // Sign automatically once both boxes are ticked and there is ink (demo behaviour).
    LaunchedEffect(checkedA, checkedB, hasInk) {
        if (checkedA && checkedB && hasInk) {
            signature.toBitmap()?.let { onSigned(it, checkedA, checkedB) }
        } else {
            onSignatureCleared()
        }
    }

    Stage {
        Eyebrow("Step 3 · Your consent, on record")
        ScreenHeading("Read, tick and sign")
        Lead("Plain language, no fine print. A signed copy stays in your consent ledger and travels with every render.")

        if (state.consentVersion == null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.orange.copy(alpha = 0.10f), RoundedCornerShape(12.dp))
                    .border(1.dp, colors.orange.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
                    .padding(14.dp),
            ) {
                Text(
                    "Consent recording is paused until this server publishes an approved consent version.",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.text,
                )
            }
            Spacer(Modifier.height(12.dp))
        }

        // Consent note (scrollable)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 230.dp)
                .background(StarPalette.Surface2, RoundedCornerShape(14.dp))
                .border(1.dp, colors.line, RoundedCornerShape(14.dp))
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            CONSENT_SECTIONS.forEachIndexed { i, section ->
                Text(
                    text = section.heading.uppercase(),
                    color = colors.gold,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    letterSpacing = 0.16.em,
                    modifier = Modifier.padding(top = if (i == 0) 0.dp else 12.dp, bottom = 6.dp),
                )
                Text(
                    text = section.body,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color_CFC7DC,
                    lineHeight = 20.sp,
                )
            }
        }

        Spacer(Modifier.height(14.dp))
        ConsentCheck(
            checked = checkedA,
            onCheckedChange = { checkedA = it },
            label = "I confirm the photo is of me, I am 18 or older and I agree to the likeness licence above.",
        )
        ConsentCheck(
            checked = checkedB,
            onCheckedChange = { checkedB = it },
            label = "I understand I can revoke consent anytime and my biometric data will be deleted within 30 days.",
            modifier = Modifier.bringIntoViewRequester(secondConsentRequester),
        )

        Spacer(Modifier.height(8.dp))
        Text(
            "SIGN WITH YOUR FINGER",
            color = colors.dim,
            fontWeight = FontWeight.Bold,
            fontSize = 11.sp,
            letterSpacing = 0.14.em,
            modifier = Modifier.padding(bottom = 6.dp),
        )
        Box(
            modifier = Modifier
                .bringIntoViewRequester(signatureRequester)
                .fillMaxWidth()
                .height(140.dp)
                .background(Color(0xFF100D17), RoundedCornerShape(14.dp))
                .border(1.dp, Color(0xFF4A3F60), RoundedCornerShape(14.dp)),
            contentAlignment = Alignment.Center,
        ) {
            SignaturePad(controller = signature, modifier = Modifier.fillMaxWidth().height(140.dp))
            if (!hasInk) {
                Text("Sign here", color = Color(0xFF5B5170), style = MaterialTheme.typography.bodyMedium)
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SmallDim("Signed on ${today()}")
            Text(
                "Clear signature",
                color = colors.orange,
                fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.clickableText {
                    signature.clear()
                    onSignatureCleared()
                },
            )
        }

        // Network insurance: if a consent submit fails, offer an explicit retry so a flaky
        // moment cannot dead-end Step 3 during a demo.
        if (state.consentSubmitFailed && !state.signed) {
            Spacer(Modifier.height(12.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.orange.copy(alpha = 0.10f), RoundedCornerShape(12.dp))
                    .border(1.dp, colors.orange.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
                    .padding(14.dp),
            ) {
                Column {
                    Text(
                        "We couldn't reach StarME to record your consent. Your photo and signature are safe on this device.",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.text,
                    )
                    Spacer(Modifier.height(10.dp))
                    StarButton(
                        label = "Try Again",
                        onClick = { signature.toBitmap()?.let { onSigned(it, checkedA, checkedB) } },
                    )
                }
            }
        }

        if (state.signed && state.consentRef != null) {
            Spacer(Modifier.height(12.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.good.copy(alpha = 0.08f), RoundedCornerShape(12.dp))
                    .border(1.dp, colors.good.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            ) {
                Text(
                    text = buildAnnotatedString {
                        append("✓ Signed copy saved to your consent ledger · Ref ")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = colors.good)) {
                            append(state.consentRef)
                        }
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFFBFE9CF),
                )
            }
        }
    }
}

@Composable
private fun ConsentCheck(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
) {
    val colors = StarTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = CheckboxDefaults.colors(
                checkedColor = colors.orange,
                uncheckedColor = colors.line,
                checkmarkColor = Color.White,
            ),
        )
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = colors.text,
            modifier = Modifier
                .weight(1f)
                .padding(top = 12.dp),
        )
    }
}

private fun today(): String =
    LocalDate.now().format(DateTimeFormatter.ofPattern("d MMMM yyyy", Locale("en", "IN")))

private val Color_CFC7DC = Color(0xFFCFC7DC)

private fun Modifier.clickableText(onClick: () -> Unit): Modifier = this.then(
    Modifier.composed {
        val interaction = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
        clickable(interactionSource = interaction, indication = null, onClick = onClick)
    }
)
