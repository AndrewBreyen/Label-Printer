import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  connectPrinter,
  printLabel,
  disconnectPrinter,
  isPrinterConnected,
  REQUIRED_IMAGE_WIDTH,
} from './services/printerService';
import { drawRulerTicks } from './rulerUtils';
import { LABEL_TEMPLATES, DEFAULT_TEMPLATE_NAME } from './labelTemplates';
import './App.css';

// Canvas width MUST equal REQUIRED_IMAGE_WIDTH (384px) — this is a
// firmware requirement, not something that varies per label size.
const LABEL_WIDTH = REQUIRED_IMAGE_WIDTH;

function App() {
  const [title, setTitle] = useState('Hello World');
  const [subtitle, setSubtitle] = useState('');
  const [fontSize, setFontSize] = useState(28);
  const [xOffset, setXOffset] = useState(0); // fine nudge left/right within the content box
  const [yOffset, setYOffset] = useState(0); // fine nudge up/down within the content box
  const [templateName, setTemplateName] = useState(DEFAULT_TEMPLATE_NAME);
  const template = LABEL_TEMPLATES[templateName];
  const CONTENT_WIDTH = template.width;
  const CONTENT_LEFT = LABEL_WIDTH - CONTENT_WIDTH;
  const labelHeight = template.height;
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef(null); // full 384px-wide canvas — hidden, this is what actually gets sent to the printer
  const previewCanvasRef = useRef(null); // cropped 260x220 canvas — what's actually shown on screen
  const rulerCanvasRef = useRef(null);
  const [showRuler, setShowRuler] = useState(false);

  // Draws the label text centered within a box of the given width,
  // at the given horizontal offset — shared between the full/hidden
  // print canvas and the cropped visible preview canvas so both stay
  // perfectly in sync.
  const renderContent = useCallback(
    (ctx, boxWidth, boxHeight, centerXOverride) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, boxWidth, boxHeight);

      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const centerX = centerXOverride + xOffset;
      const contentAreaWidth = boxWidth - 20;

      ctx.font = `bold ${fontSize}px sans-serif`;
      // yOffset: positive value moves content UP (subtracted from y,
      // since canvas y grows downward).
      const titleY = (subtitle ? boxHeight / 2 - fontSize / 2 : boxHeight / 2) - yOffset;
      ctx.fillText(title || ' ', centerX, titleY, contentAreaWidth);

      if (subtitle) {
        ctx.font = `${Math.round(fontSize * 0.55)}px sans-serif`;
        ctx.fillText(subtitle, centerX, titleY + fontSize, contentAreaWidth);
      }
    },
    [title, subtitle, fontSize, xOffset, yOffset]
  );

  // Full 384px-wide canvas — this is the real data sent to the
  // printer, kept off-screen (see className="label-canvas--hidden").
  const drawLabel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    renderContent(ctx, canvas.width, canvas.height, CONTENT_LEFT + CONTENT_WIDTH / 2);
  }, [renderContent, CONTENT_LEFT, CONTENT_WIDTH]);

  // Cropped preview canvas — exactly CONTENT_WIDTH x labelHeight,
  // what you actually see on screen. Local coordinates, so center is
  // just its own midpoint (no CONTENT_LEFT offset needed here).
  const drawPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    renderContent(ctx, canvas.width, canvas.height, canvas.width / 2);
  }, [renderContent]);

  useEffect(() => {
    drawLabel();
    drawPreview();
  }, [drawLabel, drawPreview, labelHeight]);

  const drawRuler = useCallback(() => {
    const ruler = rulerCanvasRef.current;
    if (!ruler) return;
    const ctx = ruler.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ruler.width, labelHeight);

    drawRulerTicks(ctx, ruler.width, labelHeight, { color: '#000000' });
  }, [labelHeight]);

  useEffect(() => {
    if (showRuler) drawRuler();
  }, [showRuler, drawRuler, labelHeight]);

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
          <span>Label size</span>
          <select value={templateName} onChange={(e) => setTemplateName(e.target.value)}>
            {Object.keys(LABEL_TEMPLATES).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

      </div>

      <div className="preview">
        <canvas
          ref={previewCanvasRef}
          width={CONTENT_WIDTH}
          height={labelHeight}
          className="label-canvas"
        />
      </div>

      {/* Full 384px-wide canvas — not shown, but must stay mounted
          since it's what actually gets sent to printLabel(). */}
      <canvas
        ref={canvasRef}
        width={LABEL_WIDTH}
        height={labelHeight}
        style={{ display: 'none' }}
      />

      {showRuler && (
        <div className="preview">
          <canvas
            ref={rulerCanvasRef}
            width={LABEL_WIDTH}
            height={labelHeight}
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