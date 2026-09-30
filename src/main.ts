import { ClientStorage } from './storage';
import { MobileScanner } from './scanner';
import { MobileBridge } from './bridge';
import { AppViewer } from './views/viewer';
import { ManagedApp } from './types';
import './styles.css';

// DOM Elements
const viewHub = document.getElementById('view-hub') as HTMLElement;
const viewApp = document.getElementById('view-app') as HTMLElement;
const appGrid = document.getElementById('app-grid') as HTMLElement;
const appFrame = document.getElementById('app-iframe') as HTMLIFrameElement;
const appLoader = document.getElementById('app-loader') as HTMLElement;
const appTitle = document.getElementById('app-bar-title') as HTMLElement;
const connectionBadge = document.getElementById('connection-badge') as HTMLElement;

// Modals & Bottom Sheets
const modalAdd = document.getElementById('modal-add') as HTMLElement;
const modalScan = document.getElementById('modal-scan') as HTMLElement;
const scannerVideo = document.getElementById('scanner-video') as HTMLVideoElement;

let scanningMode: 'add-app' | 'barcode-pass' = 'add-app';

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

  // If there is an active workspace previously opened, restore it directly
  const config = ClientStorage.get();
  if (config.activeAppId) {
    const app = config.savedApps.find((a) => a.id === config.activeAppId);
    if (app) {
      launchApp(app);
    }
  }

  // Setup Iframe postMessage Bridge
  MobileBridge.init(appFrame, () => {
    // Web application inside iframe requested optical barcode scan
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
    card.innerHTML = `
      <div class="card-main">
        <div class="card-icon">⚡</div>
        <div class="card-info">
          <h4>${escapeHtml(app.name)}</h4>
          <span class="card-host">${escapeHtml(app.localUrl || app.remoteUrl)}</span>
        </div>
      </div>
      <button class="btn-card-del" aria-label="Remove App" title="Remove App">✕</button>
    `;

    card.addEventListener('click', (e) => {
      // Handle delete button tap
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
  });
}

// ── LAUNCH APP VIEW (IFRAME CONTAINER) ──────────────────────────────────────
async function launchApp(app: ManagedApp) {
  viewHub.classList.remove('active');
  viewApp.classList.add('active');
  appLoader.style.display = 'flex';
  appTitle.textContent = app.name;
  connectionBadge.textContent = 'Resolving route...';
  connectionBadge.className = 'badge';

  ClientStorage.setActive(app.id);

  try {
    const targetUrl = await AppViewer.resolveBestUrl(app);
    const isWifi = Boolean(app.localUrl && targetUrl === app.localUrl);

    connectionBadge.textContent = isWifi ? '📶 Local Wi-Fi' : '🌍 Public Tunnel';
    connectionBadge.className = `badge ${isWifi ? 'wifi' : 'tunnel'}`;

    appFrame.src = targetUrl;
    appFrame.onload = () => {
      appLoader.style.display = 'none';
      triggerHaptic('success');
    };
  } catch (err) {
    console.error('Failed to resolve route:', err);
    connectionBadge.textContent = 'Connection Error';
    connectionBadge.className = 'badge';
    appLoader.innerHTML = `
      <div class="empty-icon" style="font-size: 2.5rem;">⚠️</div>
      <p style="color: var(--danger); font-weight: 600;">Unable to connect to ${escapeHtml(app.name)}</p>
      <button id="btn-retry-launch" class="btn-submit" style="width: auto; padding: 10px 24px; margin-top: 10px;">Retry</button>
    `;
    document.getElementById('btn-retry-launch')?.addEventListener('click', () => {
      appLoader.innerHTML = `
        <div class="native-spinner"></div>
        <p>Connecting to ApexApp...</p>
      `;
      launchApp(app);
    });
  }
}

// ── CAMERA SCANNER MODAL ────────────────────────────────────────────────────
function openScanner() {
  modalScan.style.display = 'flex';
  MobileScanner.start(
    scannerVideo,
    (scannedText) => {
      triggerHaptic('success');
      closeScanner();

      if (scanningMode === 'add-app') {
        handleScannedAppUrl(scannedText);
      } else {
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

function handleScannedAppUrl(rawUrl: string) {
  const url = rawUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    alert('Scanned code is not a valid ApexApp URL.');
    return;
  }

  const isLocal =
    url.includes('192.168.') ||
    url.includes('10.') ||
    url.includes('172.16.') ||
    url.includes('localhost') ||
    url.includes('127.0.0.1');

  let defaultName = 'ApexApp Terminal';
  try {
    const parsed = new URL(url);
    if (!isLocal && parsed.hostname) {
      defaultName = parsed.hostname.split('.')[0].toUpperCase();
    } else {
      defaultName = `Wi-Fi (${parsed.hostname})`;
    }
  } catch (_) {}

  const app = ClientStorage.addApp({
    name: defaultName,
    localUrl: isLocal ? url : '',
    remoteUrl: !isLocal ? url : '',
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

  // Open "Add App" Bottom Sheet
  btnAddModal?.addEventListener('click', () => {
    triggerHaptic('light');
    modalAdd.style.display = 'flex';
  });

  // Close Bottom Sheet
  btnCloseAdd?.addEventListener('click', () => {
    triggerHaptic('light');
    modalAdd.style.display = 'none';
  });

  // Backdrop click dismissal for bottom sheet
  modalAdd?.addEventListener('click', (e) => {
    if (e.target === modalAdd) {
      modalAdd.style.display = 'none';
    }
  });

  // Open Scanner from Add Modal
  btnScanQr?.addEventListener('click', () => {
    triggerHaptic('medium');
    modalAdd.style.display = 'none';
    scanningMode = 'add-app';
    openScanner();
  });

  // Close Scanner Viewfinder
  btnCloseScanner?.addEventListener('click', () => {
    triggerHaptic('light');
    closeScanner();
  });

  // Navigate Back from Active App to Hub
  btnBackHub?.addEventListener('click', () => {
    triggerHaptic('light');
    appFrame.src = 'about:blank';
    viewApp.classList.remove('active');
    viewHub.classList.add('active');
    ClientStorage.setActive(null);
    renderHub();
  });

  // Refresh Active App Iframe
  btnRefreshFrame?.addEventListener('click', () => {
    triggerHaptic('light');
    if (appFrame && appFrame.src !== 'about:blank') {
      appLoader.style.display = 'flex';
      appFrame.src = appFrame.src;
    }
  });

  // Manual Workspace Add Form Submit
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
      name: name || 'ApexApp Workspace',
      localUrl: local,
      remoteUrl: remote,
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