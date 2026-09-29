export interface ManagedApp {
  id: string;
  name: string;
  localUrl: string;    // e.g. http://192.168.1.45:5000
  remoteUrl: string;   // e.g. https://workshop.apexkit.io or trycloudflare.com
  activeUrl?: string;  // The currently verified working URL
  icon?: string;
  lastConnected?: number;
  autoConnect?: boolean;
}

export interface AppConfig {
  activeAppId: string | null;
  savedApps: ManagedApp[];
  preferLocalWifi: boolean;
}