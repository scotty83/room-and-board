// CI build command (Cloudflare Pages AND Workers Builds): stamps
// site/version.json with the deploy's commit SHA so boards (which poll
// version.json hourly) self-refresh after every merge. The commit SHA is
// exposed under different names by each platform — Pages: CF_PAGES_COMMIT_SHA
// (also what the manual `deploy:site` script sets from `git rev-parse HEAD`);
// Workers Builds: WORKERS_CI_COMMIT_SHA. Outside a CI build (none set) it exits
// without writing, so local runs never clobber the committed version.
import { writeFile } from 'node:fs/promises';

// First match wins; CF_PAGES first so the manual deploy:site keeps its behaviour.
const SHA_VARS = ['CF_PAGES_COMMIT_SHA', 'WORKERS_CI_COMMIT_SHA'];
const src = SHA_VARS.find((name) => process.env[name]);
if (!src) {
  console.log(`stamp-version: no commit SHA in env (checked ${SHA_VARS.join(', ')}) — leaving version.json untouched`);
  process.exit(0);
}
const version = process.env[src].slice(0, 12);
await writeFile(new URL('../site/version.json', import.meta.url), `{ "version": "${version}" }\n`);
console.log(`stamp-version: site/version.json -> ${version} (from ${src})`);
