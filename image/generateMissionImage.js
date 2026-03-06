const path = require('path');
const fs = require('fs');
let CanvasLib;
let usingNapi = false;
let canvasBackendAvailable = false;
try {
  CanvasLib = require('@napi-rs/canvas');
  usingNapi = true;
  canvasBackendAvailable = true;
  console.log('Using @napi-rs/canvas for rendering');
} catch (e) {
  try {
    CanvasLib = require('canvas');
    canvasBackendAvailable = true;
    console.log('Using node-canvas for rendering');
  } catch (e2) {
    canvasBackendAvailable = false;
    console.log('No canvas backend available (@napi-rs/canvas or canvas). Image generation disabled.');
  }
}
const createCanvas = canvasBackendAvailable ? CanvasLib.createCanvas : null;
const loadImage = canvasBackendAvailable ? CanvasLib.loadImage : null;
const registerFont = usingNapi && CanvasLib.GlobalFonts && typeof CanvasLib.GlobalFonts.registerFromPath === 'function'
  ? (p, opts) => {
      try {
        const ok = CanvasLib.GlobalFonts.registerFromPath(p, opts && opts.family ? opts.family : undefined);
        console.log('GlobalFonts.registerFromPath', ok ? 'ok' : 'failed', '=>', p, opts && opts.family);
        return !!ok;
      } catch (e) {
        console.log('GlobalFonts error:', e && e.message);
        return false;
      }
    }
  : (p, opts) => {
      try {
        require('canvas').registerFont(p, opts || {});
        return true;
      } catch (e) {
        console.log('registerFont fallback error:', e && e.message);
        return false;
      }
    };

const operatorImages = require('../operatorImages');

// Explicitly register Roboto for Railway reliability
const registeredFamilies = new Set();
function tryRegisterFontPath(fontPath, family) {
  try {
    if (!canvasBackendAvailable) return false;
    if (!fs.existsSync(fontPath)) return false;
    const ok = registerFont(fontPath, { family });
    if (ok) {
      registeredFamilies.add(family);
      console.log('Registered font:', fontPath, 'as', family);
      return true;
    }
  } catch (e) {
    console.log('Failed to register candidate font', fontPath, e && e.message);
  }
  return false;
}

try {
  if (!canvasBackendAvailable) throw new Error('canvas backend unavailable');
  const candidateFonts = [
    { p: path.join(__dirname, '..', 'assets', 'fonts', 'Roboto-Regular.ttf'), family: 'Roboto' },
    { p: path.join(__dirname, '..', 'fonts', 'Roboto-Regular.ttf'), family: 'Roboto' },
    { p: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', family: 'DejaVuSans' },
    { p: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', family: 'DejaVuSans' },
    { p: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', family: 'LiberationSans' },
    { p: '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf', family: 'LiberationSans' },
    { p: '/usr/share/fonts/TTF/DejaVuSans.ttf', family: 'DejaVuSans' },
  ];

  for (const c of candidateFonts) {
    tryRegisterFontPath(c.p, c.family);
  }
} catch (e) {
  console.log('Failed to register Roboto font:', e && e.message);
}

// Also scan bundled fonts as fallback
const scanFontDirs = [path.join(__dirname, '..', 'fonts'), path.join(__dirname, '..', 'assets', 'fonts')];
for (const fontsDir of scanFontDirs) {
  try {
    if (!canvasBackendAvailable) continue;
    if (!fs.existsSync(fontsDir)) continue;
    const files = fs.readdirSync(fontsDir);
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.ttf')) continue;
      const full = path.join(fontsDir, f);
      let family = f.replace(/\.ttf$/i, '')
                    .replace(/-?(Bold|Regular|Italic|Medium|SemiBold|Light|Black|ExtraBold)$/i, '')
                    .replace(/[^a-z0-9]/gi, '');
      try {
        tryRegisterFontPath(full, family);
      } catch (e) {
        console.log('Failed to register font', full, e && e.message);
      }
    }
  } catch (err) {
    console.log('Font scan failed for', fontsDir, err && err.message);
  }
}

// Prefer Roboto if available
let fontFamily = registeredFamilies.has('Roboto')
  ? 'Roboto'
  : (registeredFamilies.has('DejaVuSans')
      ? 'DejaVuSans'
      : (registeredFamilies.has('LiberationSans')
          ? 'LiberationSans'
          : (registeredFamilies.size > 0 ? Array.from(registeredFamilies)[0] : null)));
console.log('Active font family for drawing:', fontFamily || 'system sans-serif fallback');

function fontOrFallback(px, weight) {
  if (fontFamily) {
    return `${weight ? weight + ' ' : ''}${px}px "${fontFamily}"`;
  }
  return `${weight ? weight + ' ' : ''}${px}px sans-serif`;
}

// 5x7 bitmap fallback font for environments where canvas text rendering is unavailable.
const BITMAP_FONT_5X7 = {
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'B': ['11110','10001','10001','11110','10001','10001','11110'],
  'C': ['01111','10000','10000','10000','10000','10000','01111'],
  'D': ['11110','10001','10001','10001','10001','10001','11110'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'F': ['11111','10000','10000','11110','10000','10000','10000'],
  'G': ['01111','10000','10000','10111','10001','10001','01111'],
  'H': ['10001','10001','10001','11111','10001','10001','10001'],
  'I': ['11111','00100','00100','00100','00100','00100','11111'],
  'J': ['00001','00001','00001','00001','10001','10001','01110'],
  'K': ['10001','10010','10100','11000','10100','10010','10001'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10001','10001','10001','10001'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'Q': ['01110','10001','10001','10001','10101','10010','01101'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'V': ['10001','10001','10001','10001','01010','01010','00100'],
  'W': ['10001','10001','10001','10001','10101','11011','10001'],
  'X': ['10001','01010','00100','00100','00100','01010','10001'],
  'Y': ['10001','01010','00100','00100','00100','00100','00100'],
  'Z': ['11111','00010','00100','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','01110'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '.': ['00000','00000','00000','00000','00000','01100','01100'],
  ',': ['00000','00000','00000','00000','00110','00100','01000'],
  ':': ['00000','01100','01100','00000','01100','01100','00000'],
  '/': ['00001','00010','00010','00100','01000','01000','10000'],
  "'": ['01100','01100','00100','00000','00000','00000','00000'],
  '?': ['01110','10001','00001','00010','00100','00000','00100'],
  '(': ['00010','00100','01000','01000','01000','00100','00010'],
  ')': ['01000','00100','00010','00010','00010','00100','01000'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000']
};

function bitmapTextWidth(text, px) {
  const scale = Math.max(1, Math.floor(px / 7));
  const chars = String(text || '').toUpperCase().split('');
  return chars.length * (5 * scale + scale);
}

function drawBitmapText(ctx, text, x, y, px, color, align, baseline) {
  const scale = Math.max(1, Math.floor(px / 7));
  const upper = String(text || '').toUpperCase();
  const totalW = bitmapTextWidth(upper, px);
  const totalH = 7 * scale;
  let drawX = x;
  let drawY = y;

  if (align === 'center') drawX -= Math.floor(totalW / 2);
  else if (align === 'right') drawX -= totalW;

  if (baseline === 'middle') drawY -= Math.floor(totalH / 2);
  else if (baseline === 'alphabetic' || baseline === 'bottom') drawY -= totalH;

  ctx.fillStyle = color || '#FFFFFF';
  let cx = drawX;
  for (const ch of upper) {
    const glyph = BITMAP_FONT_5X7[ch] || BITMAP_FONT_5X7['?'];
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === '1') {
          ctx.fillRect(cx + col * scale, drawY + row * scale, scale, scale);
        }
      }
    }
    cx += (5 * scale + scale);
  }
}

function drawTextSafe(ctx, text, x, y, opts = {}) {
  const {
    px = 16,
    weight = 'bold',
    color = '#FFFFFF',
    align = 'left',
    baseline = 'alphabetic',
    forceBitmap = !fontFamily
  } = opts;

  if (forceBitmap) {
    drawBitmapText(ctx, text, x, y, px, color, align, baseline);
    return;
  }

  ctx.fillStyle = color;
  ctx.font = fontOrFallback(px, weight);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(String(text || ''), x, y);
}

function textWidthSafe(ctx, text, px, weight = 'bold') {
  if (!fontFamily) return bitmapTextWidth(text, px);
  ctx.font = fontOrFallback(px, weight);
  return ctx.measureText(String(text || '')).width;
}

function normalizeKey(name) {
  if (!name) return '';
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function possibleFileNames(name) {
  if (!name) return [];
  const n = String(name).trim();
  return [n + '.png', n + '.jpg', n + '.jpeg', n + '.PNG', n + '.JPG', n + '.JPEG'];
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = r || 6;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

module.exports = async function generateMissionImage(missions = []) {
  if (!canvasBackendAvailable || !createCanvas || !loadImage) {
    throw new Error('Image rendering backend not available on this host');
  }

  // Configuration
  const width = 1200;
  const opsPerRow = 5;
  const opTileWidth = 100;
  const opTileHeight = 150; // room for name label
  const rowHeight = 170;

  // Directories to search for operator images
  const operatorDirs = [
    path.join(__dirname, '..', 'images', 'operators'),
    path.join(__dirname, '..', 'image'),
    path.join(__dirname, '..', 'images'),
  ];

  console.log('🔍 Operator image search directories:');
  operatorDirs.forEach((dir, i) => {
    console.log(`  [${i+1}] ${dir} (exists: ${fs.existsSync(dir)})`);
  });

  // Keep all 8 slots; draw skipped as a card with label
  const allSlots = Array.isArray(missions) ? missions : [];

  // Compute canvas height dynamically based on all slots
  let estimatedHeight = 140; // header space
  for (const mission of allSlots) {
    const isSkip = !mission || String(mission.name).trim().toLowerCase() === 'skip';
    const operatorCount = isSkip ? 0 : (Array.isArray(mission.operators) ? mission.operators.length : 0);
    const rowsNeeded = Math.max(1, Math.ceil(operatorCount / opsPerRow));
    const missionCardHeight = isSkip ? 120 : (140 + (rowsNeeded * rowHeight));
    estimatedHeight += missionCardHeight + 30; // spacing between cards
  }
  estimatedHeight += 80; // footer space
  const height = Math.max(estimatedHeight, 480);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#061C37';
  ctx.fillRect(0, 0, width, height);

  // ===== HEADER (always drawn outside loops) =====
  drawTextSafe(ctx, 'TACTIOPBOT', width / 2, 60, { px: 56, weight: 'bold', color: '#FFFFFF', align: 'center', baseline: 'middle' });
  console.log('DREW HEADER: TACTIOPBOT');

  // Divider
  ctx.strokeStyle = '#3FA9F5';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 180, 95);
  ctx.lineTo(width / 2 + 180, 95);
  ctx.stroke();

  // Start drawing missions below header
  let y = 120;

  // Helper to find operator image path
  function findOperatorImage(opName) {
    const key = normalizeKey(opName);
    const mapped = operatorImages[key] || operatorImages[opName] || operatorImages[opName && opName.trim()];
    
    // If mapped, it's the complete filename, so try it directly first
    const candidates = [];
    if (mapped) {
      candidates.push(mapped); // Try the exact mapped filename first
    }
    // Then try variations of key/opName without mapped
    if (!mapped) {
      candidates.push(...possibleFileNames(key));
      candidates.push(...possibleFileNames(opName));
    }

    const tried = new Set();
    for (const dir of operatorDirs) {
      for (const fname of candidates) {
        if (!fname) continue;
        const imgPath = path.join(dir, fname);
        if (tried.has(imgPath)) continue;
        tried.add(imgPath);
        if (fs.existsSync(imgPath)) {
          console.log(`✅ FOUND OPERATOR IMAGE: ${opName} => ${fname}`);
          return imgPath;
        }
      }
    }
    console.log(`⚠️  No operator image found for: ${opName}`);
    return null;
  }

  // Draw mission cards and operator tiles
  const highValueMissions = ['Assured', 'High Value', 'Veteran', 'Standard'];

  for (let slotIndex = 0; slotIndex < allSlots.length; slotIndex++) {
    const mission = allSlots[slotIndex] || { name: 'Skip', operators: [] };
    const isHighValue = highValueMissions.includes(mission.name);
    const cardPadding = 20;
    const cardX = 40;
    const operatorCount = Array.isArray(mission.operators) ? mission.operators.length : 0;
    const rowsNeeded = Math.max(1, Math.ceil(operatorCount / opsPerRow));
    const cardHeight = operatorCount > 0 ? 130 + rowsNeeded * rowHeight : 100;
    const cardWidth = width - 80;
    const cardY = y;

    // Glow for high value
    if (isHighValue) {
      ctx.fillStyle = 'rgba(63,169,245,0.12)';
      drawRoundedRect(ctx, cardX - 6, cardY - 6, cardWidth + 12, cardHeight + 12, 18);
      ctx.fill();
    }

    // Card background
    ctx.fillStyle = '#0b2a44';
    drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 14);
    ctx.fill();

    // Card border
    ctx.strokeStyle = '#1e5fa3';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 14);
    ctx.stroke();

    // Mission title
    // Draw sequential slot label for selected missions (M1..Mn), auto-fit inside card width.
    const missionText = String(mission.name || '').trim();
    const slotLabel = `M${slotIndex + 1} - ${missionText}`;
    let missionTitlePx = 28;
    const missionMaxW = cardWidth - (cardPadding * 2);
    while (missionTitlePx > 12 && textWidthSafe(ctx, slotLabel, missionTitlePx, 'bold') > missionMaxW) {
      missionTitlePx -= 2;
    }
    drawTextSafe(ctx, slotLabel, cardX + cardPadding, cardY + 44, { px: missionTitlePx, weight: 'bold', color: '#FFFFFF', align: 'left', baseline: 'alphabetic' });
    console.log('DREW MISSION:', slotLabel);

    // Accent line
    ctx.strokeStyle = '#3FA9F5';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cardX + cardPadding, cardY + 74);
    ctx.lineTo(cardX + cardPadding + 260, cardY + 74);
    ctx.stroke();

    // Skipped or empty states
    const isSkip = String(mission.name || '').trim().toLowerCase() === 'skip';
    const hasOps = Array.isArray(mission.operators) && mission.operators.length > 0;

    if (isSkip) {
      // Keep SKIPPED centered inside the skip card.
      drawTextSafe(ctx, 'SKIPPED', cardX + cardWidth / 2, cardY + Math.floor(cardHeight / 2), { px: 24, weight: 'bold', color: '#FF6B6B', align: 'center', baseline: 'middle' });
      y = cardY + cardHeight + 30;
      continue;
    }

    if (!hasOps) {
      drawTextSafe(ctx, 'No Operators', cardX + cardWidth / 2, cardY + Math.max(100, cardHeight / 2), { px: 22, weight: 'bold', color: '#BBBBBB', align: 'center', baseline: 'middle' });
      y = cardY + cardHeight + 30;
      continue;
    }

    // Operators
    let opX = cardX + cardPadding;
    let opY = cardY + 100;
    let opCount = 0;

    for (const op of (mission.operators || [])) {
      // Tile background and border (always)
      ctx.fillStyle = '#0f3557';
      drawRoundedRect(ctx, opX, opY, opTileWidth, opTileHeight, 10);
      ctx.fill();

      ctx.strokeStyle = '#1e5fa3';
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, opX, opY, opTileWidth, opTileHeight, 10);
      ctx.stroke();

      // Attempt to find and draw image; otherwise draw placeholder
      const foundPath = findOperatorImage(op.name);
      if (foundPath) {
        try {
          const img = await loadImage(foundPath);
          const imgW = Math.min(opTileWidth - 10, 90);
          const imgH = Math.min(opTileHeight - 55, 90);
          ctx.drawImage(img, opX + (opTileWidth - imgW) / 2, opY + 8, imgW, imgH);
          console.log(`✅ DREW IMAGE: ${op.name}`);
        } catch (err) {
          // draw subtle placeholder if load fails
          console.error(`❌ FAILED TO LOAD IMAGE: ${op.name}:`, err && err.message);
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          drawRoundedRect(ctx, opX + 10, opY + 10, opTileWidth - 20, opTileHeight - 50, 6);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          drawTextSafe(ctx, '?', opX + opTileWidth / 2, opY + (opTileHeight - 50) / 2 + 12, { px: 28, weight: 'bold', color: 'rgba(255,255,255,0.6)', align: 'center', baseline: 'middle' });
        }
      } else {
        // no image file; draw placeholder and continue to draw name
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        drawRoundedRect(ctx, opX + 10, opY + 10, opTileWidth - 20, opTileHeight - 50, 6);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        drawTextSafe(ctx, '?', opX + opTileWidth / 2, opY + (opTileHeight - 50) / 2 + 12, { px: 28, weight: 'bold', color: 'rgba(255,255,255,0.6)', align: 'center', baseline: 'middle' });
      }

      // Name label (ALWAYS drawn)
      const labelPaddingX = 6;
      const labelHeight = 28;
      const labelX = opX + 4;
      const labelY = opY + opTileHeight - labelHeight - 6;
      const labelW = opTileWidth - 8;

      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      drawRoundedRect(ctx, labelX, labelY, labelW, labelHeight, 6);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      const opNameText = String(op.name || '').trim();
      // Draw full operator name without truncation.
      drawTextSafe(ctx, opNameText, labelX + labelW / 2, labelY + labelHeight / 2, { px: 10, weight: 'bold', color: '#FFFFFF', align: 'center', baseline: 'middle' });
      console.log('DREW OP NAME:', opNameText);

      opCount++;
      opX += opTileWidth + 15;

      // wrap
      if (opCount % opsPerRow === 0) {
        opX = cardX + cardPadding;
        opY += rowHeight;
      }
    }

    y = cardY + cardHeight + 30;
  }

  // ===== FOOTER (always drawn outside loops) =====
  drawTextSafe(ctx, 'Powered by ytmazen', width - 40, height - 18, { px: 14, weight: '', color: 'rgba(255,255,255,0.9)', align: 'right', baseline: 'alphabetic' });
  console.log('DREW FOOTER: Powered by ytmazen');

  return canvas.toBuffer('image/png');
};
