/**
 * Web Bluetooth printer manager.
 * Discovers BLE thermal printers, connects, and sends raw ESC/POS bytes.
 */

// Common BLE service UUIDs used by thermal printers
const KNOWN_SERVICE_UUIDS = [
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '000018f0-0000-1000-8000-00805f9b34fb',
  '00001101-0000-1000-8000-00805f9b34fb',
];

const CHUNK_SIZE = 100;
const CHUNK_DELAY = 30;

interface PrinterConnection {
  device: any;
  characteristic: any;
}

let cachedConnection: PrinterConnection | null = null;

/** Check if Web Bluetooth is available */
export function isBluetoothAvailable(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Chrome on Android exposes navigator.bluetooth in secure contexts
  if ('bluetooth' in navigator) return true;
  // Some PWA/WebView contexts hide it — check userAgent as hint
  const ua = navigator.userAgent || '';
  const isAndroidChrome = /Android/i.test(ua) && /Chrome/i.test(ua) && !/OPR|Edge|SamsungBrowser/i.test(ua);
  return isAndroidChrome && window.isSecureContext === true;
}

/** Request a BLE printer device from the user */
async function requestPrinter(): Promise<any> {
  const bt = (navigator as any).bluetooth;
  try {
    return await bt.requestDevice({
      filters: [
        { services: [KNOWN_SERVICE_UUIDS[0]] },
        { services: [KNOWN_SERVICE_UUIDS[1]] },
        { services: [KNOWN_SERVICE_UUIDS[2]] },
      ],
      optionalServices: KNOWN_SERVICE_UUIDS,
    });
  } catch {
    return bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: KNOWN_SERVICE_UUIDS,
    });
  }
}

/** Find a writable characteristic on the device */
async function findWritableCharacteristic(server: any): Promise<any> {
  for (const uuid of KNOWN_SERVICE_UUIDS) {
    try {
      const service = await server.getPrimaryService(uuid);
      const chars = await service.getCharacteristics();
      for (const c of chars) {
        if (c.properties.write || c.properties.writeWithoutResponse) return c;
      }
    } catch { /* next */ }
  }

  try {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      try {
        const chars = await service.getCharacteristics();
        for (const c of chars) {
          if (c.properties.writeWithoutResponse || c.properties.write) return c;
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  throw new Error('No se encontró un canal de escritura en la impresora');
}

/** Connect to a BLE printer. Returns the connection or throws. */
export async function connectPrinter(): Promise<PrinterConnection> {
  if (cachedConnection) {
    try {
      if (cachedConnection.device.gatt?.connected) return cachedConnection;
    } catch { /* stale */ }
    cachedConnection = null;
  }

  const device = await requestPrinter();
  device.addEventListener('gattserverdisconnected', () => { cachedConnection = null; });

  const server = await device.gatt!.connect();
  const characteristic = await findWritableCharacteristic(server);

  cachedConnection = { device, characteristic };
  return cachedConnection;
}

/** Send raw bytes to the printer in BLE-safe chunks */
export async function sendBytes(conn: PrinterConnection, data: Uint8Array): Promise<void> {
  const { characteristic } = conn;
  const useNoResponse = characteristic.properties.writeWithoutResponse;

  for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
    const chunk = data.slice(offset, offset + CHUNK_SIZE);
    if (useNoResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValueWithResponse(chunk);
    }
    if (offset + CHUNK_SIZE < data.length) {
      await new Promise(r => setTimeout(r, CHUNK_DELAY));
    }
  }
}

/** Disconnect the cached printer */
export function disconnectPrinter(): void {
  try { cachedConnection?.device.gatt?.disconnect(); } catch { /* ignore */ }
  cachedConnection = null;
}

/** Get the name of the currently connected printer, if any */
export function getConnectedPrinterName(): string | null {
  if (!cachedConnection?.device.gatt?.connected) return null;
  return cachedConnection.device.name ?? 'Impresora BLE';
}
