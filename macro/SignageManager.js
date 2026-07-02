// SignageManager — RoomOS macro for the Board Pro signage dashboard.
//
// Responsibilities:
//   1. Keep the user's encoded config in an inactive vault macro
//      (Signage_Storage) that survives reboots, upgrades and web-storage
//      wipes. The config is an OPAQUE string; this macro never decodes it.
//   2. Maintain a low-privilege local account (signage-bridge) whose
//      passphrase rotates on every boot, and hand its credentials to the
//      signage page via the URL fragment (fragments never leave the device).
//   3. Compose and set the signage URL, and listen for config saves the page
//      sends over the device's own WebSocket xAPI (Message Send "sgn1:...").
//
// Deployment: deploy/provision.js replaces SITE_URL and pushes this file.
// Requires on the device: WebEngine Mode On, Standby Signage Mode On,
// WebEngine Features AllowDeviceCertificate True, NetworkServices Websocket
// FollowHTTPService (provision.js sets all of these).

import xapi from 'xapi';

const SITE_URL = 'https://SIGNAGE_SITE_URL_PLACEHOLDER';
const STORAGE_MACRO = 'Signage_Storage';
const BRIDGE_USER = 'signage-bridge';
const VAULT_PREFIX = '// signage-vault v1\nconst store = ';
const MSG_PREFIX = 'sgn1:';

/* ---------- pure helpers (unit-tested in test/macro.test.js) ---------- */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// base64url over a UTF-8 string; the macro runtime has no btoa.
export function b64url(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.codePointAt(i);
    if (c > 0xffff) i++; // surrogate pair consumed
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      bytes.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 63),
        0x80 | ((c >> 6) & 63),
        0x80 | (c & 63),
      );
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b === undefined ? 0 : b >> 4)];
    if (b !== undefined) out += B64[((b & 15) << 2) | (c === undefined ? 0 : c >> 6)];
    if (c !== undefined) out += B64[c & 63];
  }
  return out;
}

export function serializeVault(obj) {
  return VAULT_PREFIX + JSON.stringify(obj) + ';';
}

export function parseVault(content) {
  const at = content.indexOf(VAULT_PREFIX);
  if (at === -1) throw new Error('not a signage vault');
  return JSON.parse(content.slice(at + VAULT_PREFIX.length).replace(/;\s*$/, ''));
}

export function composeUrl(site, cfg, auth) {
  const parts = [];
  if (cfg) parts.push('cfg=' + cfg);
  parts.push('auth=' + b64url(JSON.stringify(auth)));
  const url = site + '#' + parts.join('&');
  if (url.length > 2048) throw new Error('signage url exceeds 2048 chars');
  return url;
}

export function parseMsg(text) {
  if (typeof text === 'string' && text.startsWith(MSG_PREFIX)) {
    const cfg = text.slice(MSG_PREFIX.length);
    if (/^[A-Za-z0-9_-]+$/.test(cfg)) return { type: 'cfg', cfg };
  }
  return null;
}

export function randPass(len = 48) {
  let out = '';
  for (let i = 0; i < len; i++) out += B64[Math.floor(Math.random() * 64)];
  return out;
}

/* ---------- device wiring ---------- */

async function readVault() {
  try {
    const res = await xapi.Command.Macros.Macro.Get({ Name: STORAGE_MACRO, Content: 'True' });
    return parseVault(res.Macro[0].Content);
  } catch (e) {
    return { cfg: null };
  }
}

async function writeVault(vault) {
  await xapi.Command.Macros.Macro.Save(
    { Name: STORAGE_MACRO, Overwrite: 'True', Transpile: 'False' },
    serializeVault(vault),
  );
}

async function ensureBridgeUser(pass) {
  try {
    await xapi.Command.UserManagement.User.Add({
      Username: BRIDGE_USER,
      Passphrase: pass,
      Role: ['User', 'Integrator'],
      Active: 'True',
      PassphraseChangeRequired: 'False',
      ShellLogin: 'False',
    });
  } catch (e) {
    // Account exists from a previous boot — rotate its passphrase.
    await xapi.Command.UserManagement.User.Passphrase.Set({
      Username: BRIDGE_USER,
      NewPassphrase: pass,
    });
  }
}

async function applySignageUrl(vault, auth) {
  const url = composeUrl(SITE_URL, vault.cfg, auth);
  await xapi.Config.Standby.Signage.Url.set(url);
}

async function init() {
  const vault = await readVault();
  const pass = randPass();
  await ensureBridgeUser(pass);
  const ip = await xapi.Status.Network[1].IPv4.Address.get();
  const auth = { u: BRIDGE_USER, p: pass, ip };

  await xapi.Config.WebEngine.Mode.set('On');
  await xapi.Config.Standby.Signage.Mode.set('On');
  await xapi.Config.Standby.Signage.InteractionMode.set('Interactive');
  await applySignageUrl(vault, auth);
  await writeVault(vault);

  xapi.Event.Message.Send.on(async (event) => {
    const msg = parseMsg(event.Text);
    if (!msg) return;
    vault.cfg = msg.cfg;
    await writeVault(vault);
    await applySignageUrl(vault, auth);
    await xapi.Command.Message.Send({ Text: 'sgn1-ack' });
  });

  console.log('SignageManager ready; config ' + (vault.cfg ? 'restored from vault' : 'not set yet'));
}

init().catch((e) => console.error('SignageManager init failed:', e.message ?? e));
