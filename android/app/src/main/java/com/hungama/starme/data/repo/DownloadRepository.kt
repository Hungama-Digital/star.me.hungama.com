package com.hungama.starme.data.repo

import android.content.Context
import com.hungama.starme.data.local.DownloadDao
import com.hungama.starme.data.local.DownloadedEpisode
import com.hungama.starme.util.FileStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/**
 * Offline episode "downloads".
 *
 * In this build the episodes are bundled placeholder assets, so a download is a
 * copy from `assets/shells/` into internal storage plus a DB record. When real
 * remote episodes land (spec §5), this is the single class that swaps to
 * Media3 `DownloadService` — the DAO, UI and record shape stay the same.
 */
class DownloadRepository(
    context: Context,
    private val dao: DownloadDao,
    private val fileStore: FileStore,
) {
    private val app = context.applicationContext

    fun forOrderFlow(orderId: Long): Flow<List<DownloadedEpisode>> = dao.forOrderFlow(orderId)

    suspend fun isDownloaded(orderId: Long, ep: Int): Boolean = dao.isDownloaded(orderId, ep)

    /**
     * Copies the placeholder asset [assetFile] (e.g. "shell_love_ep01.mp4") into
     * internal storage and records the download. No-op-safe if already present.
     */
    suspend fun download(
        orderId: Long,
        shellId: String,
        epNumber: Int,
        assetFile: String,
    ): DownloadedEpisode = withContext(Dispatchers.IO) {
        val dest = File(fileStore.episodesDir(), "${orderId}_ep${epNumber}.mp4")
        app.assets.open("shells/$assetFile").use { input ->
            FileOutputStream(dest).use { input.copyTo(it) }
        }
        val record = DownloadedEpisode(
            orderId = orderId,
            shellId = shellId,
            epNumber = epNumber,
            localUri = dest.absolutePath,
            downloadedAt = System.currentTimeMillis(),
        )
        dao.insert(record)
        record
    }

    suspend fun deleteForOrder(orderId: Long) = dao.deleteForOrder(orderId)
}
