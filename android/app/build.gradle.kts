plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.hungama.starme"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.hungama.starme"
        minSdk = 26
        targetSdk = 35
        versionCode = 9
        versionName = "1.5.0"

        // Default to the staging host so tester/debug builds reach the real server even
        // when -PSTARME_API_BASE_URL is not passed. Override for local/emulator work with
        // -PSTARME_API_BASE_URL=http://10.0.2.2:8000 (also flip usesCleartextTraffic below).
        val apiBaseUrl = providers.gradleProperty("STARME_API_BASE_URL")
            .orElse("https://starme.hungama.com")
            .get()
        buildConfigField("String", "STARME_API_BASE_URL", "\"$apiBaseUrl\"")
        val realIdentityEnabled = providers.gradleProperty("STARME_REAL_IDENTITY_ENABLED")
            .orElse("false")
            .get()
        buildConfigField("boolean", "STARME_REAL_IDENTITY_ENABLED", realIdentityEnabled)
        manifestPlaceholders["usesCleartextTraffic"] = "false"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            applicationIdSuffix = ".debug"
            isDebuggable = true
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

// Export Room schemas for versioned migrations.
ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {
    // Core + lifecycle
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    // Compose
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.ui.text.google.fonts)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    debugImplementation(libs.androidx.ui.tooling)

    // Navigation
    implementation(libs.androidx.navigation.compose)

    // Room
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    // Media3 (playback + downloads)
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.ui)
    implementation(libs.androidx.media3.common)

    // CameraX
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)

    // ML Kit face detection (on-device)
    implementation(libs.mlkit.face.detection)

    // WorkManager
    implementation(libs.androidx.work.runtime.ktx)

    // DataStore (session flags)
    implementation(libs.androidx.datastore.preferences)

    // Image loading
    implementation(libs.coil.compose)

    // Runtime permissions
    implementation(libs.accompanist.permissions)

    // JSON (manifest parsing)
    implementation(libs.kotlinx.serialization.json)

    testImplementation(kotlin("test"))
}
