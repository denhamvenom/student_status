/* global Image */
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

// Renders the PWA icons from the team logo with a headless browser canvas: `bun scripts/generate-pwa-icons.mjs`.
// The logo is not square, so each icon pads it onto a solid team-purple square. Commit the PNG outputs.
const root = fileURLToPath(new URL('..', import.meta.url));
const source = `${root}public/assets/logos/logo-mark-white-text.png`;
const outDir = `${root}public/icons/`;
const purple = '#461D7C';

// scale = logo width as a share of the icon. Maskable icons keep the whole logo inside the
// central 80% circle (logo diagonal <= 0.8 x size), so launchers can crop to any shape.
const icons = [
  { file: 'icon-192.png', size: 192, scale: 0.84 },
  { file: 'icon-512.png', size: 512, scale: 0.84 },
  { file: 'maskable-512.png', size: 512, scale: 0.6 },
  { file: 'apple-touch-icon-180.png', size: 180, scale: 0.8 },
  { file: 'favicon-32.png', size: 32, scale: 0.94 },
  // Android notification badge: white silhouette on transparent; the system tints it.
  { file: 'badge-96.png', size: 96, scale: 0.9, badge: true },
];

const logo = `data:image/png;base64,${(await readFile(source)).toString('base64')}`;
const browser = await chromium.launch({ ...(process.env.ICON_BROWSER ? { executablePath: process.env.ICON_BROWSER } : { channel: 'msedge' }), headless: true });
try {
  const page = await browser.newPage();
  await mkdir(outDir, { recursive: true });
  for (const icon of icons) {
    const dataUrl = await page.evaluate(async ({ logo, purple, icon }) => {
      const image = new Image();
      image.src = logo;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = icon.size;
      const context = canvas.getContext('2d');
      context.imageSmoothingQuality = 'high';
      const width = icon.size * icon.scale, height = width * image.naturalHeight / image.naturalWidth;
      const x = (icon.size - width) / 2, y = (icon.size - height) / 2;
      if (icon.badge) {
        context.drawImage(image, x, y, width, height);
        context.globalCompositeOperation = 'source-in';
        context.fillStyle = '#fff';
        context.fillRect(0, 0, icon.size, icon.size);
      } else {
        context.fillStyle = purple;
        context.fillRect(0, 0, icon.size, icon.size);
        context.drawImage(image, x, y, width, height);
      }
      return canvas.toDataURL('image/png');
    }, { logo, purple, icon });
    await writeFile(`${outDir}${icon.file}`, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`wrote public/icons/${icon.file}`);
  }
} finally {
  await browser.close();
}
