import { createQrDataUrl } from "../services/barcodeService.js";
import { printLabelRequest } from "../services/stockService.js";

// PX_PER_MM = 20 chosen because both label dimensions must produce exact integers:
//   29mm   × 20 = 580px  (exact)
//   101.6mm × 20 = 2032px (exact, since 101.6 × 20 = 2032.0)
// Any PX_PER_MM that leaves a fractional pixel for 101.6mm forces the browser to
// compress the image when mapping it onto the @page, introducing sub-pixel drift
// that shifts every subsequent label relative to the first.
const PAGE_WIDTH_MM = 29;
const PAGE_HEIGHT_MM = 101.6;
const LABEL_WIDTH_MM = 101.6;   // landscape: same value as portrait height
const LABEL_HEIGHT_MM = 29;     // landscape: same value as portrait width
const PRINT_BLOCK_X_MM = 51;    // landscape X where the printable content starts
const PRINT_BLOCK_Y_MM = 7;     // landscape Y (from top edge of label)
const QR_SIZE_MM = 12;
const TEXT_WIDTH_MM = 39;
const PX_PER_MM = 20;

const mmToPx = (mm) => Math.round(mm * PX_PER_MM);

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

// Convert every pixel to pure black or pure white.
// threshold = 245: any pixel with luminance < 245 becomes black, rest white.
const forceBlackAndWhite = (ctx, w, h, threshold = 245) => {
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const v = d[i + 3] > 0 && lum < threshold ? 0 : 255;
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
};

// Render the QR image onto a fresh square canvas at exact pixel size,
// then binarise it so every module is pure black.
const createQrCanvas = (img, sizePx) => {
  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sizePx, sizePx);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, sizePx, sizePx);
  forceBlackAndWhite(ctx, sizePx, sizePx, 250);
  return canvas;
};

// Draw text clipped to a fixed rectangle so longer values never push other elements.
const drawText = (ctx, text, x, y, maxW, fontPx) => {
  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.globalAlpha = 1;
  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.rect(x, y - fontPx, maxW, fontPx * 1.25);
  ctx.clip();
  // Triple-fill sharpens edges on thermal bitmap output.
  ctx.fillText(`${text ?? ""}`, x, y);
  ctx.fillText(`${text ?? ""}`, x, y);
  ctx.fillText(`${text ?? ""}`, x, y);
  ctx.restore();
};

// Build the landscape label canvas, then rotate it 90° CW into a portrait
// page canvas. All coordinates are computed once from constants; nothing
// is re-used or accumulated across calls.
const createPageDataUrl = async (label) => {
  // ── Landscape label canvas (LABEL_WIDTH_MM × LABEL_HEIGHT_MM) ──────────
  const lw = mmToPx(LABEL_WIDTH_MM);  // 2032px = 101.6mm exactly
  const lh = mmToPx(LABEL_HEIGHT_MM); // 580px  = 29mm   exactly
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = lw;
  labelCanvas.height = lh;
  const lCtx = labelCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
  lCtx.fillStyle = "#ffffff";
  lCtx.fillRect(0, 0, lw, lh);

  // Fixed pixel coordinates — recalculated fresh from constants every call.
  const bx   = mmToPx(PRINT_BLOCK_X_MM);          // landscape X start of block
  const by   = mmToPx(PRINT_BLOCK_Y_MM);          // landscape Y start of block
  const qrPx = mmToPx(QR_SIZE_MM);                // 240px = 12mm
  const txtX = bx + mmToPx(13);                   // text area left edge (QR 12mm + 1mm gap)
  const lblX = txtX;                              // label column X
  const sepX = txtX + mmToPx(10.8);              // colon X
  const valX = txtX + mmToPx(12.8);              // value column X
  const lblW = mmToPx(10.5);                     // label column max-width
  const valW = mmToPx(LABEL_WIDTH_MM) - valX - mmToPx(1.5); // auto-fit to remaining label width
  const rowH = mmToPx(3.2);                      // row step (baseline-to-baseline)
  const row0 = by + mmToPx(2.25);               // first row baseline Y
  const lblFz = mmToPx(2.4);                    // label font px
  const valFz = mmToPx(3.0);                    // value font px

  // QR code block
  const qrImg = await loadImage(label.qrDataUrl);
  lCtx.imageSmoothingEnabled = false;
  lCtx.drawImage(createQrCanvas(qrImg, qrPx), bx, by, qrPx, qrPx);

  // Text block — four fixed rows, same position on every label.
  lCtx.fillStyle = "#000000";
  lCtx.globalAlpha = 1;
  lCtx.textBaseline = "alphabetic";

  const rows = [
    ["Item No",   label.itemNumber],
    ["Item Name", label.itemName],
    ["Weight",    `${label.grossWeight ?? ""} g`],
    ["Purity",    label.purity],
  ];

  rows.forEach(([name, val], i) => {
    const y = row0 + rowH * i;
    lCtx.font = `700 ${lblFz}px Arial, Helvetica, sans-serif`;
    drawText(lCtx, name, lblX, y, lblW, lblFz);
    drawText(lCtx, ":", sepX, y, mmToPx(1.2), lblFz);
    lCtx.font = `700 ${valFz}px Arial, Helvetica, sans-serif`;
    drawText(lCtx, val, valX, y, valW, valFz);
  });

  // Binarise the entire label (text anti-aliasing → pure black edges).
  forceBlackAndWhite(lCtx, lw, lh, 245);

  // ── Portrait page canvas (PAGE_WIDTH_MM × PAGE_HEIGHT_MM) ───────────────
  // Rotate the landscape canvas 90° CW into portrait layout.
  // translate(pageWidth, 0) + rotate(π/2) maps:
  //   landscape (x, y) → portrait (pageWidth − y, x)
  const pw = mmToPx(PAGE_WIDTH_MM);   // 580px = 29mm
  const ph = mmToPx(PAGE_HEIGHT_MM);  // 2032px = 101.6mm
  const pageCanvas = document.createElement("canvas");
  pageCanvas.width = pw;
  pageCanvas.height = ph;
  const pCtx = pageCanvas.getContext("2d", { alpha: false });
  pCtx.fillStyle = "#ffffff";
  pCtx.fillRect(0, 0, pw, ph);
  pCtx.imageSmoothingEnabled = false;
  pCtx.resetTransform();              // start from identity — never accumulate
  pCtx.translate(pw, 0);
  pCtx.rotate(Math.PI / 2);
  pCtx.drawImage(labelCanvas, 0, 0);

  return pageCanvas.toDataURL("image/png");
};

// All labels are combined into ONE print job with page-break-after so the
// printer never double-advances between separate print() calls.
const buildPrintHtml = (pageDataUrls) => {
  const pw = PAGE_WIDTH_MM;
  const ph = PAGE_HEIGHT_MM;
  const imgW = mmToPx(pw);
  const imgH = mmToPx(ph);
  const pages = pageDataUrls.map((url) =>
    `<div class="p"><img class="i" src="${url}" alt="" width="${imgW}" height="${imgH}"></div>`
  ).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title></title><style>` +
    `@page{size:${pw}mm ${ph}mm;margin:0}` +
    `*{box-sizing:border-box;margin:0;padding:0}` +
    `html,body{width:${pw}mm;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `.p{position:relative;display:block;width:${pw}mm;height:${ph}mm;` +
    `min-height:${ph}mm;max-height:${ph}mm;overflow:hidden;page-break-after:always}` +
    `.p:last-child{page-break-after:avoid}` +
    `.i{position:absolute;left:0;top:0;width:${pw}mm;height:${ph}mm;` +
    `min-width:${pw}mm;max-width:${pw}mm;min-height:${ph}mm;max-height:${ph}mm;` +
    `display:block;image-rendering:pixelated;image-rendering:crisp-edges;` +
    `-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `@media print{html,body{margin:0;padding:0}}` +
    `</style></head><body>${pages}</body></html>`;
};

const waitForRender = async (doc) => {
  const imgs = Array.from(doc.images);
  await Promise.all(imgs.map((img) =>
    new Promise((resolve) => {
      const finish = () => {
        if (typeof img.decode === "function") {
          img.decode().catch(() => undefined).finally(() => setTimeout(resolve, 150));
        } else {
          setTimeout(resolve, 150);
        }
      };
      if (img.complete) finish();
      else {
        img.addEventListener("load", finish, { once: true });
        img.addEventListener("error", finish, { once: true });
      }
    })
  ));
  await new Promise((r) => setTimeout(r, 300));
};

const printAllLabels = async (pageDataUrls) => {
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    `position:fixed;top:0;left:0;width:${PAGE_WIDTH_MM}mm;height:${PAGE_HEIGHT_MM}mm;border:none;visibility:hidden;overflow:hidden;`;
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(buildPrintHtml(pageDataUrls));
  doc.close();

  await waitForRender(doc);

  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      resolve();
    };
    iframe.contentWindow.onafterprint = finish;
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(finish, 120000);
  });
};

const prepareLabel = async (payload) => {
  const { label } = await printLabelRequest(payload);
  const qrDataUrl = await createQrDataUrl(label.barcode || label.itemNumber || "");
  const pageDataUrl = await createPageDataUrl({ ...label, qrDataUrl });
  return { ...label, qrDataUrl, pageDataUrl };
};

export const printStockLabels = async (payloads) => {
  const prepared = await Promise.all(payloads.map(prepareLabel));
  await printAllLabels(prepared.map((l) => l.pageDataUrl));
  return prepared;
};

export const printStockLabel = async (payload) => {
  const [label] = await printStockLabels([payload]);
  return label;
};
