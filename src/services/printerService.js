/**
 * printerService.js
 * ------------------
 * Web Bluetooth driver for MarkLife label printers, built on top of
 * `marklife-label-printer-web-kit`'s `PrintPort` command builders.
 *
 * This version is based directly on the package's actual README
 * ("Method 2: Advanced Usage"), which we obtained from the real
 * installed package (v1.1.4) rather than reverse-engineering guesses.
 * Confirmed facts from that README:
 *
 *  - The library was specifically tested against the P50S printer.
 *  - Flow control uses credit-based pacing on UUID 0xFF03.
 *  - Data is chunked in fixed 90-byte pieces.
 *  - Images must be exactly 384px wide (P50S firmware requirement).
 *  - The documented low-level payload is ONE concatenated buffer:
 *      setPaperType -> startPrintjob -> alignPaperStart ->
 *      [image data] -> stopPrintjob -> alignPaperEnd
 *    sent as a single chunked/paced stream — not as separate writes
 *    per command like earlier versions of this file did.
 *  - No calibration command appears anywhere in the documented flow.
 *    Earlier gap-calibration attempts (learnPaper, printerLocation)
 *    aren't part of the intended usage — dropped for now. If
 *    alignment issues persist after this fix, that's the next thing
 *    to revisit, but this more fundamental payload/width correction
 *    should be tested first.
 *
 * The BLE connection itself (service/characteristic UUIDs, notify
 * subscriptions) still isn't documented in the README — it assumes
 * you already have a connected characteristic. That part remains
 * reconstructed from lib/archive/original_interface_chinese.js,
 * which is a reasonably solid source since it's the printer
 * manufacturer's own original SDK.
 */

import { PrintPort } from 'marklife-label-printer-web-kit';

const SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb';
const WRITE_CHAR_UUID = '0000ff02-0000-1000-8000-00805f9b34fb';
const NOTIFY_CHAR_UUID_A = '0000ff03-0000-1000-8000-00805f9b34fb'; // credit grants
const NOTIFY_CHAR_UUID_B = '0000ff01-0000-1000-8000-00805f9b34fb';

const CHUNK_SIZE = 90; // README: "Automatically splits data into optimal chunks (90 bytes)"
export const REQUIRED_IMAGE_WIDTH = 384; // README: "P50S Specifics: enforces a 384px width"

let state = null; // { device, server, writeChar, credit }

/**
 * Opens the browser's Bluetooth device picker and connects to a
 * MarkLife printer. Must be called from inside a user gesture
 * (e.g. a button onClick).
 */
export async function connectPrinter() {
  if (!navigator.bluetooth) {
    throw new Error(
      'Web Bluetooth is not available in this browser. Use Chrome or Edge over HTTPS (or localhost).'
    );
  }

  console.log('[printer] requesting device...');
  const device = await navigator.bluetooth.requestDevice({
    // Matches the reference handler exactly (examples/handlers/browser-handler.js).
    filters: [
      { namePrefix: 'P50' },
      { namePrefix: 'Marklife' },
      { namePrefix: 'Printer' },
    ],
    optionalServices: [SERVICE_UUID],
  });

  console.log('[printer] connecting GATT server...');
  const server = await device.gatt.connect();

  console.log('[printer] getting primary service...');
  const service = await server.getPrimaryService(SERVICE_UUID);

  console.log('[printer] getting characteristics...');
  const writeChar = await service.getCharacteristic(WRITE_CHAR_UUID);
  const notifyCharA = await service.getCharacteristic(NOTIFY_CHAR_UUID_A);
  const notifyCharB = await service.getCharacteristic(NOTIFY_CHAR_UUID_B);

  state = { device, server, writeChar, credit: 0 };

  // Credit-grant notifications arrive on ff03. Per the actual working
  // reference handler (examples/handlers/browser-handler.js), there's
  // a special case: a grant of exactly 4 SETS credits to 4 rather
  // than adding to it. Matching that exactly here.
  await notifyCharA.startNotifications();
  notifyCharA.addEventListener('characteristicvaluechanged', (event) => {
    const bytes = new Uint8Array(event.target.value.buffer);
    if (bytes.length >= 2 && bytes[0] === 0x01) {
      if (bytes[1] === 0x04) {
        state.credit = 4;
      } else {
        state.credit += bytes[1];
      }
      console.log('[printer] credit granted, total credit =', state.credit);
    } else {
      console.log('[printer] notify (ff03):', bytes);
    }
  });

  await notifyCharB.startNotifications();
  notifyCharB.addEventListener('characteristicvaluechanged', (event) => {
    console.log('[printer] notify (ff01):', new Uint8Array(event.target.value.buffer));
  });

  device.addEventListener('gattserverdisconnected', () => {
    console.log('[printer] disconnected');
    state = null;
  });

  console.log('[printer] connected.');
  return device;
}

export async function disconnectPrinter() {
  if (state?.device?.gatt?.connected) {
    state.device.gatt.disconnect();
  }
  state = null;
}

export function isPrinterConnected() {
  return !!state?.device?.gatt?.connected;
}

function toUint8Array(bufferLike) {
  if (bufferLike instanceof Uint8Array) return bufferLike;
  if (bufferLike instanceof ArrayBuffer) return new Uint8Array(bufferLike);
  return new Uint8Array(bufferLike);
}

function concatBuffers(buffers) {
  const parts = buffers.map(toUint8Array);
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Sends a buffer in credit-paced, fixed-size chunks, per the
 * printer's flow-control protocol. Includes the small inter-chunk
 * delay used by the reference handler — without it, chunks can be
 * written faster than the printer's BLE stack/firmware can absorb
 * them, corrupting the print (this turned out to matter more than
 * any calibration step).
 */
async function sendPaced(bufferLike) {
  if (!state?.writeChar) throw new Error('Printer is not connected.');
  let bytes = toUint8Array(bufferLike);
  console.log('[printer] sending', bytes.length, 'bytes...');

  while (bytes.length > 0) {
    while (state.credit <= 0) {
      await new Promise((resolve) => setTimeout(resolve, 15));
      if (!state) throw new Error('Printer disconnected mid-transfer.');
    }

    const size = Math.min(CHUNK_SIZE, bytes.length);
    const chunk = bytes.slice(0, size);
    await state.writeChar.writeValueWithoutResponse(chunk);
    state.credit -= 1;
    bytes = bytes.slice(size);

    // Mandatory pacing delay, matching the reference handler exactly.
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  console.log('[printer] send complete.');
}

/**
 * Renders the given canvas to the printer. The canvas MUST be
 * exactly `REQUIRED_IMAGE_WIDTH` (384) px wide — see that export.
 * Height is flexible and determines the physical label length.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ paperType?: number }} options
 *   paperType: 0x10 continuous / 0x20 gap label / 0x30 black mark
 */
export async function printLabel(canvas, options = {}) {
  if (!isPrinterConnected()) throw new Error('Printer is not connected.');

  if (canvas.width !== REQUIRED_IMAGE_WIDTH) {
    throw new Error(
      `Canvas must be ${REQUIRED_IMAGE_WIDTH}px wide for P50S firmware compatibility (got ${canvas.width}px).`
    );
  }

  const paperType = options.paperType ?? 0x20; // gap label, most common for die-cut stickers

  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  console.log('[printer] processing image...');
  const printBuffer = await PrintPort.processImageData({
    data: imageData.data,
    width: canvas.width,
    height: canvas.height,
  });

  // README "Method 2: Advanced Usage" — one concatenated payload,
  // sent as a single paced/chunked stream.
  const payload = concatBuffers([
    PrintPort.setPaperType(paperType),
    PrintPort.startPrintjob(),
    PrintPort.alignPaperStart(),
    printBuffer,
    PrintPort.stopPrintjob(),
    PrintPort.alignPaperEnd(),
  ]);

  await sendPaced(payload);

  console.log('[printer] print job complete.');
}

/**
 * Sends an arbitrary raw byte sequence directly, for interactive
 * debugging from the browser console via window.printerDebug.
 */
export async function sendRawCommand(bytes) {
  if (!state?.writeChar) throw new Error('Printer is not connected.');
  await state.writeChar.writeValueWithoutResponse(new Uint8Array(bytes));
}

if (typeof window !== 'undefined') {
  window.printerDebug = {
    raw: (bytes) => sendRawCommand(bytes),
    isConnected: isPrinterConnected,
  };
}