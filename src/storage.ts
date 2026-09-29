import { AppConfig, ManagedApp } from './types';

const STORAGE_KEY = 'apex_client_apps_v1';

const defaultConfig: AppConfig = {
  activeAppId: null,
  savedApps: [],
  preferLocalWifi: true,
};

export class ClientStorage {
  static get(): AppConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...defaultConfig, ...JSON.parse(raw) };
    } catch (_) {}
    return { ...defaultConfig };
  }

  static save(config: AppConfig): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  static addApp(app: Omit<ManagedApp, 'id'>): ManagedApp {
    const config = this.get();
    const newApp: ManagedApp = {
      ...app,
      id: 'app_' + Date.now().toString(36),
      lastConnected: Date.now(),
    };
    config.savedApps.push(newApp);
    this.save(config);
    return newApp;
  }

  static removeApp(id: string): void {
    const config = this.get();
    config.savedApps = config.savedApps.filter((a) => a.id !== id);
    if (config.activeAppId === id) config.activeAppId = null;
    this.save(config);
  }

  static setActive(id: string | null): void {
    const config = this.get();
    config.activeAppId = id;
    this.save(config);
  }
}
