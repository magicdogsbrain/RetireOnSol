import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Convert hero.svg to hero.png (1200x630 for social sharing)
const heroSvgPath = join(projectRoot, 'public/images/hero.svg');
const heroPngPath = join(projectRoot, 'public/images/hero.png');

// Convert banner.svg to banner.png (1200x600 for dApp Store)
const bannerSvgPath = join(projectRoot, 'public/images/banner.svg');
const bannerPngPath = join(projectRoot, 'public/images/banner.png');

async function convert() {
  try {
    // Hero image (for social sharing)
    const heroSvgBuffer = readFileSync(heroSvgPath);
    await sharp(heroSvgBuffer)
      .resize(1200, 630)
      .png()
      .toFile(heroPngPath);
    console.log('Successfully created hero.png (1200x630)');

    // Banner image (for dApp Store - exact 1200x600)
    const bannerSvgBuffer = readFileSync(bannerSvgPath);
    await sharp(bannerSvgBuffer)
      .resize(1200, 600)
      .png()
      .toFile(bannerPngPath);
    console.log('Successfully created banner.png (1200x600)');
  } catch (err) {
    console.error('Error:', err);
  }
}

convert();
