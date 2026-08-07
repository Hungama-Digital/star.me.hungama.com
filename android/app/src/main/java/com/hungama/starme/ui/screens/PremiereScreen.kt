package com.hungama.starme.ui.screens

import android.widget.Toast
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.hungama.starme.data.manifest.EpisodeDef
import com.hungama.starme.data.manifest.ShellManifest
import com.hungama.starme.data.repo.DownloadRepository
import com.hungama.starme.poster.PosterRenderer
import com.hungama.starme.state.StarUiState
import com.hungama.starme.ui.components.EpisodePlayer
import com.hungama.starme.ui.components.Eyebrow
import com.hungama.starme.ui.components.Lead
import com.hungama.starme.ui.components.ScreenHeading
import com.hungama.starme.ui.components.Stage
import com.hungama.starme.ui.components.StarButton
import com.hungama.starme.ui.components.StarButtonStyle
import com.hungama.starme.ui.components.StarCard
import com.hungama.starme.ui.components.tapClickable
import com.hungama.starme.ui.theme.StarTheme
import com.hungama.starme.util.FileStore
import com.hungama.starme.util.MediaExport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun PremiereScreen(
    manifest: ShellManifest,
    state: StarUiState,
    downloadRepo: DownloadRepository,
    fileStore: FileStore,
    onOpenSettings: () -> Unit,
) {
    val colors = StarTheme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val shell = manifest.shell(state.shellId)
    val pkg = manifest.pkg(state.packageId)
    if (shell == null || pkg == null) {
        Stage { Lead("Preparing your premiere…") }
        return
    }

    val posterBitmap = remember(state.photoPath, state.name, shell.id, pkg.id, state.consentRef) {
        PosterRenderer.render(
            context = context,
            photoPath = state.photoPath,
            name = state.name,
            shell = shell,
            episodeCount = pkg.episodes,
            consentRef = state.consentRef ?: "pending",
        )
    }

    val downloads by downloadRepo
        .forOrderFlow(state.orderId ?: -1L)
        .collectAsStateWithLifecycle(initialValue = emptyList())
    val downloadedEps = downloads.map { it.epNumber }.toSet()

    var playing by remember { mutableStateOf<String?>(null) }

    Stage {
        Eyebrow("Tonight's premiere")
        ScreenHeading("${state.name.ifBlank { "You" }}, in ${shell.title}")
        Lead("Your poster, your billing, your season. Full episodes live inside Fast TV; the trailer is yours to share anywhere.")

        // Poster
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .border(1.dp, androidx.compose.ui.graphics.Color(0xFF3A3050), RoundedCornerShape(18.dp)),
        ) {
            Image(
                bitmap = posterBitmap.asImageBitmap(),
                contentDescription = "Your StarME poster",
                contentScale = ContentScale.FillWidth,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            StarButton(
                label = "Save poster",
                style = StarButtonStyle.GOLD,
                modifier = Modifier.weight(1f),
                onClick = {
                    scope.launch {
                        val uri = withContext(Dispatchers.IO) {
                            MediaExport.saveToGallery(context, posterBitmap, "StarME_${state.name.ifBlank { "poster" }.replace(" ", "_")}")
                        }
                        Toast.makeText(context, if (uri != null) "Poster saved" else "Could not save poster", Toast.LENGTH_SHORT).show()
                    }
                },
            )
            StarButton(
                label = "Share trailer",
                style = StarButtonStyle.GHOST,
                modifier = Modifier.weight(1f),
                onClick = {
                    scope.launch {
                        val file = withContext(Dispatchers.IO) {
                            fileStore.savePosterPng(state.consentRef ?: "poster", posterBitmap)
                        }
                        val intent = MediaExport.sharePngIntent(
                            context, file,
                            "${state.name.ifBlank { "I" }} just starred in ${shell.title} on Fast TV · StarME",
                        )
                        context.startActivity(android.content.Intent.createChooser(intent, "Share your trailer"))
                    }
                },
            )
        }

        Spacer(Modifier.height(16.dp))
        StarCard {
            shell.episodes.forEachIndexed { i, ep ->
                val remoteEpisode = state.remoteEpisodes.firstOrNull { it.episodeNumber == ep.n }
                val unlockedByPackage = ep.n <= pkg.episodes
                val playable = unlockedByPackage && (remoteEpisode != null || ep.hasContent)
                EpisodeRow(
                    episode = ep,
                    playable = playable,
                    unlockedByPackage = unlockedByPackage,
                    downloaded = ep.n in downloadedEps,
                    onPlay = { playing = remoteEpisode?.streamUrl ?: ep.file },
                    onDownload = {
                        if (remoteEpisode != null) {
                            context.startActivity(
                                Intent(Intent.ACTION_VIEW, Uri.parse(remoteEpisode.downloadUrl)),
                            )
                            return@EpisodeRow
                        }
                        val file = ep.file
                        val orderId = state.orderId
                        if (file != null && orderId != null) {
                            scope.launch {
                                downloadRepo.download(orderId, shell.id, ep.n, file)
                                Toast.makeText(context, "Episode ${ep.n} saved offline", Toast.LENGTH_SHORT).show()
                            }
                        }
                    },
                    last = i == shell.episodes.lastIndex,
                )
            }
        }

        Spacer(Modifier.height(16.dp))
        ProvenanceStrip(consentRef = state.consentRef, onOpenSettings = onOpenSettings)
    }

    playing?.let { mediaUri ->
        Dialog(
            onDismissRequest = { playing = null },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Box(Modifier.fillMaxSize()) {
                EpisodePlayer(
                    mediaUri = mediaUri,
                    photoPath = state.photoPath,
                    onClose = { playing = null },
                )
            }
        }
    }
}

@Composable
private fun EpisodeRow(
    episode: EpisodeDef,
    playable: Boolean,
    unlockedByPackage: Boolean,
    downloaded: Boolean,
    onPlay: () -> Unit,
    onDownload: () -> Unit,
    last: Boolean,
) {
    val colors = StarTheme.colors
    val rowAlpha = if (playable || unlockedByPackage) 1f else 0.4f
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(rowAlpha)
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "%02d".format(episode.n),
            fontFamily = com.hungama.starme.ui.theme.DisplayFontFamily,
            fontWeight = FontWeight.Black,
            color = colors.gold,
            fontSize = 16.sp,
            modifier = Modifier.width(30.dp),
        )
        Text(
            text = episode.title,
            style = MaterialTheme.typography.bodyMedium,
            color = colors.text,
            modifier = Modifier.weight(1f),
        )
        when {
            playable -> Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (downloaded) "Saved ✓" else "Download",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (downloaded) colors.good else colors.dim,
                    modifier = Modifier.tapClickable { if (!downloaded) onDownload() },
                )
                Text(
                    "▶ Watch",
                    style = MaterialTheme.typography.labelSmall,
                    color = colors.orange,
                    modifier = Modifier.tapClickable(onPlay),
                )
            }
            unlockedByPackage -> Text(
                "Preview soon",
                style = MaterialTheme.typography.labelSmall,
                color = colors.dim,
            )
            else -> Text(
                "Locked",
                style = MaterialTheme.typography.labelSmall,
                color = colors.dim,
            )
        }
    }
    if (!last) HorizontalDivider(color = colors.line.copy(alpha = 0.6f))
}

@Composable
private fun ProvenanceStrip(consentRef: String?, onOpenSettings: () -> Unit) {
    val colors = StarTheme.colors
    Column(modifier = Modifier.fillMaxWidth()) {
        HorizontalDivider(color = colors.line)
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Badge("AI personalised")
            Badge("Content credentials")
            Badge("Watermarked")
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = "This drama was created with your signed consent${consentRef?.let { " (Ref $it)" } ?: ""} and carries provenance credentials.",
            style = MaterialTheme.typography.bodySmall,
            color = colors.dim,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "Manage or revoke your likeness anytime in Settings →",
            style = MaterialTheme.typography.bodySmall,
            color = colors.orange,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.tapClickable(onOpenSettings),
        )
    }
}

@Composable
private fun Badge(text: String) {
    val colors = StarTheme.colors
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = colors.dim,
        fontSize = 10.sp,
        letterSpacing = 0.1.em,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .border(1.dp, colors.line, RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 5.dp),
    )
}
