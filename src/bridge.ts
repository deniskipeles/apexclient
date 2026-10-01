import { invoke } from '@tauri-apps/api/core';

export class MobileBridge {
  private static wakeLockSentinel: any = null;
  private static audioCtx: AudioContext | null = null;

  static init(iframe: HTMLIFrameElement, onTriggerCameraScan: () => void) {
    window.addEventListener('message', async (event) => {
      const { type, payload } = event.data || {};
      if (!type || !type.startsWith('__apexapp_')) return;

      const respond = (responseType: string, data: object) => {
        iframe.contentWindow?.postMessage({ type: responseType, ...data }, '*');
      };

      // ── 1. NATIVE NOTIFICATIONS (WITH SOUND) ──────────────────────────────
      if (type === '__apexapp_notify') {
        const title = payload?.title || 'ApexApp Alert';
        const body = payload?.body || '';

        try {
          await invoke('show_mobile_notification', { title, body });
          respond('__apexapp_notify_response', { success: true });
        } catch (err: any) {
          // Fallback to Web Notification API if plugin is restricted
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body });
          }
          respond('__apexapp_notify_response', { success: false, error: err?.message || err });
        }
        return;
      }

      // ── 2. NATIVE HARDWARE AUDIO BEEPER / TONE GENERATOR ──────────────────
      if (type === '__apexapp_beep') {
        const freq = payload?.frequency || 1200;
        const dur = payload?.durationMs || 150;
        this.playSynthesizedTone(freq, dur);
        return;
      }

      // ── 3. TACTILE HAPTIC MOTOR ───────────────────────────────────────────
      if (type === '__apexapp_haptic') {
        const style = payload?.style || 'light';
        this.triggerHaptic(style);
        return;
      }

      // ── 4. CAMERA BARCODE SCANNER ─────────────────────────────────────────
      if (
        type === '__apexapp_scan_request' ||
        type === '__apexapp_camera_scan_request' ||
        type === '__apexapp_usb_scan_request'
      ) {
        this.triggerHaptic('medium');
        onTriggerCameraScan();
        return;
      }

      // ── 5. SCREEN WAKELOCK (PREVENT PHONE SLEEP DURING SHIFTS) ────────────
      if (type === '__apexapp_set_wakelock') {
        const enable = Boolean(payload?.enabled);
        try {
          if (enable && 'wakeLock' in navigator) {
            this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
            respond('__apexapp_wakelock_response', { success: true, active: true });
          } else if (!enable && this.wakeLockSentinel) {
            await this.wakeLockSentinel.release();
            this.wakeLockSentinel = null;
            respond('__apexapp_wakelock_response', { success: true, active: false });
          }
        } catch (err: any) {
          respond('__apexapp_wakelock_response', { success: false, error: err?.message });
        }
        return;
      }

      // ── 6. BATTERY & POWER TELEMETRY ──────────────────────────────────────
      if (type === '__apexapp_get_battery') {
        try {
          if ('getBattery' in navigator) {
            const battery: any = await (navigator as any).getBattery();
            respond('__apexapp_battery_status', {
              status: {
                has_battery: true,
                percentage: Math.round(battery.level * 100),
                is_charging: battery.charging,
              },
            });
            return;
          }
        } catch (_) {}

        respond('__apexapp_battery_status', {
          status: { has_battery: true, percentage: 100, is_charging: true },
        });
        return;
      }

      // ── 7. SANDBOX-BYPASS MOBILE CLIPBOARD ────────────────────────────────
      if (type === '__apexapp_clipboard_write') {
        try {
          await navigator.clipboard.writeText(payload?.text || '');
          respond('__apexapp_clipboard_response', { success: true });
        } catch (err: any) {
          respond('__apexapp_clipboard_response', { success: false, error: err?.message });
        }
        return;
      }

      if (type === '__apexapp_clipboard_read') {
        try {
          const text = await navigator.clipboard.readText();
          respond('__apexapp_clipboard_data', { text });
        } catch (err: any) {
          respond('__apexapp_clipboard_data', { text: '', error: err?.message });
        }
        return;
      }
    });
  }

  /**
   * Hardware-accelerated Web Audio tone synthesizer (works instantly on mobile without audio assets)
   */
  private static playSynthesizedTone(frequency: number, durationMs: number) {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + durationMs / 1000);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + durationMs / 1000);
    } catch (e) {
      console.warn('Audio tone failed:', e);
    }
  }

  /**
   * Native device vibration profiles
   */
  private static triggerHaptic(style: string) {
    if (!('vibrate' in navigator)) return;

    switch (style) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate(25);
        break;
      case 'heavy':
        navigator.vibrate(50);
        break;
      case 'success':
        navigator.vibrate([15, 30, 20]);
        break;
      case 'error':
        navigator.vibrate([50, 70, 50]);
        break;
    }
  }

  static dispatchScanResult(iframe: HTMLIFrameElement, value: string) {
    iframe.contentWindow?.postMessage(
      { type: '__apexapp_scan_result', value, source: 'Camera' },
      '*'
    );
  }
}