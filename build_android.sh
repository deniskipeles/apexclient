#!/bin/bash
set -e

echo "🚀 Starting Production-Grade Android Build..."

if [ -z "$ANDROID_HOME" ]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
fi

if [ -z "$NDK_HOME" ]; then
    export NDK_HOME="$ANDROID_HOME/ndk/$(ls $ANDROID_HOME/ndk 2>/dev/null | tail -n 1)"
fi

export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"

# 1. Ensure Keystore & Gradle signing configuration exist
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
storeFile=release.keystore
storePassword=apexclient123
keyAlias=apexclient
keyPassword=apexclient123
EOF

# 2. Build Frontend
echo "⚡ Building Vite distribution..."
npm run build

OUTPUT_DIR="dist-apk"
mkdir -p "$OUTPUT_DIR"

# 3. Build Architecture-Specific Release APKs
# (aarch64 is what 95%+ of modern physical phones and tablets run)
ARCHS=("aarch64" "armv7" "x86_64")

for ARCH in "${ARCHS[@]}"; do
    echo ""
    echo "🔨 Building aligned & signed release APK for: ${ARCH}..."
    npx tauri android build --target "$ARCH" --apk

    APK_FOUND=$(find src-tauri/gen/android/app/build/outputs/apk -type f -name "*.apk" ! -name "*unaligned*" 2>/dev/null | head -n 1)

    if [ -f "$APK_FOUND" ]; then
        cp "$APK_FOUND" "${OUTPUT_DIR}/apexclient-${ARCH}.apk"
        # Clear out build output before next arch
        rm -rf src-tauri/gen/android/app/build/outputs/apk/*
    fi
done

# 4. Build Universal APK (Combined architectures)
echo ""
echo "🌍 Building Universal Release APK..."
npx tauri android build --apk

UNIVERSAL_APK=$(find src-tauri/gen/android/app/build/outputs/apk -type f -name "*.apk" ! -name "*unaligned*" 2>/dev/null | head -n 1)
if [ -f "$UNIVERSAL_APK" ]; then
    cp "$UNIVERSAL_APK" "${OUTPUT_DIR}/apexclient-universal.apk"
fi

echo ""
echo "🎉 Build Finished! Aligned & signed APKs ready:"
ls -lh "$OUTPUT_DIR"/*.apk