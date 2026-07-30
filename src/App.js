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
import { useContentTemplates } from './contentTemplates';
import { DATE_TEMPLATES } from './dateTemplates';
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
  const contentHeight = template.contentHeight; // visible content box — what the cropped preview shows
  const feedHeight = template.feedHeight; // full print job height — the real feed distance to the next label
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  // Manual vs Templates mode, and the saved content presets used by
  // Templates mode.
  const [mode, setMode] = useState('manual'); // 'manual' | 'templates'
  const { templates: contentTemplates, saveTemplate, deleteTemplate } = useContentTemplates();
  const [selectedContentTemplate, setSelectedContentTemplate] = useState('');
  const [newTemplateName, setNewTemplateName] = useState('');

  const applyContentTemplate = (name) => {
    const t = contentTemplates.find((tpl) => tpl.name === name);
    if (!t) return;
    setSelectedContentTemplate(name);
    setTitle(t.title);
    setSubtitle(t.subtitle);
    setFontSize(t.fontSize);
    setXOffset(t.xOffset);
    setYOffset(t.yOffset);
  };

  const handleSaveTemplate = () => {
    const name = newTemplateName.trim();
    if (!name) return;
    saveTemplate(name, { title, subtitle, fontSize, xOffset, yOffset });
    setNewTemplateName('');
    setStatus(`Saved template "${name}".`);
  };

  const [selectedDateTemplate, setSelectedDateTemplate] = useState('');

  const applyDateTemplate = (name) => {
    const t = DATE_TEMPLATES[name];
    if (!t) return;
    setSelectedDateTemplate(name);
    const { title: newTitle, subtitle: newSubtitle } = t.generate();
    setTitle(newTitle);
    setSubtitle(newSubtitle);
  };

  const canvasRef = useRef(null); // full 384px-wide canvas — hidden, this is what actually gets sent to the printer
  const previewCanvasRef = useRef(null); // cropped 260x220 canvas — what's actually shown on screen
  const rulerCanvasRef = useRef(null);
  const [showRuler, setShowRuler] = useState(false);

  // Draws the label text centered within a box of the given width,
  // at the given horizontal offset — shared between the full/hidden
  // print canvas and the cropped visible preview canvas so both stay
  // perfectly in sync.
  //
  // boxHeight is the FULL canvas height (= the exact feed distance
  // the printer advances — must stay whatever the template says).
  // contentBoxHeight is a smaller, top-anchored region within that
  // where text actually gets positioned — the remainder is just
  // blank feed continuing on to the next label, same as it always
  // was, just no longer forcing text to center within the whole
  // thing.
  const renderContent = useCallback(
    (ctx, boxWidth, boxHeight, centerXOverride) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, boxWidth, boxHeight);

      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const centerX = centerXOverride + xOffset;
      const contentAreaWidth = boxWidth - 20;
      const contentBoxHeight = Math.min(contentHeight, boxHeight);

      // Visual-only outline around the content box — light gray
      // (~#dddddd) stays above the printer's black/white threshold
      // (200), so it's visible here but never actually prints as ink.
      // Skipped when the box already fills the whole canvas (the
      // cropped preview), since the canvas's own border already
      // shows that boundary.
      if (contentBoxHeight < boxHeight) {
        ctx.save();
        ctx.strokeStyle = '#dddddd';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(0.5, 0.5, boxWidth - 1, contentBoxHeight - 1);
        ctx.restore();
      }

      ctx.fillStyle = '#000000';
      ctx.font = `bold ${fontSize}px sans-serif`;
      // yOffset: positive value moves content UP (subtracted from y,
      // since canvas y grows downward). Centered within the smaller
      // top-anchored content box, not the full feed height.
      const titleY =
        (subtitle ? contentBoxHeight / 2 - fontSize / 2 : contentBoxHeight / 2) - yOffset;
      ctx.fillText(title || ' ', centerX, titleY, contentAreaWidth);

      if (subtitle) {
        ctx.font = `${Math.round(fontSize * 0.55)}px sans-serif`;
        ctx.fillText(subtitle, centerX, titleY + fontSize, contentAreaWidth);
      }
    },
    [title, subtitle, fontSize, xOffset, yOffset, contentHeight]
  );

  // Full 384px-wide canvas — this is the real data sent to the
  // printer, kept off-screen (see className="label-canvas--hidden").
  const drawLabel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    renderContent(ctx, canvas.width, canvas.height, CONTENT_LEFT + CONTENT_WIDTH / 2);
  }, [renderContent, CONTENT_LEFT, CONTENT_WIDTH]);

  // Cropped preview canvas — exactly CONTENT_WIDTH x contentHeight,
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
  }, [drawLabel, drawPreview, feedHeight, contentHeight]);

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
      if (selectedDateTemplate) {
        applyDateTemplate(selectedDateTemplate);
        // Wait a tick so the redraw effect runs with the fresh
        // timestamp before we read the canvas for printing.
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
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
          <span>Mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="manual">Manual</option>
            <option value="templates">Templates</option>
          </select>
        </label>

        {mode === 'manual' && (
          <>
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
              <span>Save current as template</span>
              <div className="save-template-row">
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="Template name"
                  maxLength={40}
                />
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={!newTemplateName.trim()}
                >
                  Save
                </button>
              </div>
            </label>
          </>
        )}

        {mode === 'templates' && (
          <>
            <label className="field">
              <span>Date template</span>
              <div className="save-template-row">
                <select
                  value={selectedDateTemplate}
                  onChange={(e) => applyDateTemplate(e.target.value)}
                >
                  <option value="" disabled>
                    Choose a date template...
                  </option>
                  {Object.keys(DATE_TEMPLATES).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => applyDateTemplate(selectedDateTemplate)}
                  disabled={!selectedDateTemplate}
                >
                  Refresh
                </button>
              </div>
              <p className="hint">
                Fills in the current date/time — hit Refresh right before printing so the
                timestamp is accurate.
              </p>
            </label>

            <label className="field">
              <span>Content template</span>
              {contentTemplates.length === 0 ? (
                <p className="hint">
                  No saved templates yet — switch to Manual, set up a label, and save it as a
                  template.
                </p>
              ) : (
                <div className="save-template-row">
                  <select
                    value={selectedContentTemplate}
                    onChange={(e) => applyContentTemplate(e.target.value)}
                  >
                    <option value="" disabled>
                      Choose a template...
                    </option>
                    {contentTemplates.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {selectedContentTemplate && (
                    <button
                      type="button"
                      onClick={() => {
                        deleteTemplate(selectedContentTemplate);
                        setSelectedContentTemplate('');
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </label>
          </>
        )}

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
          height={contentHeight}
          className="label-canvas"
        />
      </div>

      {/* Full 384px-wide canvas at the full feed height — not shown,
          but must stay mounted since it's what actually gets sent to
          printLabel(). The extra height beyond contentHeight is
          blank feed continuing on to the next label. */}
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
        Requires Chrome or Edge over HTTPS (or localhost) — Web Bluetooth
        isn't supported in Safari or Firefox.
      </p>
    </div>
  );
}

export default App;