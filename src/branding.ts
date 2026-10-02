import { ManagedApp } from './types';

export interface BrandingInfo {
  name?: string;
  icon?: string;
}

export class BrandingService {
  /**
   * Attempts to resolve branding for a given base URL.
   * Priority:
   * 1. /app-name (JSON { app_name }) & /logo (image)
   * 2. HTML page metadata (<title>, <link rel="icon">, og:title, og:image)
   */
  static async resolveBranding(baseUrl: string): Promise<BrandingInfo> {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    let name: string | undefined;
    let icon: string | undefined;

    // ── 1. PRIMARY CHECK: /app-name & /logo ──────────────────────────────
    try {
      const nameController = new AbortController();
      const nameTimeout = setTimeout(() => nameController.abort(), 2000);
      const nameRes = await fetch(`${cleanBase}/app-name`, { signal: nameController.signal });
      clearTimeout(nameTimeout);

      if (nameRes.ok) {
        const data = await nameRes.json();
        if (data.app_name && typeof data.app_name === 'string') {
          name = data.app_name.trim();
        }
      }
    } catch (_) {}

    try {
      const logoController = new AbortController();
      const logoTimeout = setTimeout(() => logoController.abort(), 2000);
      const logoUrl = `${cleanBase}/logo?t=${Date.now()}`;
      const logoRes = await fetch(logoUrl, { method: 'HEAD', signal: logoController.signal });
      clearTimeout(logoTimeout);

      const contentType = logoRes.headers.get('content-type') || '';
      if (logoRes.ok && (contentType.startsWith('image/') || contentType === '')) {
        icon = logoUrl;
      }
    } catch (_) {}

    // If both name and icon were resolved, return immediately
    if (name && icon) {
      return { name, icon };
    }

    // ── 2. FALLBACK CHECK: HTML PAGE METADATA ────────────────────────────
    try {
      const pageController = new AbortController();
      const pageTimeout = setTimeout(() => pageController.abort(), 2500);
      const pageRes = await fetch(`${cleanBase}/`, { signal: pageController.signal });
      clearTimeout(pageTimeout);

      if (pageRes.ok) {
        const html = await pageRes.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Extract title if not already found via /app-name
        if (!name) {
          const docTitle = doc.querySelector('title')?.textContent?.trim();
          const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();
          const appMeta = doc.querySelector('meta[name="application-name"]')?.getAttribute('content')?.trim();
          name = docTitle || ogTitle || appMeta || undefined;
        }

        // Extract favicon / touch icon if not already found via /logo
        if (!icon) {
          const iconLink =
            doc.querySelector('link[rel~="icon"]')?.getAttribute('href') ||
            doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ||
            doc.querySelector('meta[property="og:image"]')?.getAttribute('content');

          if (iconLink) {
            icon = new URL(iconLink, cleanBase).href;
          } else {
            // Check default /favicon.ico existence
            const favUrl = `${cleanBase}/favicon.ico`;
            const favCheck = await fetch(favUrl, { method: 'HEAD' });
            if (favCheck.ok) icon = favUrl;
          }
        }
      }
    } catch (_) {}

    return { name, icon };
  }

  /**
   * Helper that checks local Wi-Fi first, then public tunnel to refresh an app's branding
   */
  static async fetchAppBranding(app: ManagedApp): Promise<BrandingInfo> {
    const urls = [app.localUrl, app.remoteUrl].filter(Boolean);
    for (const url of urls) {
      try {
        const branding = await this.resolveBranding(url);
        if (branding.name || branding.icon) {
          return branding;
        }
      } catch (_) {}
    }
    return {};
  }
}