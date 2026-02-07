import sharp from 'sharp';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const imagesDir = join(projectRoot, 'public/images');

// Function to create a promo image by compositing phone frame with screenshot
async function createPromoImage(config) {
  const { name, screenshot, headline1, headline2, subtitle, badges, accentColor } = config;

  // Read the screenshot
  const screenshotPath = join(imagesDir, screenshot);
  const screenshotBuffer = readFileSync(screenshotPath);

  // Resize screenshot to fit phone screen (650x1190 aspect ratio maintained)
  const resizedScreenshot = await sharp(screenshotBuffer)
    .resize(650, 1190, { fit: 'cover', position: 'top' })
    .toBuffer();

  // Create the base canvas with gradient background
  const width = 1080;
  const height = 1920;

  // Build the SVG with embedded screenshot as base64
  const screenshotBase64 = resizedScreenshot.toString('base64');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0D0D0D"/>
      <stop offset="50%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#0D0D0D"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${accentColor === 'green' ? '#14F195' : '#9945FF'}"/>
      <stop offset="100%" style="stop-color:${accentColor === 'green' ? '#9945FF' : '#14F195'}"/>
    </linearGradient>
    <linearGradient id="phoneFrame" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#2a2a2a"/>
      <stop offset="50%" style="stop-color:#1a1a1a"/>
      <stop offset="100%" style="stop-color:#2a2a2a"/>
    </linearGradient>
    <filter id="phoneShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="20" stdDeviation="40" flood-color="${accentColor === 'green' ? '#14F195' : '#9945FF'}" flood-opacity="0.3"/>
    </filter>
    <clipPath id="screenClip">
      <rect x="215" y="580" width="650" height="1190" rx="30"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bg)"/>

  <!-- Decorative elements -->
  <circle cx="${accentColor === 'green' ? 980 : 100}" cy="300" r="200" fill="${accentColor === 'green' ? '#14F195' : '#9945FF'}" opacity="0.1"/>
  <circle cx="${accentColor === 'green' ? 50 : 980}" cy="1600" r="300" fill="${accentColor === 'green' ? '#9945FF' : '#14F195'}" opacity="0.08"/>

  <!-- Floating particles -->
  <circle cx="150" cy="500" r="4" fill="#14F195" opacity="0.5"/>
  <circle cx="930" cy="400" r="3" fill="#9945FF" opacity="0.6"/>
  <circle cx="200" cy="1400" r="5" fill="#14F195" opacity="0.4"/>
  <circle cx="880" cy="1200" r="4" fill="#9945FF" opacity="0.5"/>

  <!-- Header text -->
  <text x="540" y="150" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="white" text-anchor="middle">${headline1}</text>
  <text x="540" y="240" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="url(#accent)" text-anchor="middle">${headline2}</text>

  <!-- Subtitle -->
  <text x="540" y="320" font-family="Arial, sans-serif" font-size="32" fill="#888888" text-anchor="middle">${subtitle}</text>

  <!-- Feature badges -->
  ${badges.map((badge, i) => {
    const x = 140 + i * 280;
    const color = badge.color === 'green' ? '#14F195' : '#9945FF';
    const bgColor = badge.color === 'green' ? 'rgba(20,241,149,0.2)' : 'rgba(153,69,255,0.2)';
    return `
  <rect x="${x}" y="380" width="240" height="50" rx="25" fill="${bgColor}" stroke="${color}" stroke-width="2"/>
  <text x="${x + 120}" y="415" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="${color}" text-anchor="middle">${badge.text}</text>`;
  }).join('')}

  <!-- Phone frame -->
  <g filter="url(#phoneShadow)">
    <!-- Phone body -->
    <rect x="190" y="480" width="700" height="1340" rx="50" fill="url(#phoneFrame)" stroke="#3a3a3a" stroke-width="2"/>

    <!-- Screen bezel -->
    <rect x="205" y="520" width="670" height="1260" rx="40" fill="#0a0a0a"/>

    <!-- Dynamic Island / Notch -->
    <rect x="440" y="535" width="200" height="35" rx="17" fill="#1a1a1a"/>

    <!-- Screenshot -->
    <image href="data:image/png;base64,${screenshotBase64}" x="215" y="580" width="650" height="1190" clip-path="url(#screenClip)" preserveAspectRatio="xMidYMin slice"/>

    <!-- Home indicator -->
    <rect x="440" y="1755" width="200" height="6" rx="3" fill="#3a3a3a"/>
  </g>

  <!-- Bottom text -->
  <text x="540" y="1870" font-family="Arial, sans-serif" font-size="28" fill="#666" text-anchor="middle">For educational purposes only</text>
</svg>`;

  // Convert SVG to PNG
  const outputPath = join(imagesDir, `${name}.png`);
  await sharp(Buffer.from(svg))
    .resize(1080, 1920)
    .png()
    .toFile(outputPath);

  console.log(`Created ${name}.png`);
}

// Define promo configurations
const promoConfigs = [
  {
    name: 'promo-1-grow',
    screenshot: 'screenshot-1.png',
    headline1: 'Plan Your',
    headline2: 'SOL Growth',
    subtitle: 'Dollar cost average into Solana',
    accentColor: 'purple',
    badges: [
      { text: 'Live SOL Price', color: 'green' },
      { text: 'Connect Wallet', color: 'purple' },
      { text: 'DCA Strategy', color: 'green' }
    ]
  },
  {
    name: 'promo-2-results',
    screenshot: 'screenshot-2.png',
    headline1: 'Monte Carlo',
    headline2: 'Projections',
    subtitle: '500+ simulations for realistic growth forecasts',
    accentColor: 'green',
    badges: [
      { text: 'CAGR Model', color: 'green' },
      { text: 'Power Law', color: 'purple' },
      { text: '10-90% Range', color: 'green' }
    ]
  },
  {
    name: 'promo-3-spend',
    screenshot: 'screenshot-3.png',
    headline1: 'Plan Your',
    headline2: 'Retirement',
    subtitle: 'Set monthly income and withdrawal duration',
    accentColor: 'purple',
    badges: [
      { text: 'Monthly Income', color: 'purple' },
      { text: 'Inflation Adjusted', color: 'green' },
      { text: '35+ Years', color: 'purple' }
    ]
  },
  {
    name: 'promo-4-drawdown',
    screenshot: 'screenshot-4.png',
    headline1: 'Drawdown',
    headline2: 'Analysis',
    subtitle: 'See your retirement success probability',
    accentColor: 'green',
    badges: [
      { text: '98% Success', color: 'green' },
      { text: '500 Simulations', color: 'purple' },
      { text: 'Path Analysis', color: 'green' }
    ]
  }
];

// Generate all promo images
async function main() {
  for (const config of promoConfigs) {
    try {
      await createPromoImage(config);
    } catch (err) {
      console.error(`Error creating ${config.name}:`, err);
    }
  }
  console.log('All promo images created!');
}

main();
