#!/bin/bash
set -e

echo "🚀 Starting Automated Multi-Architecture Android Build..."

# ── 1. VERIFY ENVIRONMENT & TARGETS ──────────────────────────────────────────
if [ -z "$ANDROID_HOME" ]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
fi

if [ -z "$NDK_HOME" ]; then
    export NDK_HOME="$ANDROID_HOME/ndk/$(ls $ANDROID_HOME/ndk 2>/dev/null | tail -n 1)"
fi

echo "📦 Android SDK: $ANDROID_HOME"
echo "📦 Android NDK: $NDK_HOME"

echo "🦀 Adding Rust compilation targets for all Android architectures..."
rustup target add aarch64-linux-android \
                   armv7-linux-androideabi \
                   x86_64-linux-android \
                   i686-linux-android

# ── 2. CREATE AUTO-SIGNING KEYSTORE (IF MISSING) ─────────────────────────────
KEYSTORE_PATH="release.keystore"
KEY_ALIAS="apexclient"
KEY_PASS="apexclient123"

if [ ! -f "$KEYSTORE_PATH" ]; then
    echo "🔑 Generating release keystore for device installation..."
    keytool -genkeypair -v \
        -keystore "$KEYSTORE_PATH" \
        -alias "$KEY_ALIAS" \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -storepass "$KEY_PASS" \
        -keypass "$KEY_PASS" \
        -dname "CN=ApexClient, OU=Mobile, O=ApexApp, L=Nairobi, ST=Nairobi, C=KE"
fi

# ── 3. BUILD FRONTEND ────────────────────────────────────────────────────────
echo "⚡ Building frontend distribution..."
npm run build

# ── 4. COMPILE ANDROID RELEASE APKS ──────────────────────────────────────────
# Targets:
#  - aarch64: Modern 64-bit phones & tablets (Samsung, Pixel, Xiaomi, Transsion)
#  - armv7:   Older 32-bit phones & budget tablets
#  - x86_64:  Android emulators & Intel Chromebooks
ARCHS=("aarch64" "armv7" "x86_64")

OUTPUT_DIR="dist-apk"
mkdir -p "$OUTPUT_DIR"

for ARCH in "${ARCHS[@]}"; do
    echo ""
    echo "🔨 Compiling optimized APK for architecture: ${ARCH}..."
    npx tauri android build --target "$ARCH" --apk

    SRC_APK=$(find src-tauri/gen/android/app/build/outputs/apk -type f -name "*${ARCH}*release*.apk" 2>/dev/null | head -n 1)
    if [ -z "$SRC_APK" ]; then
        SRC_APK=$(find src-tauri/gen/android/app/build/outputs/apk -type f -name "*release*.apk" 2>/dev/null | head -n 1)
    fi

    DEST_APK="${OUTPUT_DIR}/apexclient-${ARCH}.apk"

    if [ -f "$SRC_APK" ]; then
        echo "🔏 Signing ${DEST_APK}..."
        cp "$SRC_APK" "$DEST_APK"

        # Sign using jarsigner or apksigner
        if command -v apksigner &> /dev/null; then
            apksigner sign --ks "$KEYSTORE_PATH" --ks-pass "pass:$KEY_PASS" --key-pass "pass:$KEY_PASS" "$DEST_APK"
        else
            jarsigner -sigalg SHA256withRSA -digestalg SHA-256 \
                -keystore "$KEYSTORE_PATH" -storepass "$KEY_PASS" -keypass "$KEY_PASS" \
                "$DEST_APK" "$KEY_ALIAS"
        fi
    fi
done

# ── 5. BUILD UNIVERSAL APK (Runs on any device) ──────────────────────────────
echo ""
echo "🌍 Compiling Universal Release APK (All architectures combined)..."
npx tauri android build --apk

UNIVERSAL_SRC=$(find src-tauri/gen/android/app/build/outputs/apk -type f -name "*universal*release*.apk" 2>/dev/null | head -n 1)
if [ -n "$UNIVERSAL_SRC" ]; then
    UNIVERSAL_DEST="${OUTPUT_DIR}/apexclient-universal.apk"
    cp "$UNIVERSAL_SRC" "$UNIVERSAL_DEST"
    jarsigner -sigalg SHA256withRSA -digestalg SHA-256 \
        -keystore "$KEYSTORE_PATH" -storepass "$KEY_PASS" -keypass "$KEY_PASS" \
        "$UNIVERSAL_DEST" "$KEY_ALIAS"
fi

# ── 6. SUMMARY ───────────────────────────────────────────────────────────────
echo ""
echo "🎉 Build Complete! Ultra-lean signed APKs ready for installation:"
ls -lh "$OUTPUT_DIR"/*.apk