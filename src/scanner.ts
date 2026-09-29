import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';

export class MobileScanner {
  private static reader: BrowserMultiFormatReader | null = null;
  private static controls: any = null;

  static async start(
    videoEl: HTMLVideoElement,
    onResult: (text: string) => void,
    onError: (err: any) => void
  ) {
    if (!this.reader) {
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
        BarcodeFormat.UPC_A,
      ]);
      this.reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 60 });
    }

    try {
      this.controls = await this.reader.decodeFromConstraints(
        { video: { facingMode: 'environment' }, audio: false },
        videoEl,
        (result) => {
          if (result) {
            if ('vibrate' in navigator) navigator.vibrate(50);
            this.stop(videoEl);
            onResult(result.getText());
          }
        }
      );
    } catch (e) {
      onError(e);
    }
  }

  static stop(videoEl?: HTMLVideoElement) {
    if (this.controls) {
      this.controls.stop();
      this.controls = null;
    }
    if (videoEl && videoEl.srcObject) {
      const stream = videoEl.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoEl.srcObject = null;
    }
  }
}