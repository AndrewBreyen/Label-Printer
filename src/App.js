import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  connectPrinter,
  printLabel,
  disconnectPrinter,
  isPrinterConnected,
  REQUIRED_IMAGE_WIDTH,
} from './services/printerService';
import { drawRulerTicks } from './rulerUtils';
import {
  CONTENT_WIDTH,
  PX_PER_MM,
  MIN_LENGTH_MM,
  POST_PRINT_FEED_MM,
  PRINT_OFFSET_PX,
} from './labelTemplates';
import {
  getMarkdownContentHeight,
  getMarkdownContentWidth,
  renderMarkdownContent,
} from './markdown';
import './App.css';

// Canvas width MUST equal REQUIRED_IMAGE_WIDTH (384px) — this is a
// firmware requirement of the printer itself, independent of the
// physical label width (15mm here).
const LABEL_WIDTH = REQUIRED_IMAGE_WIDTH;
// Pulled left from the flush-right max by PRINT_OFFSET_PX so the
// content lands on the tape instead of clipping past its edge —
// see the comment on PRINT_OFFSET_PX in labelTemplates.js.
const CONTENT_LEFT = Math.max(0, LABEL_WIDTH - CONTENT_WIDTH - PRINT_OFFSET_PX);

function App() {
  const [markdownContent, setMarkdownContent] = useState('# Hello World');
  const [verticalText, setVerticalText] = useState(false);
  const contentHeight = Math.max(
    MIN_LENGTH_MM * PX_PER_MM,
    verticalText
      ? Math.ceil(getMarkdownContentWidth(markdownContent))
      : getMarkdownContentHeight(markdownContent)
  );
  const feedHeight = contentHeight + Math.round(POST_PRINT_FEED_MM * PX_PER_MM);

  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef(null); // full 384px-wide canvas — hidden, sent to the printer
  const previewCanvasRef = useRef(null); // cropped-to-content canvas shown on screen
  const rulerCanvasRef = useRef(null);
  const [showRuler, setShowRuler] = useState(false);

  const renderContent = useCallback(
    (ctx, boxWidth, boxHeight, contentLeft) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, boxWidth, boxHeight);
      ctx.save();
      ctx.translate(contentLeft, 0);
      if (verticalText) {
        // Render the long label axis horizontally, then rotate it into place.
        ctx.translate(CONTENT_WIDTH / 2, contentHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.translate(-contentHeight / 2, -CONTENT_WIDTH / 2);
        renderMarkdownContent(ctx, markdownContent, contentHeight, CONTENT_WIDTH);
      } else {
        renderMarkdownContent(ctx, markdownContent, CONTENT_WIDTH, contentHeight);
      }
      ctx.restore();
    },
    [contentHeight, markdownContent, verticalText]
  );

  const drawLabel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    renderContent(ctx, canvas.width, canvas.height, CONTENT_LEFT);
  }, [renderContent]);

  const drawPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    renderContent(ctx, canvas.width, canvas.height, 0);
  }, [renderContent]);

  useEffect(() => {
    drawLabel();
    drawPreview();
  }, [drawLabel, drawPreview, feedHeight]);

  const drawRuler = useCallback(() => {
    const ruler = rulerCanvasRef.current;
    if (!ruler) return;
    const ctx = ruler.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ruler.width, feedHeight);
    drawRulerTicks(ctx, ruler.width, feedHeight, { color: '#000000' });
  }, [feedHeight]);

  useEffect(() => {
    if (showRuler) drawRuler();
  }, [showRuler, drawRuler, feedHeight]);

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
      // Redraw synchronously right before printing so any {{now}} /
      // {{now+Nd}} placeholders resolve to the actual print moment,
      // not whenever the content was last edited.
      drawLabel();
      // Continuous roll — no gap sensor to align against, so use the
      // continuous paper type rather than a gap-label default.
      await printLabel(canvasRef.current, { paperType: 0x10 });
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
      await printLabel(rulerCanvasRef.current, { paperType: 0x10 });
      setStatus("Ruler printed — find the tick number at your label's physical edge.");
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
          <span>Label content (markdown)</span>
          <textarea
            className="markdown-input"
            value={markdownContent}
            onChange={(e) => setMarkdownContent(e.target.value)}
            placeholder={'# Big heading\n## Smaller heading\nBody text'}
            rows={6}
          />
          <p className="hint">
            <code># text</code> = big heading, <code>## text</code> = smaller heading, plain
            text = body, blank line = spacing. <code>{'{{now}}'}</code> and{' '}
            <code>{'{{now+7d}}'}</code> insert live dates.
          </p>
        </label>

        <p className="hint">
          Label length adjusts automatically to fit the content. The roll is 15mm wide; if output
          does not measure 15mm wide, run "Print Ruler Test" and adjust CONTENT_WIDTH / PX_PER_MM
          in labelTemplates.js.
        </p>

        <label className="field">
          <span>Text orientation</span>
          <span>
            <input
              type="checkbox"
              checked={verticalText}
              onChange={(e) => setVerticalText(e.target.checked)}
            />{' '}
            Rotate text 90° (type up and down)
          </span>
        </label>
      </div>

      <div className="preview">
        <canvas
          ref={previewCanvasRef}
          width={CONTENT_WIDTH}
          height={contentHeight}
          className="label-canvas"
        />
      </div>

      {/* Full 384px-wide canvas — hidden, but must stay mounted since
          it's what actually gets sent to printLabel(). */}
      <canvas
        ref={canvasRef}
        width={LABEL_WIDTH}
        height={feedHeight}
        style={{ display: 'none' }}
      />

      {showRuler && (
        <div className="preview">
          <canvas
            ref={rulerCanvasRef}
            width={LABEL_WIDTH}
            height={feedHeight}
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
        Requires Chrome or Edge over HTTPS (or localhost) — Web Bluetooth isn't supported in
        Safari or Firefox.
      </p>
    </div>
  );
}

export default App;