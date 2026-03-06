// downloadFont.js
// Ensures a valid Roboto font exists in assets/fonts for image text rendering.

const https = require('https');
const fs = require('fs');
const path = require('path');

const FONTS_DIR = path.join(__dirname, 'assets', 'fonts');
const TARGET = path.join(FONTS_DIR, 'Roboto-Regular.ttf');

const ROBOTO_URLS = [
  // Static regular first (most compatible)
  'https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/static/Roboto-Regular.ttf',
  // Alternate tree layouts used in older snapshots
  'https://raw.githubusercontent.com/google/fonts/main/apache/roboto/Roboto-Regular.ttf',
  'https://github.com/google/fonts/raw/main/apache/roboto/Roboto-Regular.ttf',
  'https://github.com/google/fonts/raw/main/ofl/roboto/static/Roboto-Regular.ttf',
  // Variable fallback
  'https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto%5Bwdth,wght%5D.ttf',
  'https://github.com/google/fonts/raw/main/ofl/roboto/Roboto%5Bwdth,wght%5D.ttf'
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isValidTtf(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < 10 * 1024) return false;
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    const sig = buf.toString('ascii');
    // TTF/OTF signatures
    return sig === 'OTTO' || sig === 'true' || sig === 'typ1' || buf.equals(Buffer.from([0x00, 0x01, 0x00, 0x00]));
  } catch (_) {
    return false;
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close(() => fs.unlink(dest, () => {}));
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      file.close(() => fs.unlink(dest, () => {}));
      reject(err);
    });
  });
}

(async () => {
  try {
    ensureDir(FONTS_DIR);
    if (isValidTtf(TARGET)) {
      console.log('Roboto font already present:', TARGET);
      process.exit(0);
    }
    if (fs.existsSync(TARGET)) {
      try { fs.unlinkSync(TARGET); } catch (_) {}
    }

    console.log('Downloading Roboto to', TARGET);
    let downloaded = false;
    for (const url of ROBOTO_URLS) {
      try {
        await download(url, TARGET);
        if (isValidTtf(TARGET)) {
          downloaded = true;
          break;
        }
        console.warn('Downloaded file is not a valid TTF. Retrying next source:', url);
        try { fs.unlinkSync(TARGET); } catch (_) {}
      } catch (err) {
        console.warn('Roboto download source failed:', url, err && err.message);
      }
    }

    if (!downloaded) throw new Error('Unable to download a valid Roboto TTF');
    console.log('Roboto downloaded successfully');
    process.exit(0);
  } catch (e) {
    console.error('Failed to download Roboto:', e && e.message);
    // Do not hard fail startup; allow app to continue. Text may fall back to Sans.
    process.exit(0);
  }
})();
