import { ClientStorage } from './storage';
import { MobileScanner } from './scanner';
import { MobileBridge } from './bridge';
import { AppViewer } from './views/viewer';
import { BrandingService } from './branding';
import { ManagedApp } from './types';
import apexSvg from './assets/apex.svg';
import './styles.css';

// ── DOM ELEMENTS ─────────────────────────────────────────────────────────────
const viewHub = document.getElementById('view-hub') as HTMLElement;
const viewApp = document.getElementById('view-app') as HTMLElement;
const appGrid = document.getElementById('app-grid') as HTMLElement;
const appFrame = document.getElementById('app-iframe') as HTMLIFrameElement;
const appLoader = document.getElementById('app-loader') as HTMLElement;
const appTitle = document.getElementById('app-bar-title') as HTMLElement;
const appBarIcon = document.getElementById('app-bar-icon') as HTMLImageElement;
const connectionBadge = document.getElementById('connection-badge') as HTMLElement;

// Custom Error Screen Elements (Replaces default Android WebView error page)
const appErrorView = document.getElementById('app-error-view') as HTMLElement;
const errTitle = document.getElementById('err-title') as HTMLElement;
const errDesc = document.getElementById('err-desc') as HTMLElement;
const errTargetUrl = document.getElementById('err-target-url') as HTMLElement;
const btnErrRetry = document.getElementById('btn-err-retry') as HTMLButtonElement;
const btnErrScanNew = document.getElementById('btn-err-scan-new') as HTMLButtonElement;

// Modals
const modalAdd = document.getElementById('modal-add') as HTMLElement;
const modalScan = document.getElementById('modal-scan') as HTMLElement;
const scannerVideo = document.getElementById('scanner-video') as HTMLVideoElement;

// App State
let scanningMode: 'add-app' | 'barcode-pass' | 'update-app' = 'add-app';
let currentActiveApp: ManagedApp | null = null;

// ── NATIVE HAPTIC VIBRATION FEEDBACK ─────────────────────────────────────────
function triggerHaptic(type: 'light' | 'medium' | 'success' | 'warning' = 'light') {
  if ('vibrate' in navigator) {
    switch (type) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate(25);
        break;
      case 'success':
        navigator.vibrate([15, 40, 20]);
        break;
      case 'warning':
        navigator.vibrate([40, 60, 40]);
        break;
    }
  }
}

// ── DYNAMIC STATUS BAR THEME SYNCHRONIZATION ─────────────────────────────────
function syncSystemTheme() {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const metaLight = document.querySelector('meta[name="theme-color"][media*="light"]');
  const metaDark = document.querySelector('meta[name="theme-color"][media*="dark"]');
  const themeHex = isDark ? '#090d16' : '#f8fafc';

  if (metaLight) metaLight.setAttribute('content', themeHex);
  if (metaDark) metaDark.setAttribute('content', themeHex);
}

// ── INITIALIZATION ──────────────────────────────────────────────────────────
function init() {
  syncSystemTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncSystemTheme);

  renderHub();
  setupEvents();

  // Restore previously active workspace if present
  const config = ClientStorage.get();
  if (config.activeAppId) {
    const app = config.savedApps.find((a) => a.id === config.activeAppId);
    if (app) {
      launchApp(app);
    }
  }

  // Setup Iframe postMessage Bridge
  MobileBridge.init(appFrame, () => {
    triggerHaptic('medium');
    scanningMode = 'barcode-pass';
    openScanner();
  });
}

// ── RENDER APP HUB ──────────────────────────────────────────────────────────
function renderHub() {
  const config = ClientStorage.get();
  appGrid.innerHTML = '';

  if (config.savedApps.length === 0) {
    appGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📱</div>
        <h3>No Workspaces Yet</h3>
        <p>Scan a QR code from your ApexApp desktop or connect using a local Wi-Fi address.</p>
      </div>
    `;
    return;
  }

  config.savedApps.forEach((app) => {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.id = `card-${app.id}`;

    // Render using cached branding or fallback to apex.svg
    card.innerHTML = `
      <div class="card-main">
        <div class="card-icon-wrapper">
          ${
            app.icon
              ? `<img src="${escapeHtml(app.icon)}" class="card-icon-img" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />`
              : ''
          }
          <div class="card-icon" style="${app.icon ? 'display:none;' : ''}">
            <img src="${apexSvg}" class="card-icon-svg" alt="Apex Logo" />
          </div>
        </div>
        <div class="card-info">
          <h4 class="card-title">${escapeHtml(app.name)}</h4>
          <span class="card-host">${escapeHtml(app.localUrl || app.remoteUrl)}</span>
        </div>
      </div>
      <button class="btn-card-del" aria-label="Remove App" title="Remove App">✕</button>
    `;

    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('btn-card-del')) {
        e.stopPropagation();
        triggerHaptic('warning');
        if (confirm(`Remove "${app.name}" from saved workspaces?`)) {
          ClientStorage.removeApp(app.id);
          triggerHaptic('light');
          renderHub();
        }
        return;
      }

      triggerHaptic('light');
      launchApp(app);
    });

    appGrid.appendChild(card);

    // Background asynchronous branding check
    BrandingService.fetchAppBranding(app).then((branding) => {
      let updated = false;
      const updates: Partial<ManagedApp> = {};

      if (branding.name && branding.name !== app.name) {
        updates.name = branding.name;
        app.name = branding.name;
        const titleEl = card.querySelector('.card-title');
        if (titleEl) titleEl.textContent = branding.name;
        updated = true;
      }

      if (branding.icon && branding.icon !== app.icon) {
        updates.icon = branding.icon;
        app.icon = branding.icon;
        const wrapper = card.querySelector('.card-icon-wrapper');
        if (wrapper) {
          wrapper.innerHTML = `
            <img src="${escapeHtml(branding.icon)}" class="card-icon-img" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
            <div class="card-icon" style="display:none;">
              <img src="${apexSvg}" class="card-icon-svg" alt="Apex Logo" />
            </div>
          `;
        }
        updated = true;
      }

      if (updated) {
        ClientStorage.updateApp(app.id, updates);
      }
    });
  });
}

// ── LAUNCH APP VIEW (PREFLIGHT PROBED TO PREVENT ANDROID ERROR SCREEN) ───────
async function launchApp(app: ManagedApp) {
  currentActiveApp = app;
  viewHub.classList.remove('active');
  viewApp.classList.add('active');

  // Immediately detach any prior onload handlers to avoid ghost event triggers
  appFrame.onload = null;

  // Display loader overlay and reset error screen
  appLoader.style.display = 'flex';
  if (appErrorView) appErrorView.style.display = 'none';

  // Apply cached branding to top bar
  appTitle.textContent = app.name;
  if (appBarIcon) {
    appBarIcon.src = app.icon || apexSvg;
    appBarIcon.style.display = 'block';
  }

  connectionBadge.textContent = 'Resolving route...';
  connectionBadge.className = 'badge';

  ClientStorage.setActive(app.id);

  try {
    // 1. Proactively test endpoint reachability before setting iframe.src
    const route = await AppViewer.resolveBestUrl(app);

    connectionBadge.textContent = route.isWifi ? '📶 Local Wi-Fi' : '🌍 Public Tunnel';
    connectionBadge.className = `badge ${route.isWifi ? 'wifi' : 'tunnel'}`;

    // 2. Attach load handler with guards before loading the URL
    appFrame.onload = () => {
      // Guard: Ignore navigation events triggered by about:blank
      try {
        if (appFrame.contentWindow?.location.href === 'about:blank') {
          return;
        }
      } catch (_) {
        // Cross-origin access to location will throw, indicating real remote content loaded
      }

      appLoader.style.display = 'none';
      if (appErrorView) appErrorView.style.display = 'none';
      triggerHaptic('success');
    };

    appFrame.src = route.url;

    // 3. Live branding refresh in background
    BrandingService.resolveBranding(route.url).then((branding) => {
      let updated = false;
      const updates: Partial<ManagedApp> = { activeUrl: route.url };

      if (branding.name && branding.name !== app.name) {
        appTitle.textContent = branding.name;
        updates.name = branding.name;
        app.name = branding.name;
        updated = true;
      }

      if (branding.icon && branding.icon !== app.icon) {
        if (appBarIcon) appBarIcon.src = branding.icon;
        updates.icon = branding.icon;
        app.icon = branding.icon;
        updated = true;
      }

      if (updated) {
        ClientStorage.updateApp(app.id, updates);
      }
    });
  } catch (err: any) {
    console.warn('Route resolution failed:', err);

    // CRITICAL FIX: Unbind onload so navigating to about:blank won't immediately hide the error screen
    appFrame.onload = null;
    appFrame.src = 'about:blank';
    appLoader.style.display = 'none';

    triggerHaptic('warning');
    connectionBadge.textContent = 'Offline';
    connectionBadge.className = 'badge';

    const attemptedUrl = String(err?.message || '').replace('UNREACHABLE:', '').trim();
    showCustomErrorScreen(app, attemptedUrl);
  }
}

// ── CUSTOM NATIVE ERROR SCREEN CONTROLLER ────────────────────────────────────
function showCustomErrorScreen(app: ManagedApp, attemptedUrl: string) {
  if (!appErrorView) return;

  const isTryCloudflare = attemptedUrl.includes('.trycloudflare.com');
  const isLocalIp = attemptedUrl.includes('192.168.') || attemptedUrl.includes('10.');

  if (isTryCloudflare) {
    errTitle.textContent = 'Tunnel Expired or Offline';
    errDesc.textContent =
      'Quick Tunnels are temporary and regenerate a new URL each time ApexApp restarts on your computer. Start the tunnel in ApexApp on your PC and scan the new QR code.';
  } else if (isLocalIp) {
    errTitle.textContent = 'Local Wi-Fi Offline';
    errDesc.textContent =
      'Cannot reach your computer over local Wi-Fi. Ensure this phone and your computer are connected to the same Wi-Fi router.';
  } else {
    errTitle.textContent = 'Workspace Unreachable';
    errDesc.textContent =
      'Unable to connect to this address. Ensure your ApexApp server is online and running.';
  }

  errTargetUrl.textContent = attemptedUrl || app.remoteUrl || app.localUrl || 'No address configured';
  appErrorView.style.display = 'flex';

  // Wire error screen action buttons
  btnErrRetry.onclick = () => {
    triggerHaptic('light');
    launchApp(app);
  };

  btnErrScanNew.onclick = () => {
    triggerHaptic('medium');
    scanningMode = 'update-app';
    openScanner();
  };
}

// ── CAMERA SCANNER MODAL ────────────────────────────────────────────────────
function openScanner() {
  modalScan.style.display = 'flex';
  MobileScanner.start(
    scannerVideo,
    (scannedText) => {
      triggerHaptic('success');
      closeScanner();

      const url = scannedText.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        alert('Scanned QR code is not a valid ApexApp URL.');
        return;
      }

      if (scanningMode === 'update-app' && currentActiveApp) {
        // Updating an existing unreachable workspace with newly scanned URL
        const isLocal = url.includes('192.168.') || url.includes('10.') || url.includes('localhost');
        const updates: Partial<ManagedApp> = isLocal ? { localUrl: url } : { remoteUrl: url };

        ClientStorage.updateApp(currentActiveApp.id, updates);
        Object.assign(currentActiveApp, updates);

        renderHub();
        launchApp(currentActiveApp);
      } else if (scanningMode === 'add-app') {
        // Adding a brand new workspace
        handleScannedAppUrl(url);
      } else {
        // Passing barcode through to the hosted web application iframe
        MobileBridge.dispatchScanResult(appFrame, scannedText);
      }
    },
    (err) => {
      triggerHaptic('warning');
      alert('Camera error: ' + (err?.message || 'Permission denied'));
      closeScanner();
    }
  );
}

function closeScanner() {
  MobileScanner.stop(scannerVideo);
  modalScan.style.display = 'none';
}

function handleScannedAppUrl(url: string) {
  const isLocal =
    url.includes('192.168.') ||
    url.includes('10.') ||
    url.includes('172.16.') ||
    url.includes('localhost') ||
    url.includes('127.0.0.1');

  let defaultName = 'Connecting...';
  try {
    const parsed = new URL(url);
    defaultName = isLocal ? `Wi-Fi (${parsed.hostname})` : parsed.hostname.split('.')[0].toUpperCase();
  } catch (_) {}

  const app = ClientStorage.addApp({
    name: defaultName,
    localUrl: isLocal ? url : '',
    remoteUrl: !isLocal ? url : '',
    icon: apexSvg,
  });

  renderHub();
  launchApp(app);
}

// ── EVENT LISTENERS & SHEET CONTROLS ────────────────────────────────────────
function setupEvents() {
  const btnAddModal = document.getElementById('btn-add-modal');
  const btnCloseAdd = document.getElementById('btn-close-add');
  const btnScanQr = document.getElementById('btn-scan-qr');
  const btnCloseScanner = document.getElementById('btn-close-scanner');
  const btnBackHub = document.getElementById('btn-back-hub');
  const btnRefreshFrame = document.getElementById('btn-refresh-frame');
  const formManualAdd = document.getElementById('form-manual-add') as HTMLFormElement;

  btnAddModal?.addEventListener('click', () => {
    triggerHaptic('light');
    modalAdd.style.display = 'flex';
  });

  btnCloseAdd?.addEventListener('click', () => {
    triggerHaptic('light');
    modalAdd.style.display = 'none';
  });

  modalAdd?.addEventListener('click', (e) => {
    if (e.target === modalAdd) modalAdd.style.display = 'none';
  });

  btnScanQr?.addEventListener('click', () => {
    triggerHaptic('medium');
    modalAdd.style.display = 'none';
    scanningMode = 'add-app';
    openScanner();
  });

  btnCloseScanner?.addEventListener('click', () => {
    triggerHaptic('light');
    closeScanner();
  });

  btnBackHub?.addEventListener('click', () => {
    triggerHaptic('light');
    appFrame.onload = null; // Unbind onload before returning to Hub
    appFrame.src = 'about:blank';
    viewApp.classList.remove('active');
    viewHub.classList.add('active');
    currentActiveApp = null;
    ClientStorage.setActive(null);
    renderHub();
  });

  btnRefreshFrame?.addEventListener('click', () => {
    triggerHaptic('light');
    if (currentActiveApp) {
      launchApp(currentActiveApp);
    }
  });

  formManualAdd?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('inp-app-name') as HTMLInputElement;
    const localInput = document.getElementById('inp-app-local') as HTMLInputElement;
    const remoteInput = document.getElementById('inp-app-remote') as HTMLInputElement;

    const name = nameInput.value.trim();
    const local = localInput.value.trim();
    const remote = remoteInput.value.trim();

    if (!local && !remote) {
      triggerHaptic('warning');
      alert('Please provide at least a Local Wi-Fi Address or a Public Tunnel URL.');
      return;
    }

    triggerHaptic('success');
    const newApp = ClientStorage.addApp({
      name: name || 'Connecting...',
      localUrl: local,
      remoteUrl: remote,
      icon: apexSvg,
    });

    nameInput.value = '';
    localInput.value = '';
    remoteInput.value = '';
    modalAdd.style.display = 'none';

    renderHub();
    launchApp(newApp);
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.addEventListener('DOMContentLoaded', init);