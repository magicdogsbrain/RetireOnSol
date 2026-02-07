import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const iconsDir = join(projectRoot, 'public', 'icons');

// Ensure icons directory exists
mkdirSync(iconsDir, { recursive: true });

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

const svgBuffer = readFileSync(join(iconsDir, 'icon.svg'));

async function generateIcons() {
  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(join(iconsDir, `icon-${size}.png`));
    console.log(`Generated icon-${size}.png`);
  }
  console.log('All icons generated!');
}

generateIcons().catch(console.error);
