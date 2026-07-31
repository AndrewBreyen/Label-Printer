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
import { MARKDOWN_TEMPLATES } from './markdownTemplates';
import { renderMarkdownContent } from './markdown';
import './App.css';

// Canvas width MUST equal REQUIRED_IMAGE_WIDTH (384px) — this is a
// firmware requirement, not something that varies per label size.
const LABEL_WIDTH = REQUIRED_IMAGE_WIDTH;

function App() {
  const DEFAULT_MARKDOWN = '# Hello World';
  const [markdownContent, setMarkdownContent] = useState(DEFAULT_MARKDOWN);
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
    setMarkdownContent(t.markdown);
    setXOffset(t.xOffset);
    setYOffset(t.yOffset);
  };

  const handleSaveTemplate = () => {
    const name = newTemplateName.trim();
    if (!name) return;
    saveTemplate(name, { markdown: markdownContent, xOffset, yOffset });
    setNewTemplateName('');
    setStatus(`Saved template "${name}".`);
  };

  const [selectedCodeTemplate, setSelectedCodeTemplate] = useState('');

  const applyCodeTemplate = (name) => {
    const t = MARKDOWN_TEMPLATES[name];
    if (!t) return;
    setSelectedCodeTemplate(name);
    setMarkdownContent(t.markdown);
  };

  const canvasRef = useRef(null); // full 384px-wide canvas — hidden, this is what actually gets sent to the printer
  const previewCanvasRef = useRef(null); // cropped 260x220 canvas — what's actually shown on screen
  const rulerCanvasRef = useRef(null);
  const [showRuler, setShowRuler] = useState(false);

  // Draws the label content (parsed from markdown) into the content
  // box, translated to sit at `contentLeft` within the given canvas
  // — shared between the full/hidden print canvas and the cropped
  // visible preview canvas. Both always render against the exact
  // same CONTENT_WIDTH for text layout, just spatially translated,
  // so the preview and the real print output can never diverge.
  //
  // boxHeight is the FULL canvas height (= the exact feed distance
  // the printer advances — must stay whatever the template says).
  // contentBoxHeight is a smaller, top-anchored region within that
  // where text actually gets positioned — the remainder is just
  // blank feed continuing on to the next label.
  const renderContent = useCallback(
    (ctx, boxWidth, boxHeight, contentLeft) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, boxWidth, boxHeight);

      const contentBoxHeight = Math.min(contentHeight, boxHeight);

      ctx.save();
      ctx.translate(contentLeft, 0);
      renderMarkdownContent(ctx, markdownContent, CONTENT_WIDTH, contentBoxHeight, {
        xOffset,
        yOffset,
      });

      // Visual-only outline around the content box — light gray
      // (~#dddddd) stays above the printer's black/white threshold
      // (200), so it's visible here but never actually prints as ink.
      // Skipped when the box already fills the whole canvas (the
      // cropped preview), since the canvas's own border already
      // shows that boundary.
      if (contentBoxHeight < boxHeight) {
        ctx.strokeStyle = '#dddddd';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(0.5, 0.5, CONTENT_WIDTH - 1, contentBoxHeight - 1);
      }
      ctx.restore();
    },
    [markdownContent, xOffset, yOffset, contentHeight, CONTENT_WIDTH]
  );

  // Full 384px-wide canvas — this is the real data sent to the
  // printer, kept off-screen (see className="label-canvas--hidden").
  const drawLabel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    renderContent(ctx, canvas.width, canvas.height, CONTENT_LEFT);
  }, [renderContent, CONTENT_LEFT]);

  // Cropped preview canvas — exactly CONTENT_WIDTH x contentHeight,
  // what you actually see on screen. contentLeft is 0 since this
  // canvas already IS the cropped content region.
  const drawPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    renderContent(ctx, canvas.width, canvas.height, 0);
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
      // Redraw synchronously right before printing so any {{now}} /
      // {{now+Nd}} placeholders resolve to the actual print moment,
      // not whenever the content was last edited/selected.
      drawLabel();
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
              <span>Code template</span>
              <select
                value={selectedCodeTemplate}
                onChange={(e) => applyCodeTemplate(e.target.value)}
              >
                <option value="" disabled>
                  Choose a code template...
                </option>
                {Object.keys(MARKDOWN_TEMPLATES).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <p className="hint">
                Defined in code (markdownTemplates.js) — edit that file to add more. Any{' '}
                <code>{'{{now}}'}</code> placeholders resolve fresh every time the label
                redraws, including right before printing.
              </p>
            </label>

            <label className="field">
              <span>Saved template</span>
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
