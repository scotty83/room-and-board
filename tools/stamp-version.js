// Cloudflare Pages build command: stamps site/version.json with the deploy's
// commit SHA so boards (which poll version.json hourly) self-refresh after
// every merge. Outside a Pages build (no CF_PAGES_COMMIT_SHA) it exits
// without writing, so local runs never clobber the committed version.
import { writeFile } from 'node:fs/promises';

const sha = process.env.CF_PAGES_COMMIT_SHA;
if (!sha) {
  console.log('stamp-version: no CF_PAGES_COMMIT_SHA (not a Pages build) — leaving version.json untouched');
  process.exit(0);
}
const version = sha.slice(0, 12);
await writeFile(new URL('../site/version.json', import.meta.url), `{ "version": "${version}" }\n`);
console.log(`stamp-version: site/version.json -> ${version}`);
