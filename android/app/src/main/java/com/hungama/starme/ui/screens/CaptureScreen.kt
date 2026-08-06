package com.hungama.starme.ui.screens

import android.Manifest
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.hungama.starme.state.StarUiState
import com.hungama.starme.state.VerifyRow
import com.hungama.starme.state.VerifyState
import com.hungama.starme.ui.components.CameraCaptureView
import com.hungama.starme.ui.components.Eyebrow
import com.hungama.starme.ui.components.Lead
import com.hungama.starme.ui.components.ScreenHeading
import com.hungama.starme.ui.components.SmallDim
import com.hungama.starme.ui.components.Stage
import com.hungama.starme.ui.components.StarCard
import com.hungama.starme.ui.theme.StarPalette
import com.hungama.starme.ui.theme.StarTheme

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun CaptureScreen(
    state: StarUiState,
    onNameChanged: (String) -> Unit,
    onPhotoSelected: (Uri) -> Unit,
) {
    val colors = StarTheme.colors
    var showCamera by remember { mutableStateOf(false) }
    var openAfterPermission by remember { mutableStateOf(false) }
    var cameraMessage by remember { mutableStateOf<String?>(null) }
    val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)

    LaunchedEffect(cameraPermission.status.isGranted, openAfterPermission) {
        if (openAfterPermission && cameraPermission.status.isGranted) {
            openAfterPermission = false
            cameraMessage = null
            showCamera = true
        }
    }

    val photoPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri -> uri?.let(onPhotoSelected) }

    Stage {
        Eyebrow("Step 2 · Your close-up")
        ScreenHeading("Let's see the star")
        Lead("One clear, front-facing photo in even light. This is the face we cast, so make it a good one.")

        CaptureFrame(photoPath = state.photoPath)

        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            Pill(
                text = "📷 Take selfie",
                modifier = Modifier.weight(1f),
                onClick = {
                    if (cameraPermission.status.isGranted) showCamera = true
                    else {
                        openAfterPermission = true
                        cameraMessage = "Allow camera access to take your private close-up. You can also upload a photo."
                        cameraPermission.launchPermissionRequest()
                    }
                },
            )
            Pill(
                text = "🖼 Upload photo",
                modifier = Modifier.weight(1f),
                onClick = {
                    photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                },
            )
        }

        cameraMessage?.let { message ->
            Spacer(Modifier.height(10.dp))
            Text(message, style = MaterialTheme.typography.bodySmall, color = colors.gold)
        }

        // Name field
        Text(
            text = "YOUR NAME, AS IT APPEARS IN THE CREDITS",
            color = colors.dim,
            fontWeight = FontWeight.Bold,
            fontSize = 11.sp,
            letterSpacing = 0.14.em,
            modifier = Modifier.padding(top = 16.dp, bottom = 6.dp),
        )
        OutlinedTextField(
            value = state.name,
            onValueChange = onNameChanged,
            singleLine = true,
            placeholder = { Text("e.g. Aarav Mehta", color = colors.dim) },
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Words,
                imeAction = ImeAction.Done,
            ),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = StarPalette.Surface2,
                unfocusedContainerColor = StarPalette.Surface2,
                focusedBorderColor = colors.orange,
                unfocusedBorderColor = colors.line,
                cursorColor = colors.orange,
                focusedTextColor = colors.text,
                unfocusedTextColor = colors.text,
            ),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth(),
        )

        // Verification rows
        if (state.photoPath != null) {
            Spacer(Modifier.height(16.dp))
            StarCard {
                state.verifyRows.forEachIndexed { i, row ->
                    VerifyRowView(row, last = i == state.verifyRows.lastIndex)
                }
            }
            state.verifyError?.let { err ->
                Spacer(Modifier.height(10.dp))
                Text(
                    text = err,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFFE5A24D),
                )
            }
        }

        Spacer(Modifier.height(12.dp))
        SmallDim(
            "StarME casts you and only you. A drama starring anyone else needs their own verified selfie and signed consent on their own device."
        )
    }

    if (showCamera) {
        Dialog(
            onDismissRequest = { showCamera = false },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Box(Modifier.fillMaxSize()) {
                CameraCaptureView(
                    onCaptured = { uri ->
                        showCamera = false
                        onPhotoSelected(uri)
                    },
                    onCancel = { showCamera = false },
                    onError = { message ->
                        showCamera = false
                        cameraMessage = message
                    },
                )
            }
        }
    }
}

@Composable
private fun CaptureFrame(photoPath: String?) {
    val colors = StarTheme.colors
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(3f / 4f)
            .clip(RoundedCornerShape(20.dp))
            .background(colors.surface)
            .border(1.dp, Color(0xFF4A3F60), RoundedCornerShape(20.dp)),
        contentAlignment = Alignment.Center,
    ) {
        if (photoPath != null) {
            AsyncImage(
                model = java.io.File(photoPath),
                contentDescription = "Your selfie",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
        // Oval guide
        Box(
            modifier = Modifier
                .fillMaxSize(0.72f)
                .border(2.dp, StarPalette.Gold.copy(alpha = if (photoPath == null) 0.7f else 0.35f), CircleShape)
        )
        if (photoPath == null) {
            Text(
                "Face inside the ring · no sunglasses · no filters",
                style = MaterialTheme.typography.bodySmall,
                color = colors.dim,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 12.dp),
            )
        }
    }
}

@Composable
private fun Pill(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val colors = StarTheme.colors
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(StarPalette.Surface2)
            .border(1.dp, colors.line, RoundedCornerShape(12.dp))
            .clickableRow(onClick)
            .padding(vertical = 13.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = colors.text)
    }
}

@Composable
private fun VerifyRowView(row: VerifyRow, last: Boolean) {
    val colors = StarTheme.colors
    val (statusText, statusColor) = when (row.state) {
        VerifyState.WAITING -> "Waiting" to colors.dim
        VerifyState.CHECKING -> "Checking" to colors.dim
        VerifyState.PASSED -> "Passed" to colors.good
        VerifyState.FAILED -> "Retake" to Color(0xFFE5484D)
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(20.dp)
                .clip(CircleShape)
                .border(
                    2.dp,
                    when (row.state) {
                        VerifyState.PASSED -> colors.good
                        VerifyState.CHECKING -> colors.orange
                        VerifyState.FAILED -> Color(0xFFE5484D)
                        VerifyState.WAITING -> colors.line
                    },
                    CircleShape,
                )
                .background(if (row.state == VerifyState.PASSED) colors.good.copy(alpha = 0.12f) else Color.Transparent),
            contentAlignment = Alignment.Center,
        ) {
            if (row.state == VerifyState.PASSED) {
                Text("✓", color = colors.good, fontSize = 11.sp)
            }
        }
        Text(row.label, style = MaterialTheme.typography.bodyMedium, color = colors.text, modifier = Modifier.weight(1f))
        Text(statusText.uppercase(), style = MaterialTheme.typography.labelSmall, color = statusColor)
    }
    if (!last) androidx.compose.material3.HorizontalDivider(color = colors.line.copy(alpha = 0.6f))
}

/** Simple ripple-free clickable used by pills. */
private fun Modifier.clickableRow(onClick: () -> Unit): Modifier = this.then(
    Modifier.composed {
        val interaction = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
        clickable(interactionSource = interaction, indication = null, onClick = onClick)
    }
)
