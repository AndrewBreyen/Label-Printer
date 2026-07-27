import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  connectPrinter,
  printLabel,
  disconnectPrinter,
  isPrinterConnected,
  REQUIRED_IMAGE_WIDTH,
} from './services/printerService';
import './App.css';

// Canvas width MUST equal REQUIRED_IMAGE_WIDTH (384px) — this is a
// P50S firmware requirement documented in the package README, not
// something we can size to the physical label. Height is flexible
// and determines the print length; 280px ≈ 1.375in (1 3/8") at the
// P50 family's 203 DPI. Content is drawn centered within the full
// 384px width, so it'll appear centered on your narrower label.
const LABEL_WIDTH = REQUIRED_IMAGE_WIDTH;
const LABEL_HEIGHT = 280;

function App() {
  const [title, setTitle] = useState('Hello World');
  const [subtitle, setSubtitle] = useState('');
  const [fontSize, setFontSize] = useState(28);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef(null);

  // Redraw the label preview whenever the content changes.
  const drawLabel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // White background (thermal printers print black on white).
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `bold ${fontSize}px sans-serif`;
    const titleY = subtitle ? canvas.height / 2 - fontSize / 2 : canvas.height / 2;
    ctx.fillText(title || ' ', canvas.width / 2, titleY, canvas.width - 20);

    if (subtitle) {
      ctx.font = `${Math.round(fontSize * 0.55)}px sans-serif`;
      ctx.fillText(subtitle, canvas.width / 2, titleY + fontSize, canvas.width - 20);
    }
  }, [title, subtitle, fontSize]);

  useEffect(() => {
    drawLabel();
  }, [drawLabel]);

  const handleConnect = async () => {
    setStatus('');
    setBusy(true);
    try {
      await connectPrinter();
      setConnected(true);
      setStatus('Printer connected.');
    } catch (err) {
      setStatus(`Connection failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await disconnectPrinter();
      setConnected(false);
      setStatus('Printer disconnected.');
    } catch (err) {
      setStatus(`Disconnect failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = async () => {
    if (!isPrinterConnected()) {
      setStatus('Connect the printer first.');
      return;
    }
    setBusy(true);
    setStatus('Printing...');
    try {
      await printLabel(canvasRef.current);
      setStatus('Label sent to printer.');
    } catch (err) {
      setStatus(`Print failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <h1>Label Printer</h1>

      <div className="panel">
        <label className="field">
          <span>Line 1</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Main text"
            maxLength={40}
          />
        </label>

        <label className="field">
          <span>Line 2 (optional)</span>
          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Subtitle"
            maxLength={60}
          />
        </label>

        <label className="field">
          <span>Font size: {fontSize}px</span>
          <input
            type="range"
            min={14}
            max={48}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="preview">
        <canvas
          ref={canvasRef}
          width={LABEL_WIDTH}
          height={LABEL_HEIGHT}
          className="label-canvas"
        />
      </div>

      <div className="actions">
        {!connected ? (
          <button onClick={handleConnect} disabled={busy}>
            {busy ? 'Connecting...' : 'Connect Printer'}
          </button>
        ) : (
          <button onClick={handleDisconnect} disabled={busy}>
            Disconnect
          </button>
        )}
        <button onClick={handlePrint} disabled={busy || !connected}>
          Print Label
        </button>
      </div>

      {status && <p className="status">{status}</p>}

      <p className="hint">
        Requires Chrome or Edge over HTTPS (or localhost) — Web Bluetooth
        isn't supported in Safari or Firefox.
      </p>
    </div>
  );
}

export default App;
