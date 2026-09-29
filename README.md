# ⚡ ApexClient

<p align="center">
  <b>Ultra-lightweight (< 6MB) mobile companion client for accessing and managing ApexApp workspaces on Android phones and tablets.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2_Mobile-24C8D8?logo=tauri&logoColor=white" alt="Tauri v2 Mobile" />
  <img src="https://img.shields.io/badge/Android-API_24+-3DDC84?logo=android&logoColor=white" alt="Android API 24+" />
  <img src="https://img.shields.io/badge/APK_Size-~5.4MB-10B981" alt="APK Size" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6.0-646CFF?logo=vite&logoColor=white" alt="Vite" />
</p>

---

## 📖 Overview

**ApexClient** is an ultra-lean mobile client designed to connect phones and tablets to desktop **ApexApp** instances (such as Point-of-Sale terminals, Workshop Control Centers, and Warehouse Inventory Scanners).

Instead of running heavy backend binaries or bundling Chromium onto mobile devices, ApexClient leverages the system's native Android WebView. It provides an intuitive workspace manager, smart network routing, instant QR onboarding, and a bidirectional hardware bridge (Camera Scanner, Haptics, and Native Sharing).

---

## ✨ Features

- **⚡ Featherweight Footprint:** ~5.4MB release APK (no bundled Chromium or Node.js bloat).
- **🎛️ Multi-App Hub:** Save, switch between, and manage multiple ApexApp instances (*"Workshop POS"*, *"Warehouse Stock"*, *"Main Office"*).
- **🔄 Smart Network Resolver:**
  - **Local Wi-Fi First:** Automatically pings and routes through local LAN IP (`http://192.168.x.x:5000`) for zero-latency responsiveness.
  - **Public Tunnel Fallback:** Seamlessly shifts to public edge tunnels (Cloudflare or Managed FRP WebSockets) when working outside the local network.
- **📷 Instant QR Code Onboarding:** Point your phone camera at the QR code displayed on the desktop ApexApp screen to connect in seconds.
- **🔫 Mobile Hardware Bridge:** Relays hardware capabilities to iframed web applications:
  - Phone camera optical barcode & QR code reading (`ZXing`).
  - Haptic feedback vibration on barcode trigger.
  - Native Android document/receipt sharing (WhatsApp, Email, Bluetooth).
- **📶 Cleartext Local LAN Support:** Pre-configured with `usesCleartextTraffic="true"` to prevent Android 9+ security blocks when accessing unencrypted local Wi-Fi HTTP addresses.

---

## 🏗️ Architecture

```text
┌────────────────────────────────────────────────────────┐
│                      ApexClient                        │
│   (Tauri v2 Native Shell • Android System WebView)     │
│                                                        │
│  ┌──────────────┐   ┌───────────────────────────────┐  │
│  │   App Hub    │   │      Smart Network Ping       │  │
│  │ (Workspaces) │   │  [Wi-Fi LAN]  OR  [Cloud WSS] │  │
│  └──────┬───────┘   └──────────────┬────────────────┘  │
│         │                          │                   │
│  ┌──────▼──────────────────────────▼────────────────┐  │
│  │              Sandboxed <iframe>                  │  │
│  │  (VoltRecord POS / ApexApp Web Applications)     │  │
│  └──────────────────────┬───────────────────────────┘  │
│                         │                              │
│       HTML5 window.postMessage Hardware Bridge         │
│  (Camera Barcode Scanner, Haptic Vibration, Sharing)   │
└─────────────────────────┼──────────────────────────────┘
                          │
       Local Wi-Fi (LAN)  │  Public Tunnel (WSS)
                          ▼
             Desktop ApexApp Instance
             (ApexKit Engine on Port 5000)
```

---

## 📦 Binary Architecture & Sizes

When built with symbol stripping enabled (`strip = true`, `opt-level = "z"`, and `lto = true`), ApexClient produces production binaries:

| Target ABI | Architecture Description | Typical APK Size |
| :--- | :--- | :--- |
| **`aarch64`** | Modern 64-bit phones & tablets (Samsung, Pixel, Xiaomi, etc.) | **~5.4 MB** |
| **`armv7`** | Older 32-bit Android phones & budget terminals | **~4.1 MB** |
| **`x86_64`** | Android Emulators & Intel-based Chromebooks | **~6.0 MB** |
| **`universal`** | Combined bundle containing all ABIs | **~17.0 MB** |

---

## 🛠️ Prerequisites

Before compiling native Android builds locally, ensure your environment has:

1. **Rust Toolchain:**
   ```bash
   rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android
   ```
2. **Java Development Kit:** OpenJDK 17 (`java -version`).
3. **Android SDK & NDK:**
   - Android SDK Platform-Tools & Build-Tools (API 33 or 34).
   - NDK version `26.x` or `25.x`.
   - Environment variables set:
     ```bash
     export ANDROID_HOME="$HOME/Android/Sdk"
     export NDK_HOME="$ANDROID_HOME/ndk/$(ls $ANDROID_HOME/ndk | tail -n 1)"
     export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"
     ```
4. **Node.js:** v18+ & npm.

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
cd apexclient
npm install
```

### 2. Run in Browser Development Mode
```bash
npm run dev
```

### 3. Run on a Connected Android Device (Live Reload)
Connect your Android device via USB with **USB Debugging** enabled:
```bash
npx tauri android dev
```

---

## 🔨 Building Installable APKs

Use the automated multi-architecture build script to compile and sign release APKs:

```bash
chmod +x build_android.sh
./build_android.sh
```

The script will:
1. Compile the production Vite web bundle.
2. Build optimized release APKs for `aarch64`, `armv7`, `x86_64`, and `universal`.
3. Sign the APKs with the local release keystore.
4. Output the binaries into `./dist-apk/`:
   ```text
   dist-apk/
   ├── apexclient-aarch64.apk     (~5.4MB)
   ├── apexclient-armv7.apk       (~4.1MB)
   ├── apexclient-x86_64.apk      (~6.0MB)
   └── apexclient-universal.apk   (~17.0MB)
   ```

### Sideload to Phone via ADB
```bash
adb install -r dist-apk/apexclient-aarch64.apk
```

---

## 🔌 Hardware Bridge Protocol (Iframe ➔ Mobile Shell)

Web applications hosted inside ApexClient communicate with mobile hardware via standard `postMessage` contracts:

| Direction | Message Type | Payload Structure | Action |
| :--- | :--- | :--- | :--- |
| **Iframe ➔ Client** | `__apexapp_camera_scan_request` | *None* | Opens phone camera scanner overlay with optical barcode reader. |
| **Client ➔ Iframe** | `__apexapp_scan_result` | `{ value: string, source: "Mobile Camera" }` | Returns scanned barcode / QR code text to app. |
| **Iframe ➔ Client** | `__apexapp_vibrate` | `{ duration?: number }` | Triggers native haptic vibration motor (default 100ms). |
| **Iframe ➔ Client** | `__apexapp_share` | `{ title: string, text: string, url: string }` | Opens native Android Share dialog (WhatsApp, Bluetooth, etc.). |

### Frontend Integration Example
```typescript
// Trigger mobile camera scanner from your POS component
window.parent.postMessage({ type: '__apexapp_camera_scan_request' }, '*');

// Listen for the scanned barcode
window.addEventListener('message', (event) => {
  if (event.data?.type === '__apexapp_scan_result') {
    const { value, source } = event.data;
    console.log(`Scanned code ${value} using ${source}`);
  }
});
```

---

## ⚙️ Configuration Files

- `src/views/viewer.ts` — Smart resolver prioritizing local Wi-Fi ping over public fallback.
- `src-tauri/Cargo.toml` — Rust optimization profile (`strip = true`, `opt-level = "z"`).
- `src-tauri/gen/android/app/src/main/AndroidManifest.xml` — Android permissions & cleartext HTTP flags.
- `.github/workflows/build.yml` — Automated GitHub Actions CI workflow for compiling multi-arch APKs on release.

---

## 📄 License

MIT © [Denis Kipeles](https://github.com/deniskipeles)
