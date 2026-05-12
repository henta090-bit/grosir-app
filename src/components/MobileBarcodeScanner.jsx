import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Camera, CameraOff, LoaderCircle, ScanLine, ShieldAlert, X } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.QR_CODE,
];

const CAMERA_CONSTRAINTS = {
  facingMode: { ideal: 'environment' },
};

const mapCameraError = (error) => {
  const message = String(error?.message || error || '');

  if (/notallowed|permission|denied/i.test(message)) {
    return 'Izin kamera ditolak. Izinkan akses kamera lalu coba lagi.';
  }

  if (/notfound|device|camera/i.test(message)) {
    return 'Kamera belakang tidak ditemukan di perangkat ini.';
  }

  if (/secure|https/i.test(message)) {
    return 'Kamera hanya bisa dibuka dari koneksi aman atau localhost.';
  }

  return message || 'Kamera tidak bisa dibuka saat ini.';
};

export default function MobileBarcodeScanner({
  buttonLabel = 'Scan Kamera',
  className = '',
  onDetected,
  title = 'Pemindai Barcode',
}) {
  const [error, setError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [statusText, setStatusText] = useState('Kamera siap dibuka saat Anda menekan tombol.');

  const scannerRef = useRef(null);
  const hasDetectedRef = useRef(false);
  const isMountedRef = useRef(true);
  const generatedId = useId();
  const regionId = useMemo(
    () => `mobile-barcode-scanner-${generatedId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [generatedId]
  );

  const buttonTone = useMemo(
    () =>
      className ||
      'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-600 hover:bg-slate-50 disabled:opacity-60',
    [className]
  );

  const waitForScannerRegion = () => new Promise((resolve, reject) => {
    window.requestAnimationFrame(() => {
      const element = document.getElementById(regionId);

      if (element) {
        resolve(element);
        return;
      }

      reject(new Error('Area kamera belum siap. Coba tekan scan sekali lagi.'));
    });
  });

  const prepareVideoElement = () => {
    const video = document.getElementById(regionId)?.querySelector('video');

    if (!video) return;

    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = true;
    video.play?.().catch(() => {});
  };

  const stopScanner = async () => {
    const scanner = scannerRef.current;

    if (!scanner) {
      if (isMountedRef.current) {
        setIsScanning(false);
        setIsStarting(false);
      }
      return;
    }

    scannerRef.current = null;

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
    } catch {
      // stop best-effort
    }

    try {
      await scanner.clear();
    } catch {
      // clear best-effort
    }

    if (isMountedRef.current) {
      setIsScanning(false);
      setIsStarting(false);
    }
  };

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopScanner();
    };
  }, []);

  const startScanner = async () => {
    if (isStarting || isScanning) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Browser ini belum mendukung akses kamera.');
      return;
    }

    setError('');
    setStatusText('Meminta izin kamera...');
    setIsScannerOpen(true);
    setIsStarting(true);
    hasDetectedRef.current = false;

    try {
      await waitForScannerRegion();

      const scanner = new Html5Qrcode(regionId, {
        formatsToSupport: SUPPORTED_FORMATS,
        verbose: false,
      });

      scannerRef.current = scanner;

      await scanner.start(
        CAMERA_CONSTRAINTS,
        {
          fps: 12,
          disableFlip: false,
          qrbox: (viewfinderWidth, viewfinderHeight) => ({
            width: Math.floor(Math.min(viewfinderWidth * 0.82, 340)),
            height: Math.floor(Math.min(viewfinderHeight * 0.32, 140)),
          }),
        },
        async (decodedText) => {
          if (!decodedText || hasDetectedRef.current) return;

          hasDetectedRef.current = true;
          setStatusText(`Barcode terbaca: ${decodedText}`);
          await stopScanner();
          setIsScannerOpen(false);
          onDetected?.(decodedText);
        },
        () => {}
      );

      if (isMountedRef.current) {
        prepareVideoElement();
        setIsScanning(true);
        setIsStarting(false);
        setStatusText('Arahkan barcode ke bingkai kamera.');
      }
    } catch (startError) {
      await stopScanner();
      if (isMountedRef.current) {
        setError(mapCameraError(startError));
        setStatusText('Kamera belum berhasil dibuka.');
        setIsScannerOpen(true);
      }
    }
  };

  const handleClose = async () => {
    await stopScanner();
    setIsScannerOpen(false);
    setStatusText('Pemindai ditutup.');
  };

  return (
    <div className="space-y-3">
      <button type="button" onClick={startScanner} disabled={isStarting || isScanning} className={buttonTone}>
        {isStarting ? <LoaderCircle size={16} className="animate-spin" /> : <Camera size={16} />}
        {isScanning ? 'Kamera Aktif' : buttonLabel}
      </button>

      {isScannerOpen && (
        <div className="rounded-2xl border border-slate-200 bg-slate-950 p-3 text-white shadow-xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{title}</p>
              <p className="mt-1 text-sm font-bold text-slate-100">{statusText}</p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            >
              <X size={16} />
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
            <div id={regionId} className="min-h-[240px] w-full [&>video]:h-[240px] [&>video]:w-full [&>video]:object-cover" />
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-slate-200">
              <ScanLine size={14} />
              Kamera belakang
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-slate-200">
              <CameraOff size={14} />
              Otomatis berhenti setelah scan
            </span>
          </div>

          {error && (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm font-bold text-amber-100">
              <div className="flex items-start gap-2">
                <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
