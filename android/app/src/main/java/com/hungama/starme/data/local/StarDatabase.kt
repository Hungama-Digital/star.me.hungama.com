package com.hungama.starme.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverter
import androidx.room.TypeConverters

class Converters {
    @TypeConverter
    fun statusToString(status: OrderStatus): String = status.name

    @TypeConverter
    fun stringToStatus(value: String): OrderStatus = OrderStatus.valueOf(value)
}

@Database(
    entities = [
        ConsentRecord::class,
        Wallet::class,
        Order::class,
        DownloadedEpisode::class,
    ],
    version = 1,
    exportSchema = true,
)
@TypeConverters(Converters::class)
abstract class StarDatabase : RoomDatabase() {
    abstract fun walletDao(): WalletDao
    abstract fun consentDao(): ConsentDao
    abstract fun orderDao(): OrderDao
    abstract fun downloadDao(): DownloadDao

    companion object {
        @Volatile
        private var INSTANCE: StarDatabase? = null

        fun get(context: Context): StarDatabase =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    StarDatabase::class.java,
                    "starme.db",
                )
                    // Room enables the ConsentRecord FK constraint automatically
                    // (no order can reference a missing consent).
                    .build()
                    .also { INSTANCE = it }
            }
    }
}
