plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "ai.puente"
    compileSdk = 34

    defaultConfig {
        applicationId = "ai.puente"
        minSdk = 29          // Android 10+ (requisito DAT, CHECKLIST Fase 1)
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"

        // URL del worker: emulador usa 10.0.2.2 para alcanzar el host.
        // Cambiar a la URL .workers.dev en release.
        buildConfigField("String", "WORKER_BASE_URL", "\"http://10.0.2.2:8787\"")
        // App ID de Meta Wearables Developer Center (rellenar).
        manifestPlaceholders["metaAppId"] = "TODO_META_APP_ID"
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    // Red + JSON (capa cerebro — lo determinista ya cableado)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // UI mínima (4 pantallas máx, CLAUDE.md §13)
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")

    // SDK Meta Wearables DAT — ⚠️ coords a verificar contra el sample
    implementation("com.meta.wearable:mwdat-core:0.7.0")
    implementation("com.meta.wearable:mwdat-camera:0.7.0")
    implementation("com.meta.wearable:mwdat-mockdevice:0.7.0")  // dev sin gafas (mp4)
}
