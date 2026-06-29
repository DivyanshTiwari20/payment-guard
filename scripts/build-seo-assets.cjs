/**
 * One-off: rasterize the brand icon + a social share image into docs/assets.
 * Run: node scripts/build-seo-assets.cjs   (requires @resvg/resvg-js)
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const ASSETS = path.join(__dirname, '..', 'docs', 'assets');
const iconSvg = fs.readFileSync(path.join(ASSETS, 'favicon.svg'), 'utf8');

function render(svg, outFile, widthPx) {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: widthPx },
    font: { loadSystemFonts: true },
    background: 'rgba(0,0,0,0)',
  });
  fs.writeFileSync(path.join(ASSETS, outFile), r.render().asPng());
  console.log('wrote', outFile, widthPx + 'px');
}

// --- icons (square) ---
render(iconSvg, 'favicon-32.png', 32);
render(iconSvg, 'icon-192.png', 192);
render(iconSvg, 'icon-512.png', 512);
render(iconSvg, 'apple-touch-icon.png', 180);

// --- social share card (1200x630, raster — required by Twitter/FB/LinkedIn/Slack) ---
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="acc" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#4f46e5"/>
    </linearGradient>
    <linearGradient id="ico" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#4f46e5"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.05" r="0.7">
      <stop offset="0" stop-color="#4f46e5" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#4f46e5" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="#ffffff"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="0" y="0" width="1200" height="8" fill="url(#acc)"/>

  <!-- brand -->
  <g transform="translate(80,74)">
    <rect width="46" height="46" rx="13" fill="#0a0a0b"/>
    <path d="M23 12 L34 16 V26 C34 32 29 35 23 37 C17 35 12 32 12 26 V16 Z" fill="url(#ico)"/>
    <path d="M18 25 L22 29 L29 21" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="62" y="31" font-family="Segoe UI, Arial, sans-serif" font-size="27" font-weight="700" fill="#0a0a0b" letter-spacing="-0.5">PaymentGuard</text>
  </g>

  <!-- headline -->
  <g font-family="Segoe UI, Arial, sans-serif" font-weight="800" letter-spacing="-2">
    <text x="78" y="270" font-size="76" fill="#0a0a0b">Let AI handle the payments.</text>
    <text x="78" y="360" font-size="76" fill="url(#acc)">Keep control of the money.</text>
  </g>

  <!-- subline -->
  <text x="80" y="430" font-family="Segoe UI, Arial, sans-serif" font-size="30" fill="#45454d" letter-spacing="-0.3">The free, open-source safety gate between your AI and your money.</text>

  <!-- footer chips -->
  <g transform="translate(80,520)">
    <circle cx="9" cy="14" r="8" fill="#15803d"/>
    <text x="28" y="22" font-family="Segoe UI, Arial, sans-serif" font-size="25" font-weight="600" fill="#0a0a0b">Free &amp; open source</text>
    <g transform="translate(330,-8)">
      <rect width="290" height="46" rx="12" fill="#fafafb" stroke="#ececef"/>
      <text x="20" y="30" font-family="Consolas, monospace" font-size="22" fill="#0a0a0b">npm i payment-guard</text>
    </g>
  </g>

  <!-- large faded shield watermark -->
  <g transform="translate(900,300)" opacity="0.08">
    <path d="M150 -120 L320 -60 V90 C320 188 245 246 150 274 C55 246 -20 188 -20 90 V-60 Z" fill="url(#ico)"/>
  </g>
</svg>`;
render(og, 'og-image.png', 1200);

console.log('done');
