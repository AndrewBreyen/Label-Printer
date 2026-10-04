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
import { getMarkdownContentHeight, renderMarkdownContent } from './markdown';
import {
  generateBarcodeCanvas,
  drawRotatedBarcode,
  drawRotatedCanvas,
  TAPE_WIDTH_PX,
  PX_PER_MM as BARCODE_PX_PER_MM,
  BARCODE_SIDE_MARGIN_PX,
  BARCODE_HEIGHT_PX,
  CONTINUOUS_PAPER_TYPE,
} from './barcodeUtils';
import { generateTextCanvas } from './textLabelUtils';
import { ditherImageData } from './imageUtils';
import './App.css';

// Canvas width MUST equal REQUIRED_IMAGE_WIDTH (384px) — this is a
// firmware requirement, not something that varies per label size.
const LABEL_WIDTH = REQUIRED_IMAGE_WIDTH;

function App() {
  const DEFAULT_MARKDOWN = '# Hello World';
  const [markdownContent, setMarkdownContent] = useState(DEFAULT_MARKDOWN);
  const [mode, setMode] = useState('manual'); // 'manual' | 'templates' | 'prep' | 'receipt' | 'image' | 'barcode' | 'text'
  const [templateName, setTemplateName] = useState(DEFAULT_TEMPLATE_NAME);
  const template = LABEL_TEMPLATES[templateName];
  const isReceiptMode = mode === 'receipt';
  const CONTENT_WIDTH = isReceiptMode ? LABEL_WIDTH : template.width;
  const CONTENT_LEFT = isReceiptMode ? 0 : LABEL_WIDTH - CONTENT_WIDTH;
  const contentHeight = isReceiptMode
    ? getMarkdownContentHeight(markdownContent, CONTENT_WIDTH, 'monospace') + 32
    : template.contentHeight; // visible content box — what the cropped preview shows
  const feedHeight = isReceiptMode ? contentHeight : template.feedHeight;
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  // Manual vs Templates vs Prep Label vs Barcode mode, and the saved
  // content presets used by Templates mode.
  const { templates: contentTemplates, saveTemplate, deleteTemplate } = useContentTemplates();
  const [selectedContentTemplate, setSelectedContentTemplate] = useState('');
  const [newTemplateName, setNewTemplateName] = useState('');

  const applyContentTemplate = (name) => {
    const t = contentTemplates.find((tpl) => tpl.name === name);
    if (!t) return;
    setSelectedContentTemplate(name);
    setMarkdownContent(t.markdown);
  };

  const handleSaveTemplate = () => {
    const name = newTemplateName.trim();
    if (!name) return;
    saveTemplate(name, { markdown: markdownContent });
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

  // Prep Label mode: item name + a date-only picker for "USE BY".
  // PREP always shows the live current date/time ({{now}}); USE BY
  // combines the picked date with the current time-of-day
  // ({{nowtime}}) — the date is fixed by your selection, the time
  // portion stays live just like PREP's does.
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const [prepItemName, setPrepItemName] = useState('');
  const [prepUseByDate, setPrepUseByDate] = useState(todayISO());

  useEffect(() => {
    if (mode !== 'prep') return;
    // Parse as local time (not UTC) so the picked date doesn't shift
    // a day depending on timezone.
    const [y, m, d] = prepUseByDate.split('-').map(Number);
    const useByLabel =
      y && m && d
        ? new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
        : '';
    const name = prepItemName.trim() || 'Item';
    setMarkdownContent(
      `# ${name}\n\nPREP\n## {{now}}\n\nUSE BY\n## ${useByLabel} {{nowtime}}`
    );
  }, [mode, prepItemName, prepUseByDate]);

  // Barcode mode: a single value to encode as CODE128, printed
  // rotated 90° so it fills the full 15mm width of continuous tape
  // (see barcodeUtils.js). Unlike the markdown modes, the print
  // length here isn't fixed by a label template — it's however long
  // the encoded bar sequence needs to be, which is exactly how
  // continuous roll stock is meant to be used.
  const [barcodeValue, setBarcodeValue] = useState('412  0115711#$578=@;<');
  const [barcodeError, setBarcodeError] = useState('');
  const [barcodeLengthMm, setBarcodeLengthMm] = useState(null);
  const [textValue, setTextValue] = useState('');
  const [textError, setTextError] = useState('');
  const [textLengthMm, setTextLengthMm] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageHeight, setImageHeight] = useState(1);
  const [imageLightenAmount, setImageLightenAmount] = useState(80);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState('');

  const canvasRef = useRef(null); // full 384px-wide canvas — hidden, this is what actually gets sent to the printer
  const previewCanvasRef = useRef(null); // visible content preview — cropped for labels, full width for receipts
  const rulerCanvasRef = useRef(null);
  const barcodeCanvasRef = useRef(null); // full 384px-wide canvas for barcode mode — hidden, sent to the printer
  const barcodePreviewCanvasRef = useRef(null); // cropped 15mm-wide canvas — what's shown on screen for barcode mode
  const textCanvasRef = useRef(null);
  const textPreviewCanvasRef = useRef(null);
  const imageCanvasRef = useRef(null);
  const imagePreviewCanvasRef = useRef(null);
  const imageRef = useRef(null);
  const [showRuler, setShowRuler] = useState(false);

  useEffect(() => {
    if (!imageFile) {
      imageRef.current = null;
      setImageHeight(1);
      setImageLoaded(false);
      setImageError('');
      return undefined;
    }

    setImageLoaded(false);
    const objectUrl = URL.createObjectURL(imageFile);
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (cancelled) return;
      if (!image.naturalWidth || !image.naturalHeight) {
        setImageError('The selected image has invalid dimensions.');
        return;
      }
      imageRef.current = image;
      setImageHeight(
        Math.max(1, Math.round((image.naturalHeight * LABEL_WIDTH) / image.naturalWidth))
      );
      setImageLoaded(true);
      setImageError('');
    };
    image.onerror = () => {
      if (!cancelled) {
        imageRef.current = null;
        setImageLoaded(false);
        setImageError('Could not load the selected image.');
      }
    };
    image.src = objectUrl;

    return () => {
      cancelled = true;
      imageRef.current = null;
      URL.revokeObjectURL(objectUrl);
    };
  }, [imageFile]);

  const drawImageLabel = useCallback(() => {
    const image = imageRef.current;
    const printCanvas = imageCanvasRef.current;
    const previewCanvas = imagePreviewCanvasRef.current;
    if (!image || !printCanvas || !previewCanvas) return;

    for (const canvas of [printCanvas, previewCanvas]) {
      canvas.width = LABEL_WIDTH;
      canvas.height = imageHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not create the image print canvas.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, LABEL_WIDTH, imageHeight);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      context.putImageData(ditherImageData(imageData, imageLightenAmount), 0, 0);
    }
  }, [imageHeight, imageLightenAmount]);

  useEffect(() => {
    if (mode === 'image' && imageRef.current) drawImageLabel();
  }, [mode, imageHeight, imageLoaded, drawImageLabel]);

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
      renderMarkdownContent(
        ctx,
        markdownContent,
        CONTENT_WIDTH,
        contentBoxHeight,
        isReceiptMode ? { fontFamily: 'monospace' } : undefined
      );

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
    [markdownContent, contentHeight, CONTENT_WIDTH, isReceiptMode]
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

  // Barcode mode's own draw pass. The print length depends on the
  // encoded value, so — unlike drawLabel/drawPreview — the canvases
  // are resized here (canvas.width/height are set imperatively,
  // which is also what clears them) rather than sized from a fixed
  // template. Generates the barcode once and draws it into both the
  // full print canvas (content anchored to the right edge, same
  // convention as the markdown modes) and the cropped preview.
  const drawBarcode = useCallback(() => {
    const printCanvas = barcodeCanvasRef.current;
    const previewCanvas = barcodePreviewCanvasRef.current;
    if (!printCanvas || !previewCanvas) return;

    setBarcodeError('');
    setBarcodeLengthMm(null);
    const value = barcodeValue.trim();

    if (!value) {
      printCanvas.width = LABEL_WIDTH;
      printCanvas.height = 1;
      previewCanvas.width = TAPE_WIDTH_PX;
      previewCanvas.height = 1;
      return;
    }

    let barcodeImage;
    try {
      barcodeImage = generateBarcodeCanvas(value, BARCODE_HEIGHT_PX);
    } catch (err) {
      setBarcodeError(err.message);
      printCanvas.width = LABEL_WIDTH;
      printCanvas.height = 1;
      previewCanvas.width = TAPE_WIDTH_PX;
      previewCanvas.height = 1;
      return;
    }

    const printLength = barcodeImage.width;
    setBarcodeLengthMm(printLength / BARCODE_PX_PER_MM);

    printCanvas.width = LABEL_WIDTH;
    printCanvas.height = printLength;
    const printCtx = printCanvas.getContext('2d');
    printCtx.fillStyle = '#ffffff';
    printCtx.fillRect(0, 0, printCanvas.width, printCanvas.height);
    printCtx.save();
    printCtx.translate(LABEL_WIDTH - TAPE_WIDTH_PX + BARCODE_SIDE_MARGIN_PX, 0);
    drawRotatedBarcode(printCtx, barcodeImage);
    printCtx.restore();

    previewCanvas.width = TAPE_WIDTH_PX;
    previewCanvas.height = printLength;
    const previewCtx = previewCanvas.getContext('2d');
    previewCtx.fillStyle = '#ffffff';
    previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.translate(BARCODE_SIDE_MARGIN_PX, 0);
    drawRotatedBarcode(previewCtx, barcodeImage);
  }, [barcodeValue]);

  useEffect(() => {
    if (mode === 'barcode') drawBarcode();
  }, [mode, drawBarcode]);

  const drawText = useCallback(() => {
    const printCanvas = textCanvasRef.current;
    const previewCanvas = textPreviewCanvasRef.current;
    if (!printCanvas || !previewCanvas) return;

    setTextError('');
    setTextLengthMm(null);
    if (!textValue.trim()) {
      printCanvas.width = LABEL_WIDTH;
      printCanvas.height = 1;
      previewCanvas.width = TAPE_WIDTH_PX;
      previewCanvas.height = 1;
      return;
    }

    const textImage = generateTextCanvas(textValue);
    const printLength = textImage.width;
    setTextLengthMm(printLength / BARCODE_PX_PER_MM);

    printCanvas.width = LABEL_WIDTH;
    printCanvas.height = printLength;
    const printContext = printCanvas.getContext('2d');
    if (!printContext) throw new Error('Could not create the text label print canvas.');
    printContext.fillStyle = '#ffffff';
    printContext.fillRect(0, 0, printCanvas.width, printCanvas.height);
    printContext.save();
    printContext.translate(LABEL_WIDTH - TAPE_WIDTH_PX, 0);
    drawRotatedCanvas(printContext, textImage);
    printContext.restore();

    previewCanvas.width = TAPE_WIDTH_PX;
    previewCanvas.height = printLength;
    const previewContext = previewCanvas.getContext('2d');
    if (!previewContext) throw new Error('Could not create the text label preview canvas.');
    previewContext.fillStyle = '#ffffff';
    previewContext.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    drawRotatedCanvas(previewContext, textImage);
  }, [textValue]);

  useEffect(() => {
    if (mode !== 'text') return;
    try {
      drawText();
    } catch (err) {
      setTextError(err.message);
    }
  }, [mode, drawText]);

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
      await printLabel(
        canvasRef.current,
        isReceiptMode ? { paperType: CONTINUOUS_PAPER_TYPE } : undefined
      );
      setStatus('Label sent to printer.');
    } catch (err) {
      setStatus(`Print failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handlePrintBarcode = async () => {
    if (!isPrinterConnected()) {
      setStatus('Connect the printer first.');
      return;
    }
    if (!barcodeValue.trim()) {
      setStatus('Enter a value to encode first.');
      return;
    }
    setBusy(true);
    setStatus('Printing...');
    try {
      drawBarcode();
      if (barcodeError) throw new Error(barcodeError);
      // Continuous roll stock, not a gap/die-cut label — see
      // barcodeUtils.js's CONTINUOUS_PAPER_TYPE.
      await printLabel(barcodeCanvasRef.current, { paperType: CONTINUOUS_PAPER_TYPE });
      setStatus('Label sent to printer.');
    } catch (err) {
      setStatus(`Print failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handlePrintText = async () => {
    if (!isPrinterConnected()) {
      setStatus('Connect the printer first.');
      return;
    }
    if (!textValue.trim()) {
      setStatus('Enter text to print first.');
      return;
    }
    setBusy(true);
    setStatus('Printing...');
    try {
      drawText();
      await printLabel(textCanvasRef.current, { paperType: CONTINUOUS_PAPER_TYPE });
      setStatus('Label sent to printer.');
    } catch (err) {
      setStatus(`Print failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handlePrintImage = async () => {
    if (!isPrinterConnected()) {
      setStatus('Connect the printer first.');
      return;
    }
    if (!imageRef.current) {
      setStatus('Choose an image to print first.');
      return;
    }
    setBusy(true);
    setStatus('Printing...');
    try {
      drawImageLabel();
      await printLabel(imageCanvasRef.current, { paperType: CONTINUOUS_PAPER_TYPE });
      setStatus('Image sent to printer.');
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

  const handlePrintClick =
    mode === 'barcode'
      ? handlePrintBarcode
      : mode === 'text'
        ? handlePrintText
        : mode === 'image'
          ? handlePrintImage
          : handlePrint;
  const printDisabled =
    busy ||
    !connected ||
    (mode === 'barcode' && !barcodeValue.trim()) ||
    (mode === 'text' && !textValue.trim()) ||
    (mode === 'image' && !imageLoaded);

  return (
    <div className="app">
      <h1>Label Printer</h1>

      <div className="panel">
        <label className="field">
          <span>Mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="manual">Manual</option>
            <option value="templates">Templates</option>
            <option value="prep">Prep Label</option>
            <option value="receipt">58mm Receipt</option>
            <option value="image">Image (58mm Continuous)</option>
            <option value="barcode">Barcode (15mm Continuous)</option>
            <option value="text">Rotated Text (15mm Continuous)</option>
          </select>
        </label>

        {(mode === 'manual' || isReceiptMode) && (
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

        {isReceiptMode && (
          <p className="hint">
            Prints on 58mm continuous receipt paper using the full 384-dot print width. Receipt
            length adjusts to the markdown content.
          </p>
        )}

        {mode === 'image' && (
          <>
            <label className="field">
              <span>Image to print</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => {
                  setImageError('');
                  setImageLoaded(false);
                  setImageFile(event.target.files?.[0] || null);
                }}
              />
            </label>
            {imageError && <p className="status">{imageError}</p>}
            {imageLoaded && (
              <>
                <label className="field">
                  <span>Lighten image: {imageLightenAmount}</span>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    step="1"
                    value={imageLightenAmount}
                    onChange={(event) => setImageLightenAmount(Number(event.target.value))}
                    aria-label="Lighten image"
                  />
                  <span className="image-darkness-scale">
                    <span>Darker</span>
                    <span>Lighter</span>
                  </span>
                  <span className="hint">
                    Adds brightness before dithering; increase this if the print is too dark.
                  </span>
                </label>
                <p className="hint">
                  Converted to dithered black and white, printed at 58mm width with the original
                  aspect ratio. Approximate length: {(imageHeight / BARCODE_PX_PER_MM).toFixed(1)}{' '}
                  mm.
                </p>
              </>
            )}
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

        {mode === 'prep' && (
          <>
            <label className="field">
              <span>Item name</span>
              <input
                type="text"
                value={prepItemName}
                onChange={(e) => setPrepItemName(e.target.value)}
                placeholder="e.g. Egg"
                maxLength={40}
              />
            </label>

            <label className="field">
              <span>Use by date</span>
              <input
                type="date"
                value={prepUseByDate}
                onChange={(e) => setPrepUseByDate(e.target.value)}
              />
            </label>

            <p className="hint">
              PREP shows the current date/time automatically. USE BY shows the date you pick
              above, paired with the current time — both refresh to the live time right before
              printing.
            </p>
          </>
        )}

        {mode === 'barcode' && (
          <>
            <label className="field">
              <span>Value to encode (CODE128)</span>
              <input
                type="text"
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value)}
                placeholder="e.g. SKU-10294"
                maxLength={80}
              />
            </label>

            {barcodeError && <p className="status">{barcodeError}</p>}

            <p className="hint">
              Printed rotated 90° so the bars fill the full 15mm width of the tape and the code
              reads down the length of the label as it feeds out, instead of across it. Uses
              continuous roll stock — the print length is whatever the encoded value needs, not
              a fixed label size, so the "Label size" selector below doesn't apply here.
            </p>
            {barcodeLengthMm !== null && (
              <p className="hint">
                Calculated print length: {barcodeLengthMm.toFixed(1)} mm
              </p>
            )}
          </>
        )}

        {mode === 'text' && (
          <>
            <label className="field">
              <span>Text to print</span>
              <textarea
                className="markdown-input"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder={'# Big heading\n## Smaller heading\nBody text'}
                rows={6}
              />
              <p className="hint">
                <code># text</code> = big heading, <code>## text</code> = smaller heading, plain
                text = body, blank line = spacing. <code>{'{{now}}'}</code> and{' '}
                <code>{'{{now+7d}}'}</code> insert live dates.
              </p>
            </label>

            {textError && <p className="status">{textError}</p>}
            <p className="hint">
              Printed rotated 90° along the 15mm tape. The label length follows the widest text
              line.
            </p>
            {textLengthMm !== null && (
              <p className="hint">Calculated print length: {textLengthMm.toFixed(1)} mm</p>
            )}
          </>
        )}

        {mode !== 'barcode' && mode !== 'text' && mode !== 'image' && !isReceiptMode && (
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
        )}

      </div>

      {mode === 'image' ? (
        imageLoaded ? (
          <div className="preview">
            <canvas
              ref={imagePreviewCanvasRef}
              width={LABEL_WIDTH}
              height={imageHeight}
              className="label-canvas"
            />
          </div>
        ) : null
      ) : mode === 'barcode' ? (
        <div className="preview">
          <canvas
            ref={barcodePreviewCanvasRef}
            width={TAPE_WIDTH_PX}
            height={1}
            className="label-canvas"
          />
        </div>
      ) : mode === 'text' ? (
        <div className="preview">
          <canvas
            ref={textPreviewCanvasRef}
            width={TAPE_WIDTH_PX}
            height={1}
            className="label-canvas"
          />
        </div>
      ) : (
        <div className="preview">
          <canvas
            ref={previewCanvasRef}
            width={CONTENT_WIDTH}
            height={contentHeight}
            className="label-canvas"
          />
        </div>
      )}

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

      {/* Full 384px-wide canvas for barcode mode — hidden, sized
          dynamically in drawBarcode() to match the encoded value's
          print length. */}
      <canvas ref={barcodeCanvasRef} width={LABEL_WIDTH} height={1} style={{ display: 'none' }} />
      <canvas ref={textCanvasRef} width={LABEL_WIDTH} height={1} style={{ display: 'none' }} />
      <canvas ref={imageCanvasRef} width={LABEL_WIDTH} height={1} style={{ display: 'none' }} />

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
        <button onClick={handlePrintClick} disabled={printDisabled}>
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
