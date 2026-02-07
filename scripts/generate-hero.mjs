import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const imagesDir = join(projectRoot, 'public', 'images');

const svgBuffer = readFileSync(join(imagesDir, 'hero.svg'));

async function generateHero() {
  await sharp(svgBuffer)
    .resize(1200, 630)
    .png()
    .toFile(join(imagesDir, 'hero.png'));
  console.log('Generated hero.png (1200x630)');
}

generateHero().catch(console.error);
