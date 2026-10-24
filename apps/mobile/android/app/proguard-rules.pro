# React Native supplies its own consumer rules. Keep only app-specific rules here.

# Preserve annotations used by reflection in React Native and libraries.
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions

# op-sqlite exposes JNI entry points; the AAR ships consumer rules, but keep the
# public native bridge explicitly so R8 full mode cannot rename it.
-keep class com.op.sqlite.** { *; }
-keepclasseswithmembers,allowoptimization class * {
    native <methods>;
}

# Drizzle is JavaScript-only and requires no Android rules.
