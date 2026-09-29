import { ManagedApp } from '../types';

export class AppViewer {
  static async resolveBestUrl(app: ManagedApp): Promise<string> {
    // 1. If only one URL provided, use it directly
    if (!app.localUrl && app.remoteUrl) return app.remoteUrl;
    if (app.localUrl && !app.remoteUrl) return app.localUrl;

    // 2. Ping local Wi-Fi IP with a fast 1500ms timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);

    try {
      const res = await fetch(`${app.localUrl.replace(/\/$/, '')}/app-name`, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        console.log('📶 Connected over Local Wi-Fi:', app.localUrl);
        return app.localUrl;
      }
    } catch (_) {
      clearTimeout(timeout);
    }

    // 3. Fall back to Remote Public Tunnel
    console.log('🌍 Connected over Public Tunnel:', app.remoteUrl);
    return app.remoteUrl;
  }
}