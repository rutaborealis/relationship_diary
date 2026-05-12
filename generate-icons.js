// Run once: node generate-icons.js
// Requires: npm install sharp
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svg = fs.readFileSync(path.join(__dirname, 'public/icons/icon.svg'));

async function main() {
  for (const size of [192, 512]) {
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(path.join(__dirname, `public/icons/icon-${size}.png`));
    console.log(`Generated icon-${size}.png`);
  }
}

main().catch(console.error);