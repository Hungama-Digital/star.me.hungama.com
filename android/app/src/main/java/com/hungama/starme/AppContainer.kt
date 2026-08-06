package com.hungama.starme

import android.content.Context
import com.hungama.starme.billing.BillingRepository
import com.hungama.starme.billing.FakeBillingRepository
import com.hungama.starme.data.SessionStore
import com.hungama.starme.data.local.StarDatabase
import com.hungama.starme.data.manifest.ManifestRepository
import com.hungama.starme.data.repo.ConsentRepository
import com.hungama.starme.data.repo.DownloadRepository
import com.hungama.starme.data.repo.OrderRepository
import com.hungama.starme.data.repo.WalletRepository
import com.hungama.starme.render.FakeRenderRepository
import com.hungama.starme.render.RenderRepository
import com.hungama.starme.network.StarMeApiClient
import com.hungama.starme.util.FileStore

/**
 * Manual DI. One container built from the Application context and shared for the
 * process lifetime. Swapping the demo fakes for real services (Play Billing, the
 * render backend) happens here and in the one repository each.
 */
class AppContainer(context: Context) {

    private val appContext = context.applicationContext
    private val db = StarDatabase.get(appContext)
    val fileStore = FileStore(appContext)
    val session = SessionStore(appContext)
    val manifest = ManifestRepository(appContext)
    val api = StarMeApiClient()

    val wallet = WalletRepository(db.walletDao())
    val consent = ConsentRepository(db.consentDao(), fileStore)
    val orders = OrderRepository(db.orderDao(), db.consentDao())
    val downloads = DownloadRepository(appContext, db.downloadDao(), fileStore)

    // Swappable services (spec §1, §7).
    val billing: BillingRepository = FakeBillingRepository()
    val render: RenderRepository = FakeRenderRepository()
}
