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

// Modals
const modalAdd = document.getElementById('modal-add') as HTMLElement;
const modalScan = document.getElementById('modal-scan') as HTMLElement;
const scannerVideo = document.getElementById('scanner-video') as HTMLVideoElement;

let scanningMode: 'add-app' | 'barcode-pass' = 'add-app';

// ── INITIALIZATION ──────────────────────────────────────────────────────────
function init() {
  renderHub();
  setupEvents();

  // If there is an active app, launch it directly
  const config = ClientStorage.get();
  if (config.activeAppId) {
    const app = config.savedApps.find((a) => a.id === config.activeAppId);
    if (app) launchApp(app);
  }

  // Setup Iframe postMessage Bridge
  MobileBridge.init(appFrame, () => {
    // Iframe app requested a barcode scan via phone camera
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
        <h3>No Apps Connected</h3>
        <p>Scan a QR code from an ApexApp desktop screen or enter your server URL manually.</p>
      </div>
    `;
    return;
  }

  config.savedApps.forEach((app) => {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.innerHTML = `
      <div class="card-icon">⚡</div>
      <div class="card-info">
        <h4>${app.name}</h4>
        <span class="card-host">${app.localUrl || app.remoteUrl}</span>
      </div>
      <button class="btn-card-del" title="Remove">✕</button>
    `;

    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('btn-card-del')) {
        e.stopPropagation();
        if (confirm(`Remove "${app.name}" from your saved apps?`)) {
          ClientStorage.removeApp(app.id);
          renderHub();
        }
        return;
      }
      launchApp(app);
    });

    appGrid.appendChild(card);
  });
}

// ── LAUNCH APP VIEW ─────────────────────────────────────────────────────────
async function launchApp(app: ManagedApp) {
  viewHub.classList.remove('active');
  viewApp.classList.add('active');
  appLoader.style.display = 'flex';
  appTitle.textContent = app.name;
  connectionBadge.textContent = 'Resolving route...';

  ClientStorage.setActive(app.id);

  const targetUrl = await AppViewer.resolveBestUrl(app);
  const isWifi = targetUrl === app.localUrl;

  connectionBadge.textContent = isWifi ? '📶 Local Wi-Fi' : '🌍 Public Tunnel';
  connectionBadge.className = `badge ${isWifi ? 'wifi' : 'tunnel'}`;

  appFrame.src = targetUrl;
  appFrame.onload = () => {
    appLoader.style.display = 'none';
  };
}

// ── CAMERA SCANNER MODAL ───────────────────────────────────────────────────
function openScanner() {
  modalScan.style.display = 'flex';
  MobileScanner.start(
    scannerVideo,
    (scannedText) => {
      closeScanner();
      if (scanningMode === 'add-app') {
        handleScannedAppUrl(scannedText);
      } else {
        MobileBridge.dispatchScanResult(appFrame, scannedText);
      }
    },
    (err) => {
      alert('Camera error: ' + err.message);
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
  const isLocal = url.includes('192.168.') || url.includes('10.') || url.includes('localhost');

  const app = ClientStorage.addApp({
    name: 'New Workshop App',
    localUrl: isLocal ? url : '',
    remoteUrl: !isLocal ? url : '',
  });

  renderHub();
  launchApp(app);
}

// ── EVENT LISTENERS ─────────────────────────────────────────────────────────
function setupEvents() {
  document.getElementById('btn-add-modal')?.addEventListener('click', () => {
    modalAdd.style.display = 'flex';
  });

  document.getElementById('btn-close-add')?.addEventListener('click', () => {
    modalAdd.style.display = 'none';
  });

  document.getElementById('btn-scan-qr')?.addEventListener('click', () => {
    modalAdd.style.display = 'none';
    scanningMode = 'add-app';
    openScanner();
  });

  document.getElementById('btn-close-scanner')?.addEventListener('click', closeScanner);

  document.getElementById('btn-back-hub')?.addEventListener('click', () => {
    appFrame.src = 'about:blank';
    viewApp.classList.remove('active');
    viewHub.classList.add('active');
    ClientStorage.setActive(null);
    renderHub();
  });

  document.getElementById('btn-refresh-frame')?.addEventListener('click', () => {
    appFrame.src = appFrame.src;
  });

  document.getElementById('form-manual-add')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = (document.getElementById('inp-app-name') as HTMLInputElement).value.trim();
    const local = (document.getElementById('inp-app-local') as HTMLInputElement).value.trim();
    const remote = (document.getElementById('inp-app-remote') as HTMLInputElement).value.trim();

    if (!local && !remote) {
      alert('Please provide at least a Local Wi-Fi IP or Public Tunnel URL.');
      return;
    }

    ClientStorage.addApp({ name: name || 'ApexApp', localUrl: local, remoteUrl: remote });
    modalAdd.style.display = 'none';
    renderHub();
  });
}

window.addEventListener('DOMContentLoaded', init);