// Fleet provisioning for the signage system. For each device in devices.csv:
// sets the required xConfigurations, installs the SignageManager macro (with
// SITE_URL substituted), activates it and restarts the macro runtime.
//
// Usage:
//   DEVICE_USER=admin DEVICE_PASS=... SITE_URL=https://your.site \
//     node deploy/provision.js [--dry-run] [devices.csv]
//
// devices.csv: first line "host", one device hostname/IP per line after.
// Devices must have local HTTPS + WebSocket enabled (default on RoomOS).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MACRO_PATH = new URL('../macro/SignageManager.js', import.meta.url);
const MACRO_NAME = 'SignageManager';

export function planActions(csvText, env) {
  if (!env.SITE_URL) throw new Error('SITE_URL env var is required');
  const macroBody = readFileSync(MACRO_PATH, 'utf8').replace(
    'https://SIGNAGE_SITE_URL_PLACEHOLDER',
    env.SITE_URL,
  );
  const hosts = csvText
    .trim()
    .split(/\r?\n/)
    .map((l) => l.split(',')[0].trim())
    .filter((h) => h && h.toLowerCase() !== 'host');

  return hosts.map((host) => ({
    host,
    actions: [
      { path: 'Configuration/WebEngine/Mode', value: 'On' },
      { path: 'Configuration/WebEngine/Features/AllowDeviceCertificate', value: 'True' },
      { path: 'Configuration/NetworkServices/Websocket', value: 'FollowHTTPService' },
      { path: 'Configuration/Standby/Signage/Mode', value: 'On' },
      { path: 'Configuration/Standby/Signage/InteractionMode', value: 'Interactive' },
      { path: 'Configuration/Standby/Signage/Audio', value: 'Off' },
      { path: 'Configuration/Macros/Mode', value: 'On' },
      { path: 'Configuration/Macros/AutoStart', value: 'On' },
      { command: 'Macros/Macro/Save', params: { Name: MACRO_NAME, Overwrite: 'True', Transpile: 'False' }, body: macroBody },
      { command: 'Macros/Macro/Activate', params: { Name: MACRO_NAME } },
      { command: 'Macros/Runtime/Restart', params: {} },
    ],
  }));
}

async function provision(device, creds) {
  const { connect } = await import('jsxapi');
  const xapi = await connect(`wss://${device.host}`, {
    username: creds.user,
    password: creds.pass,
  });
  try {
    for (const action of device.actions) {
      if (action.path) {
        await xapi.config.set(action.path.replace('Configuration/', '').replaceAll('/', ' '), action.value);
      } else if (action.body) {
        await xapi.command(action.command.replaceAll('/', ' '), action.params, action.body);
      } else {
        await xapi.command(action.command.replaceAll('/', ' '), action.params);
      }
    }
  } finally {
    xapi.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const csvPath = args.find((a) => !a.startsWith('--')) ?? 'deploy/devices.csv';
  const plan = planActions(readFileSync(csvPath, 'utf8'), process.env);

  if (dryRun) {
    for (const device of plan) {
      console.log(`\n${device.host}:`);
      for (const a of device.actions) {
        console.log(`  ${a.path ?? a.command} ${a.value ?? ''}${a.body ? ` (${a.body.length} chars)` : ''}`);
      }
    }
    return;
  }

  const creds = { user: process.env.DEVICE_USER, pass: process.env.DEVICE_PASS };
  if (!creds.user || !creds.pass) throw new Error('DEVICE_USER and DEVICE_PASS env vars are required');
  const results = [];
  for (const device of plan) {
    try {
      await provision(device, creds);
      results.push([device.host, 'OK']);
      console.log(`✓ ${device.host}`);
    } catch (err) {
      results.push([device.host, `FAIL: ${err.message}`]);
      console.error(`✗ ${device.host}: ${err.message}`);
    }
  }
  const failed = results.filter(([, r]) => r !== 'OK');
  console.log(`\n${results.length - failed.length}/${results.length} devices provisioned`);
  process.exitCode = failed.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
