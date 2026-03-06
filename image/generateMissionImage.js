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
try {
  if (!canvasBackendAvailable) throw new Error('canvas backend unavailable');
  const robotoPath = path.join(__dirname, '..', 'assets', 'fonts', 'Roboto-Regular.ttf');
  const exists = fs.existsSync(robotoPath);
  const ok = exists ? registerFont(robotoPath, { family: 'Roboto' }) : false;
  if (ok) registeredFamilies.add('Roboto');
  console.log('Font exists (Roboto):', exists, 'register:', ok, '=>', robotoPath);
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
        const ok = registerFont(full, { family });
        if (ok) {
          registeredFamilies.add(family);
          console.log('Registered font:', full, 'as', family);
        }
      } catch (e) {
        console.log('Failed to register font', full, e && e.message);
      }
    }
  } catch (err) {
    console.log('Font scan failed for', fontsDir, err && err.message);
  }
}

// Prefer Roboto if available
let fontFamily = registeredFamilies.has('Roboto') ? 'Roboto' : (registeredFamilies.size > 0 ? Array.from(registeredFamilies)[0] : null);

function fontOrFallback(px, weight) {
  if (fontFamily) {
    return `${weight ? weight + ' ' : ''}${px}px "${fontFamily}"`;
  }
  return `${weight ? weight + ' ' : ''}${px}px sans-serif`;
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

  // Optional production font test overlay (enable with FONT_DEBUG=1 or FONT_TEST=1)
  try {
    const showFontTest = process.env.FONT_DEBUG === '1' || process.env.FONT_TEST === '1';
    if (showFontTest) {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = fontOrFallback(30, 'bold');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('TEXT TEST', 50, 50);
      console.log('DREW FONT TEST OVERLAY');
    }
  } catch (e) {
    console.log('Font test overlay error:', e && e.message);
  }

  // ===== HEADER (always drawn outside loops) =====
  ctx.fillStyle = '#FFFFFF';
  ctx.font = fontOrFallback(56, 'bold');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TACTIOPBOT', width / 2, 60);
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
    ctx.fillStyle = '#FFFFFF';
    ctx.font = fontOrFallback(36, 'bold');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Draw sequential slot label for selected missions (M1..Mn)
    const missionText = String(mission.name || '').trim();
    const slotLabel = `M${slotIndex + 1} - ${missionText}`;
    ctx.fillText(slotLabel, cardX + cardPadding, cardY + 46);
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
      ctx.fillStyle = '#FF6B6B';
      ctx.font = fontOrFallback(24, 'bold');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⏭️ SKIPPED', cardX + cardWidth / 2, cardY + Math.max(100, cardHeight / 2));
      y = cardY + cardHeight + 30;
      continue;
    }

    if (!hasOps) {
      ctx.fillStyle = '#BBBBBB';
      ctx.font = fontOrFallback(22, 'bold');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No Operators', cardX + cardWidth / 2, cardY + Math.max(100, cardHeight / 2));
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
          ctx.font = fontOrFallback(28, 'bold');
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', opX + opTileWidth / 2, opY + (opTileHeight - 50) / 2 + 12);
        }
      } else {
        // no image file; draw placeholder and continue to draw name
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        drawRoundedRect(ctx, opX + 10, opY + 10, opTileWidth - 20, opTileHeight - 50, 6);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = fontOrFallback(28, 'bold');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', opX + opTileWidth / 2, opY + (opTileHeight - 50) / 2 + 12);
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
      ctx.font = fontOrFallback(14, 'bold');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const opNameText = String(op.name || '').trim();
      let display = opNameText;
      const maxW = labelW - labelPaddingX * 2;
      while (ctx.measureText(display).width > maxW && display.length > 0) {
        display = display.slice(0, -1);
      }
      if (display !== opNameText && display.length > 3) display = display.slice(0, -3) + '...';
      ctx.fillText(display, labelX + labelW / 2, labelY + labelHeight / 2);
      console.log('DREW OP NAME:', opNameText, '=>', display);

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
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = fontOrFallback(14, '');
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Powered by ytmazen', width - 40, height - 18);
  console.log('DREW FOOTER: Powered by ytmazen');

  return canvas.toBuffer('image/png');
};
