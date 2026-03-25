/**
 * Web Bluetooth printer manager.
 * Discovers BLE thermal printers, connects, and sends raw ESC/POS bytes.
 */

// Common BLE service UUIDs used by thermal printers
const KNOWN_SERVICE_UUIDS = [
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Many Chinese printers (Goojprt, PeriPage, etc.)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC / Microchip Transparent UART
  '0000ff00-0000-1000-8000-00805f9b34fb', // Custom FF00 service
  '000018f0-0000-1000-8000-00805f9b34fb', // 0x18F0
  '00001101-0000-1000-8000-00805f9b34fb', // SPP-like
];

const CHUNK_SIZE = 100; // BLE write chunk size (safe for most printers)
const CHUNK_DELAY = 30; // ms between chunks

interface PrinterConnection {
  device: BluetoothDevice;
  characteristic: BluetoothRemoteGATTCharacteristic;
}

let cachedConnection: PrinterConnection | null = null;

/** Check if Web Bluetooth is available */
export function isBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/** Request a BLE printer device from the user */
async function requestPrinter(): Promise<BluetoothDevice> {
  // Try known services first; if none found, fall back to acceptAllDevices
  try {
    return await navigator.bluetooth.requestDevice({
      filters: [
        { services: [KNOWN_SERVICE_UUIDS[0]] },
        { services: [KNOWN_SERVICE_UUIDS[1]] },
        { services: [KNOWN_SERVICE_UUIDS[2]] },
      ],
      optionalServices: KNOWN_SERVICE_UUIDS,
    });
  } catch {
    // Fallback: accept all devices and try to discover services
    return navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: KNOWN_SERVICE_UUIDS,
    });
  }
}

/** Find a writable characteristic on the device */
async function findWritableCharacteristic(server: BluetoothRemoteGATTServer): Promise<BluetoothRemoteGATTCharacteristic> {
  // Try known service UUIDs first
  for (const uuid of KNOWN_SERVICE_UUIDS) {
    try {
      const service = await server.getPrimaryService(uuid);
      const chars = await service.getCharacteristics();
      for (const c of chars) {
        if (c.properties.write || c.properties.writeWithoutResponse) {
          return c;
        }
      }
    } catch {
      // Service not available, try next
    }
  }

  // Brute-force: get all services and look for any writable characteristic
  try {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      try {
        const chars = await service.getCharacteristics();
        for (const c of chars) {
          if (c.properties.writeWithoutResponse || c.properties.write) {
            return c;
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  throw new Error('No se encontró un canal de escritura en la impresora');
}

/** Connect to a BLE printer. Returns the connection or throws. */
export async function connectPrinter(): Promise<PrinterConnection> {
  // Re-use cached connection if still valid
  if (cachedConnection) {
    try {
      if (cachedConnection.device.gatt?.connected) return cachedConnection;
    } catch { /* stale */ }
    cachedConnection = null;
  }

  const device = await requestPrinter();

  device.addEventListener('gattserverdisconnected', () => {
    cachedConnection = null;
  });

  const server = await device.gatt!.connect();
  const characteristic = await findWritableCharacteristic(server);

  cachedConnection = { device, characteristic };
  return cachedConnection;
}

/** Send raw bytes to the printer in BLE-safe chunks */
export async function sendBytes(conn: PrinterConnection, data: Uint8Array): Promise<void> {
  const { characteristic } = conn;
  const useWriteWithoutResponse = characteristic.properties.writeWithoutResponse;

  for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
    const chunk = data.slice(offset, offset + CHUNK_SIZE);
    if (useWriteWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValueWithResponse(chunk);
    }
    // Small delay to avoid overflowing the printer buffer
    if (offset + CHUNK_SIZE < data.length) {
      await new Promise(r => setTimeout(r, CHUNK_DELAY));
    }
  }
}

/** Disconnect the cached printer */
export function disconnectPrinter(): void {
  try {
    cachedConnection?.device.gatt?.disconnect();
  } catch { /* ignore */ }
  cachedConnection = null;
}

/** Get the name of the currently connected printer, if any */
export function getConnectedPrinterName(): string | null {
  if (!cachedConnection?.device.gatt?.connected) return null;
  return cachedConnection.device.name ?? 'Impresora BLE';
}
