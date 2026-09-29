#!/bin/bash
set -e

echo "🚀 Starting Production-Grade Android Build..."

if [ -z "$ANDROID_HOME" ]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
fi

# Pin to stable NDK 26.x if present, avoiding experimental NDK 29
if [ -d "$ANDROID_HOME/ndk" ]; then
    STABLE_NDK=$(ls "$ANDROID_HOME/ndk" | grep "^26\." | tail -n 1)
    if [ -n "$STABLE_NDK" ]; then
        export NDK_HOME="$ANDROID_HOME/ndk/$STABLE_NDK"
    else
        export NDK_HOME="$ANDROID_HOME/ndk/$(ls $ANDROID_HOME/ndk | sort -V | tail -n 1)"
    fi
fi

export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"

# ── 1. GRANT EXECUTE PERMISSIONS TO GRADLEW (Crucial on Linux/CI) ──
chmod +x src-tauri/gen/android/gradlew 2>/dev/null || true

# ── 2. PREPARE KEYSTORE FOR GRADLE ──
mkdir -p src-tauri/gen/android

if [ ! -f "release.keystore" ]; then
    echo "🔑 Generating release.keystore..."
    keytool -genkeypair -v \
        -keystore "release.keystore" \
        -alias "apexclient" \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -storepass "apexclient123" \
        -keypass "apexclient123" \
        -dname "CN=ApexClient, OU=Mobile, O=ApexApp, L=Nairobi, ST=Nairobi, C=KE"
fi

cp release.keystore src-tauri/gen/android/release.keystore

cat << 'EOF' > src-tauri/gen/android/keystore.properties
password=apexclient123
keyAlias=apexclient
storeFile=release.keystore
EOF

# ── 3. BUILD VITE WEB DISTRIBUTION ──
echo "⚡ Building frontend distribution..."
npm run build

OUTPUT_DIR="dist-apk"
mkdir -p "$OUTPUT_DIR"

# ── 4. BUILD ARCHITECTURE-SPECIFIC RELEASE APKS ──
ARCHS=("aarch64" "armv7" "x86_64")

for ARCH in "${ARCHS[@]}"; do
    echo ""
    echo "🔨 Building release APK for: ${ARCH}..."
    npx tauri android build --target "$ARCH" --apk

    APK_FOUND=$(find src-tauri/gen/android/app/build/outputs/apk -type f -name "*.apk" ! -name "*unaligned*" 2>/dev/null | head -n 1)

    if [ -f "$APK_FOUND" ]; then
        cp "$APK_FOUND" "${OUTPUT_DIR}/apexclient-${ARCH}.apk"
        rm -rf src-tauri/gen/android/app/build/outputs/apk/*
    fi
done

# ── 5. BUILD UNIVERSAL APK ──
echo ""
echo "🌍 Building Universal Release APK..."
npx tauri android build --apk

UNIVERSAL_APK=$(find src-tauri/gen/android/app/build/outputs/apk -type f -name "*.apk" ! -name "*unaligned*" 2>/dev/null | head -n 1)
if [ -f "$UNIVERSAL_APK" ]; then
    cp "$UNIVERSAL_APK" "${OUTPUT_DIR}/apexclient-universal.apk"
fi

echo ""
echo "🎉 Build Complete! Fully signed & aligned APKs:"
ls -lh "$OUTPUT_DIR"/*.apk