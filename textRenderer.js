// textRenderer.js
// Utilities for drawing text onto images or new canvases, using a Railway-safe canvas engine and Roboto font.

const fs = require('fs');
const path = require('path');
let CanvasLib;
let usingNapi = false;
try {
  CanvasLib = require('@napi-rs/canvas');
  usingNapi = true;
  console.log('[textRenderer] Using @napi-rs/canvas');
} catch (_) {
  CanvasLib = require('canvas');
  console.log('[textRenderer] Using node-canvas');
}

const { createCanvas, loadImage } = CanvasLib;
const registerFont = usingNapi && CanvasLib.GlobalFonts && typeof CanvasLib.GlobalFonts.registerFromPath === 'function'
  ? (p, family) => {
      try {
        const ok = CanvasLib.GlobalFonts.registerFromPath(p, family);
        console.log('[textRenderer] GlobalFonts.registerFromPath', ok ? 'ok' : 'failed', '=>', p, family);
        return !!ok;
      } catch (e) {
        console.log('[textRenderer] GlobalFonts error:', e && e.message);
        return false;
      }
    }
  : (p, opts) => {
      try {
        require('canvas').registerFont(p, opts || {});
        console.log('[textRenderer] node-canvas.registerFont ok =>', p, opts && opts.family);
        return true;
      } catch (e) {
        console.log('[textRenderer] node-canvas.registerFont error:', e && e.message);
        return false;
      }
    };

// Register Roboto font from repo
let activeFamily = null;
(function ensureRoboto() {
  const roboto = path.join(__dirname, 'assets', 'fonts', 'Roboto-Regular.ttf');
  const exists = fs.existsSync(roboto);
  const ok = exists ? registerFont(roboto, usingNapi ? 'Roboto' : { family: 'Roboto' }) : false;
  if (ok) activeFamily = 'Roboto';
  console.log('[textRenderer] Font exists (Roboto):', exists, 'register:', ok, '=>', roboto);
})();

function fontString(size, weight) {
  if (activeFamily) return `${weight ? weight + ' ' : ''}${size}px "${activeFamily}"`;
  return `${weight ? weight + ' ' : ''}${size}px sans-serif`;
}

async function addTextToImage(imagePath, text, options = {}) {
  const img = await loadImage(imagePath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(img, 0, 0);

  const {
    x = 0,
    y = 0,
    fontSize = 32,
    color = 'white',
    font = 'Roboto',
    weight = 'bold',
    stroke = false,
    strokeColor = 'black',
    strokeWidth = 2,
    align = 'left',
    baseline = 'alphabetic',
    maxWidth
  } = options;

  ctx.fillStyle = color;
  ctx.font = fontString(fontSize, weight);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;

  if (stroke) {
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = strokeColor;
    ctx.strokeText(text, x, y, maxWidth);
  }
  ctx.fillText(text, x, y, maxWidth);

  return canvas.toBuffer('image/png');
}

async function addMultipleTexts(imagePath, texts = []) {
  const img = await loadImage(imagePath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  for (const t of texts) {
    const {
      content = '',
      x = 0,
      y = 0,
      fontSize = 24,
      color = 'white',
      weight = 'bold',
      stroke = false,
      strokeColor = 'black',
      strokeWidth = 2,
      align = 'left',
      baseline = 'alphabetic',
      maxWidth
    } = t || {};

    ctx.fillStyle = color;
    ctx.font = fontString(fontSize, weight);
    ctx.textAlign = align;
    ctx.textBaseline = baseline;

    if (stroke) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeColor;
      ctx.strokeText(content, x, y, maxWidth);
    }
    ctx.fillText(content, x, y, maxWidth);
  }

  return canvas.toBuffer('image/png');
}

async function drawText(imagePath, textParams = {}) {
  const img = await loadImage(imagePath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(img, 0, 0);

  const {
    content = '',
    x = 0,
    y = 0,
    fontSize = 24,
    color = 'white',
    weight = 'bold',
    stroke = false,
    strokeColor = 'black',
    strokeWidth = 2,
    align = 'left',
    baseline = 'alphabetic',
    maxWidth
  } = textParams || {};

  ctx.fillStyle = color;
  ctx.font = fontString(fontSize, weight);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;

  if (stroke) {
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = strokeColor;
    ctx.strokeText(content, x, y, maxWidth);
  }
  ctx.fillText(content, x, y, maxWidth);

  return canvas.toBuffer('image/png');
}

module.exports = {
  addTextToImage,
  addMultipleTexts,
  drawText,
};
