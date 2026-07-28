import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  connectPrinter,
  printLabel,
  disconnectPrinter,
  isPrinterConnected,
  REQUIRED_IMAGE_WIDTH,
} from './services/printerService';
import { drawRulerTicks } from './rulerUtils';
import './App.css';

// Canvas width MUST equal REQUIRED_IMAGE_WIDTH (384px) — this is a
// P50S firmware requirement documented in the package README, not
// something we can size to the physical label. Height (print length)
// is adjustable live below — our original 280px guess was based on
// an assumed 203 DPI from a general web search, not verified against
// this specific unit, and turned out to print too large physically.
const LABEL_WIDTH = REQUIRED_IMAGE_WIDTH;

// Measured directly off the ruler test print: the physical label is
// a 350x350px box anchored to the TOP-RIGHT corner of the fixed
// 384px-wide canvas (the extra ~34px on the left is print-head
// width beyond the label's physical edge, and never lands on paper).
const CONTENT_SIZE = 350;
const CONTENT_LEFT = LABEL_WIDTH - CONTENT_SIZE; // 34

function App() {
  const [title, setTitle] = useState('Hello World');
  const [subtitle, setSubtitle] = useState('');
  const [fontSize, setFontSize] = useState(28);
  const [xOffset, setXOffset] = useState(0); // fine nudge left/right within the measured 350x350 content box
  const [yOffset, setYOffset] = useState(0); // fine nudge up/down within the content box
  const [labelHeight, setLabelHeight] = useState(CONTENT_SIZE); // print length in px, measured via ruler test
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef(null);
  const rulerCanvasRef = useRef(null);
  const [showRuler, setShowRuler] = useState(false);
  const RULER_HEIGHT = CONTENT_SIZE; // matches the actual label footprint (35x35mm)

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

    // Visual-only guide showing the measured 350x350 content box as
    // a tick-ruler grid — matches the physical ruler test print, so
    // it's easy to visually cross-check on screen. Drawn in a light
    // gray (~#dddddd) that stays above the printer's black/white
    // threshold (200), so it's visible here but never actually
    // prints as ink.
    ctx.save();
    ctx.translate(CONTENT_LEFT, 0);
    drawRulerTicks(ctx, CONTENT_SIZE, Math.min(CONTENT_SIZE, canvas.height), {
      color: '#dddddd',
    });
    ctx.restore();
    ctx.fillStyle = '#000000';

    // Content is centered within the measured content box (top-right
    // anchored), then fine-nudged by xOffset/yOffset.
    const centerX = CONTENT_LEFT + CONTENT_SIZE / 2 + xOffset;
    const contentAreaWidth = CONTENT_SIZE - 20;

    ctx.font = `bold ${fontSize}px sans-serif`;
    // yOffset: positive value moves content UP (subtracted from y,
    // since canvas y grows downward).
    const titleY = (subtitle ? canvas.height / 2 - fontSize / 2 : canvas.height / 2) - yOffset;
    ctx.fillText(title || ' ', centerX, titleY, contentAreaWidth);

    if (subtitle) {
      ctx.font = `${Math.round(fontSize * 0.55)}px sans-serif`;
      ctx.fillText(subtitle, centerX, titleY + fontSize, contentAreaWidth);
    }
  }, [title, subtitle, fontSize, xOffset, yOffset, labelHeight]);

  useEffect(() => {
    drawLabel();
  }, [drawLabel]);

  const drawRuler = useCallback(() => {
    const ruler = rulerCanvasRef.current;
    if (!ruler) return;
    const ctx = ruler.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ruler.width, RULER_HEIGHT);

    drawRulerTicks(ctx, ruler.width, RULER_HEIGHT, { color: '#000000' });
  }, []);

  useEffect(() => {
    if (showRuler) drawRuler();
  }, [showRuler, drawRuler]);

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

  const handlePrintRuler = async () => {
    if (!isPrinterConnected()) {
      setStatus('Connect the printer first.');
      return;
    }
    setShowRuler(true);
    // Wait a tick for the canvas to mount and drawRuler's effect to run.
    await new Promise((resolve) => setTimeout(resolve, 50));
    setBusy(true);
    setStatus('Printing ruler...');
    try {
      await printLabel(rulerCanvasRef.current);
      setStatus('Ruler printed — find the tick number at your label\'s physical edge.');
    } catch (err) {
      setStatus(`Ruler print failed: ${err.message}`);
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

        <label className="field">
          <span>Horizontal position: {xOffset > 0 ? `+${xOffset}` : xOffset}px</span>
          <input
            type="range"
            min={-100}
            max={100}
            value={xOffset}
            onChange={(e) => setXOffset(Number(e.target.value))}
          />
        </label>

        <label className="field">
          <span>Vertical position: {yOffset > 0 ? `+${yOffset}` : yOffset}px (+ moves up)</span>
          <input
            type="range"
            min={-100}
            max={100}
            value={yOffset}
            onChange={(e) => setYOffset(Number(e.target.value))}
          />
        </label>

        <label className="field">
          <span>Print length: {labelHeight}px (measured: {CONTENT_SIZE}px = 35mm)</span>
          <input
            type="range"
            min={250}
            max={400}
            value={labelHeight}
            onChange={(e) => setLabelHeight(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="preview">
        <canvas
          ref={canvasRef}
          width={LABEL_WIDTH}
          height={labelHeight}
          className="label-canvas"
        />
      </div>

      {showRuler && (
        <div className="preview">
          <canvas
            ref={rulerCanvasRef}
            width={LABEL_WIDTH}
            height={RULER_HEIGHT}
            className="label-canvas"
          />
        </div>
      )}

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
        <button onClick={handlePrintRuler} disabled={busy || !connected}>
          Print Ruler Test
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