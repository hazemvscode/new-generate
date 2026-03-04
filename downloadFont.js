// downloadFont.js
// Downloads Roboto Regular from Google Fonts into assets/fonts if missing.

const https = require('https');
const fs = require('fs');
const path = require('path');

const FONTS_DIR = path.join(__dirname, 'assets', 'fonts');
const TARGET = path.join(FONTS_DIR, 'Roboto-Regular.ttf');

const ROBOTO_TTF_URL = 'https://github.com/google/fonts/raw/main/apache/roboto/Roboto%5Bwdth,wght%5D.ttf';
// Fallback direct regular ttf (static) if variable font fails
const ROBOTO_REGULAR_TTF_URL = 'https://github.com/google/fonts/raw/main/apache/roboto/Roboto-Regular.ttf';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
    if (fs.existsSync(TARGET) && fs.statSync(TARGET).size > 10 * 1024) {
      console.log('Roboto font already present:', TARGET);
      process.exit(0);
    }
    console.log('Downloading Roboto to', TARGET);
    try {
      await download(ROBOTO_REGULAR_TTF_URL, TARGET);
    } catch (e1) {
      console.warn('Primary Roboto regular download failed, trying variable font:', e1 && e1.message);
      await download(ROBOTO_TTF_URL, TARGET);
    }
    console.log('Roboto downloaded successfully');
    process.exit(0);
  } catch (e) {
    console.error('Failed to download Roboto:', e && e.message);
    // Do not hard fail startup; allow app to continue. Text may fall back to Sans.
    process.exit(0);
  }
})();
