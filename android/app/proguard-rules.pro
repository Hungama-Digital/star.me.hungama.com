# StarME ProGuard/R8 rules

# Keep kotlinx.serialization generated serializers for our manifest models.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class com.hungama.starme.data.manifest.** {
    *** Companion;
}
-keepclasseswithmembers class com.hungama.starme.data.manifest.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Room — keep entity/dao metadata (Room handles most, keep names for safety).
-keep class com.hungama.starme.data.local.** { *; }

# ML Kit face detection models.
-keep class com.google.mlkit.** { *; }

# Media3 keeps its own rules via consumer ProGuard files.
