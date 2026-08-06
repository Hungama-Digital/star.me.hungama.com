package com.hungama.starme.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import kotlin.math.roundToInt

// Placeholder shells are 1080x1920 with a baked-in face-integration zone;
// these are the zone's measured, video-relative coordinates (same in all six).
private const val VIDEO_ASPECT = 1080f / 1920f
private const val ZONE_CENTER_Y = 0.298f   // zone box centre, fraction of video height
private const val ZONE_HEIGHT = 0.198f     // zone box height, fraction of video height
private const val ZONE_LABEL_Y = 0.400f    // baked "swap role" caption centre line

/**
 * Plays a shell episode from assets and composites the subscriber's photo
 * (circle-cropped, bordered) into the baked face-integration zone — the
 * personalisation illusion (spec §5, "two truths" #1). Real in-video face
 * transfer replaces this later without touching the player.
 */
@Composable
fun EpisodePlayer(
    mediaUri: String,
    photoPath: String?,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val isRemote = mediaUri.startsWith("http")
    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            repeatMode = Player.REPEAT_MODE_ONE
        }
    }

    LaunchedEffect(mediaUri) {
        val resolved = if (mediaUri.startsWith("http")) mediaUri else "asset:///shells/$mediaUri"
        player.setMediaItem(MediaItem.fromUri(resolved))
        player.prepare()
        player.playWhenReady = true
    }
    DisposableEffect(Unit) {
        onDispose { player.release() }
    }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                PlayerView(ctx).apply {
                    this.player = player
                    setUseController(false)
                }
            },
        )

        // The video letterboxes inside the container (FIT). Everything drawn
        // over it must be placed in video coordinates, not screen coordinates.
        val density = LocalDensity.current
        val containerW = constraints.maxWidth.toFloat()
        val containerH = constraints.maxHeight.toFloat()
        val videoScale = minOf(containerW / VIDEO_ASPECT / 1920f, containerH / 1920f)
        val videoH = 1920f * videoScale
        val offsetY = (containerH - videoH) / 2f

        // Circle-cropped photo centred in the zone, sized to cover the
        // placeholder "subscriber face" label baked into the shell.
        if (photoPath != null && !isRemote) {
            val avatarPx = videoH * ZONE_HEIGHT * 0.9f
            val avatarTop = (offsetY + videoH * ZONE_CENTER_Y - avatarPx / 2f).roundToInt()
            AsyncImage(
                model = java.io.File(photoPath),
                contentDescription = "Your face in the scene",
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset { IntOffset(0, avatarTop) }
                    .size(with(density) { avatarPx.toDp() })
                    .clip(CircleShape)
                    .border(2.dp, Color.White.copy(alpha = 0.85f), CircleShape),
            )
        }

        // Clean caption chip drawn over the shell's baked zone label, which the
        // placeholder renders colliding with the zone border. Sized to fully
        // cover the baked line so it cannot peek out behind the chip.
        if (!isRemote) {
            val chipW = VIDEO_ASPECT * videoH
            val chipH = videoH * 0.040f
            val chipTop = (offsetY + videoH * ZONE_LABEL_Y - chipH / 2f).roundToInt()
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset { IntOffset(0, chipTop) }
                    .size(with(density) { chipW.toDp() }, with(density) { chipH.toDp() })
                    .background(Color(0xFF23101B)),
            ) {
                Text(
                    text = "Swap role: Lead · Face integration zone",
                    style = MaterialTheme.typography.labelMedium,
                    color = Color(0xFFFF8A50),
                )
            }
        }

        Text(
            text = "Close",
            color = Color.White,
            modifier = Modifier
                .align(Alignment.TopStart)
                .statusBarsPadding()
                .padding(18.dp)
                .clip(CircleShape)
                .background(Color(0x66000000))
                .padding(horizontal = 14.dp, vertical = 8.dp)
                .tapClickable(onClose),
        )

        Text(
            text = "Preview content · AI personalised · Watermarked",
            color = Color.White.copy(alpha = 0.7f),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 28.dp),
        )
    }
}
