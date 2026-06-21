pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // SDK Meta Wearables DAT (GitHub Packages). Requiere GITHUB_TOKEN.
        // ⚠️ Verifica la URL/coords exactas contra el sample CameraAccess:
        //    https://github.com/facebook/meta-wearables-dat-android
        maven {
            url = uri("https://maven.pkg.github.com/facebook/meta-wearables-dat-android")
            credentials {
                username = providers.gradleProperty("gpr.user").orNull
                    ?: System.getenv("GITHUB_ACTOR") ?: ""
                password = providers.gradleProperty("gpr.token").orNull
                    ?: System.getenv("GITHUB_TOKEN") ?: ""
            }
        }
    }
}

rootProject.name = "puente"
include(":app")
