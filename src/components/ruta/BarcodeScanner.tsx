import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { X, Camera, ZapOff, Zap } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

/**
 * Full-screen barcode/QR scanner using the device camera.
 * Closes automatically after each detection so the parent can decide
 * whether to keep scanning (e.g., add and reopen).
 */
export default function BarcodeScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onDetectedRef = useRef(onDetected);
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const lastCodeRef = useRef<{ code: string; ts: number }>({ code: '', ts: 0 });

  // Keep latest callback without restarting the camera
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    const stopAll = () => {
      try { controlsRef.current?.stop(); } catch {}
      controlsRef.current = null;
      try {
        streamRef.current?.getTracks().forEach(t => t.stop());
      } catch {}
      streamRef.current = null;
    };

    (async () => {
      try {
        // 1) Request permission FIRST so device labels populate (Android/iOS)
        //    and we can pick a real back camera.
        let initialStream: MediaStream | null = null;
        try {
          initialStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          });
        } catch {
          // If "environment" fails (some desktops), retry generic
          initialStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        // Stop the probe stream — zxing will open its own with the chosen deviceId
        initialStream.getTracks().forEach(t => t.stop());

        if (cancelled) return;

        // 2) Now list devices with real labels
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const backCam =
          devices.find(d => /back|rear|environment|trasera|posterior/i.test(d.label)) ??
          devices[devices.length - 1];
        const deviceId = backCam?.deviceId;

        if (cancelled) return;

        const controls = await reader.decodeFromVideoDevice(deviceId, videoRef.current!, (result) => {
          if (cancelled) return;
          if (result) {
            const code = result.getText().trim();
            const now = Date.now();
            if (code === lastCodeRef.current.code && now - lastCodeRef.current.ts < 1500) return;
            lastCodeRef.current = { code, ts: now };
            try { (navigator as any).vibrate?.(50); } catch {}
            onDetectedRef.current(code);
          }
        });
        if (cancelled) {
          try { controls.stop(); } catch {}
          return;
        }
        controlsRef.current = controls;

        // Track the active stream (for torch + cleanup)
        const stream = videoRef.current?.srcObject as MediaStream | null;
        streamRef.current = stream;
        const track = stream?.getVideoTracks?.()[0];
        const caps = (track as any)?.getCapabilities?.();
        setTorchSupported(!!caps?.torch);
      } catch (e: any) {
        if (!cancelled) {
          const msg = e?.message ?? String(e);
          if (/permission|denied|NotAllowed/i.test(msg)) {
            setError('Permiso de cámara denegado. Habilítalo en los ajustes del navegador.');
          } else if (/NotFound|no.*camera/i.test(msg)) {
            setError('No se encontró ninguna cámara en este dispositivo.');
          } else if (/in use|NotReadable|track/i.test(msg)) {
            setError('La cámara está en uso por otra app. Ciérrala e intenta de nuevo.');
          } else {
            setError(msg || 'No se pudo acceder a la cámara');
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      stopAll();
    };
  }, [open]);

  // Torch toggle (only when supported and stream is live)
  useEffect(() => {
    if (!torchSupported) return;
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track || track.readyState !== 'live') return;
    track.applyConstraints({ advanced: [{ torch } as any] }).catch(() => {});
  }, [torch, torchSupported]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline autoPlay />

      {/* Scan overlay */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="relative w-[78%] max-w-[340px] aspect-[4/3] rounded-2xl border-2 border-white/70">
          <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-2xl" />
          <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-2xl" />
          <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-2xl" />
          <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-2xl" />
          <div className="absolute left-2 right-2 top-1/2 h-[2px] bg-primary/80 animate-pulse" />
        </div>
      </div>

      {/* Header */}
      <div className="relative z-10 pt-[max(12px,env(safe-area-inset-top))] px-4 pb-3 flex items-center gap-3 bg-gradient-to-b from-black/60 to-transparent">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-white active:scale-95">
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1 text-white">
          <p className="text-[13px] font-semibold">Escanear código</p>
          <p className="text-[11px] text-white/70">Apunta al código de barras o QR</p>
        </div>
        {torchSupported && (
          <button onClick={() => setTorch(t => !t)} className="w-9 h-9 rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-white active:scale-95">
            {torch ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
          </button>
        )}
      </div>

      {/* Footer error */}
      {error && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 bg-black/70 backdrop-blur text-center">
          <p className="text-[12px] text-white"><Camera className="inline h-4 w-4 mr-1" />{error}</p>
        </div>
      )}
    </div>
  );
}
