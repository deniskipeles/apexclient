export class MobileBridge {
  static init(_iframe: HTMLIFrameElement, onTriggerCameraScan: () => void) {
    window.addEventListener('message', (event) => {
      const { type } = event.data || {};
      if (!type || !type.startsWith('__apexapp_')) return;

      // Host decision: On mobile, any scan request triggers the rear camera
      if (
        type === '__apexapp_scan_request' ||
        type === '__apexapp_camera_scan_request' ||
        type === '__apexapp_usb_scan_request'
      ) {
        onTriggerCameraScan();
      }
    });
  }

  static dispatchScanResult(iframe: HTMLIFrameElement, value: string) {
    iframe.contentWindow?.postMessage(
      { type: '__apexapp_scan_result', value },
      '*'
    );
  }
}