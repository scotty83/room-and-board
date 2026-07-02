// Produces an upload-ready macro for manual installation through a board's
// web UI (when provision.js can't reach the codecs over the network).
// Usage: SITE_URL=https://signage.rvc.tech node deploy/make-macro.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const siteUrl = process.env.SITE_URL ?? 'https://signage.rvc.tech';
const src = new URL('../macro/SignageManager.js', import.meta.url);
const outDir = new URL('./manual/', import.meta.url);

mkdirSync(outDir, { recursive: true });
const body = readFileSync(src, 'utf8').replace('https://SIGNAGE_SITE_URL_PLACEHOLDER', siteUrl);
if (body.includes('PLACEHOLDER')) throw new Error('placeholder substitution failed');
writeFileSync(new URL('SignageManager.js', outDir), body);
console.log(`wrote deploy/manual/SignageManager.js (SITE_URL = ${siteUrl})`);
