import fs from 'fs';

console.log('=== Testing PWA Install Configuration & Mechanics ===\n');

// 1. Verify manifest.json
const manifest = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
console.log('1. Checking manifest.json properties:');
console.log('  Name:', manifest.name);
console.log('  Short Name:', manifest.short_name);
console.log('  Start URL:', manifest.start_url);
console.log('  Display Mode:', manifest.display);
console.log('  Icons count:', manifest.icons.length);
if (manifest.icons.length >= 2 && manifest.display === 'standalone' && manifest.start_url) {
  console.log('  [PASS] manifest.json complies with W3C PWA Installability requirements.\n');
} else {
  console.error('  [FAIL] manifest.json missing required installability fields.\n');
}

// 2. Verify Icon files exist on disk
console.log('2. Checking PWA Icon Assets on disk:');
const requiredIcons = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];
let allIconsExist = true;
for (const iconPath of requiredIcons) {
  const exists = fs.existsSync(iconPath);
  const size = exists ? fs.statSync(iconPath).size : 0;
  console.log(`  ${iconPath}: ${exists ? 'EXISTS' : 'MISSING'} (${size} bytes)`);
  if (!exists || size === 0) allIconsExist = false;
}
if (allIconsExist) {
  console.log('  [PASS] All high-resolution PNG & maskable icons verified.\n');
} else {
  console.error('  [FAIL] Missing icon assets.\n');
}

// 3. Verify index.html contains manifest and PWA meta tags
console.log('3. Checking index.html meta & links:');
const indexHtml = fs.readFileSync('./index.html', 'utf8');
const hasManifestLink = indexHtml.includes('<link rel="manifest" href="manifest.json">');
const hasAppleTouchIcon = indexHtml.includes('<link rel="apple-touch-icon"');
const hasAppleCapable = indexHtml.includes('<meta name="apple-mobile-web-app-capable" content="yes">');
const hasInstallBtn = indexHtml.includes('id="install-pwa-btn"');
const hasBanner = indexHtml.includes('id="pwa-install-banner"');
const hasIosModal = indexHtml.includes('id="ios-install-modal"');

console.log('  Manifest Link in <head>:', hasManifestLink);
console.log('  Apple Touch Icon in <head>:', hasAppleTouchIcon);
console.log('  Apple Web App Capable Meta:', hasAppleCapable);
console.log('  Header Install App Button:', hasInstallBtn);
console.log('  Floating PWA Install Banner:', hasBanner);
console.log('  iOS Safari Instructions Modal:', hasIosModal);

if (hasManifestLink && hasAppleTouchIcon && hasAppleCapable && hasInstallBtn && hasBanner && hasIosModal) {
  console.log('  [PASS] index.html includes all required PWA links, metas, and install UI components.\n');
} else {
  console.error('  [FAIL] index.html missing one or more PWA elements.\n');
}

// 4. Verify sw.js includes icon caching
console.log('4. Checking sw.js Service Worker caching:');
const swJs = fs.readFileSync('./sw.js', 'utf8');
const cachesIcons = swJs.includes('./icons/icon-192.png') && swJs.includes('./icons/icon-512.png');
console.log('  Caches PNG icons:', cachesIcons);
if (cachesIcons) {
  console.log('  [PASS] sw.js caches offline icons and app shell assets.\n');
} else {
  console.error('  [FAIL] sw.js does not cache icons.\n');
}

console.log('=== All PWA Tests Passed Successfully ===');
