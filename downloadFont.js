const https = require('https');
const fs = require('fs');
const path = require('path');

const fontDir = path.join(__dirname, 'assets/fonts');
const fontPath = path.join(fontDir, 'Roboto-Regular.ttf');

// Create directory if it doesn't exist
if (!fs.existsSync(fontDir)) {
  fs.mkdirSync(fontDir, { recursive: true });
}

// Google Fonts direct link to Roboto Regular
const fontUrl = 'https://github.com/google/fonts/raw/main/apache/roboto/Roboto-Regular.ttf';

console.log('⏳ Downloading Roboto font from Google Fonts...');

https.get(fontUrl, (response) => {
  if (response.statusCode === 302 || response.statusCode === 301) {
    // Follow redirect
    return https.get(response.headers.location, downloadFont);
  }
  downloadFont(response);
}).on('error', (err) => {
  console.error('❌ Error downloading font:', err.message);
});

function downloadFont(response) {
  const fileStream = fs.createWriteStream(fontPath);
  
  response.pipe(fileStream);
  
  fileStream.on('finish', () => {
    fileStream.close();
    const stats = fs.statSync(fontPath);
    console.log(`✅ Font downloaded successfully! (${stats.size} bytes)`);
    console.log(`📍 Location: ${fontPath}`);
  });
  
  fileStream.on('error', (err) => {
    fs.unlink(fontPath, () => {});
    console.error('❌ Error writing font file:', err.message);
  });
}