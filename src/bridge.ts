export class MobileBridge {
  static init(_iframe: HTMLIFrameElement, onTriggerCameraScan: () => void) {
    window.addEventListener('message', (event) => {
      const { type, payload } = event.data || {};
      if (!type || !type.startsWith('__apexapp_')) return;

      // 1. Mobile Camera Barcode Scan Request
      if (type === '__apexapp_camera_scan_request' || type === '__apexapp_scan_request') {
        onTriggerCameraScan();
        return;
      }

      // 2. Hardware Vibration for POS Scans
      if (type === '__apexapp_vibrate') {
        if ('vibrate' in navigator) navigator.vibrate(payload?.duration || 100);
        return;
      }

      // 3. Native Mobile Share (Invoices / Receipts via WhatsApp/Email)
      if (type === '__apexapp_share') {
        if (navigator.share && payload) {
          navigator.share({
            title: payload.title || 'ApexApp Document',
            text: payload.text || '',
            url: payload.url || window.location.href,
          }).catch(() => {});
        }
      }
    });
  }

  static dispatchScanResult(iframe: HTMLIFrameElement, value: string) {
    iframe.contentWindow?.postMessage(
      {
        type: '__apexapp_scan_result',
        value,
        source: 'Mobile Camera',
      },
      '*'
    );
  }
}