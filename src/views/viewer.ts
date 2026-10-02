import { ManagedApp } from '../types';

export interface RouteResolution {
  url: string;
  isWifi: boolean;
}

export class AppViewer {
  /**
   * Health probe with timeout and no-cors mode.
   * If DNS fails (ERR_NAME_NOT_RESOLVED) or connection refused, fetch() rejects.
   */
  static async pingUrl(url: string, timeoutMs = 2500): Promise<boolean> {
    if (!url) return false;
    const clean = url.trim().replace(/\/+$/, '');
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) return false;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // 1. Try ApexKit /app-name endpoint first
      await fetch(`${clean}/app-name`, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(id);
      return true;
    } catch (_) {
      // 2. Fallback probe to root /
      try {
        const c2 = new AbortController();
        const id2 = setTimeout(() => c2.abort(), 1500);
        await fetch(`${clean}/`, {
          method: 'GET',
          mode: 'no-cors',
          cache: 'no-store',
          signal: c2.signal,
        });
        clearTimeout(id2);
        return true;
      } catch (_) {
        clearTimeout(id);
        return false;
      }
    }
  }

  /**
   * Resolves the best active route. Checks Wi-Fi first, then public tunnel.
   * Throws if neither URL is reachable so the app can display a custom native error screen.
   */
  static async resolveBestUrl(app: ManagedApp): Promise<RouteResolution> {
    // 1. If local Wi-Fi IP is configured, check it first (fastest, zero-latency)
    if (app.localUrl) {
      const isLocalUp = await this.pingUrl(app.localUrl, 1800);
      if (isLocalUp) {
        return { url: app.localUrl, isWifi: true };
      }
    }

    // 2. If remote tunnel is configured, check reachability
    if (app.remoteUrl) {
      const isRemoteUp = await this.pingUrl(app.remoteUrl, 2500);
      if (isRemoteUp) {
        return { url: app.remoteUrl, isWifi: false };
      }
    }

    // 3. Neither responded: Throw with the last attempted URL for diagnostic display
    const attempted = app.remoteUrl || app.localUrl || 'unknown';
    throw new Error(`UNREACHABLE:${attempted}`);
  }
}