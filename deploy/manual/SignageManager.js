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
// Deployment: provision.js (networked) or a plain manual upload installs this
// file with SITE_URL substituted. init() self-configures every device setting
// it needs — WebEngine Mode, Standby Signage Mode + InteractionMode, WebEngine
// Features AllowDeviceCertificate, and NetworkServices Websocket
// FollowHTTPService — so a hand-uploaded copy works without running provision.js.

import xapi from 'xapi';

const SITE_URL = 'https://roomboard.app';
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
  if (at === -1) {
    const err = new Error('not a signage vault');
    err.Context = `${STORAGE_MACRO} content missing the vault prefix`;
    throw err;
  }
  return JSON.parse(content.slice(at + VAULT_PREFIX.length).replace(/;\s*$/, ''));
}

export function composeUrl(site, cfg, auth) {
  const parts = [];
  if (cfg) parts.push('cfg=' + cfg);
  parts.push('auth=' + b64url(JSON.stringify(auth)));
  const url = site + '#' + parts.join('&');
  if (url.length > 2048) {
    const err = new Error('signage url exceeds 2048 chars');
    err.Context = `url length ${url.length} exceeds 2048`;
    throw err;
  }
  return url;
}

export function parseMsg(text) {
  if (text === 'sgn1-reset') return { type: 'reset' };
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

async function applySignageUrl(cfg, auth) {
  const url = composeUrl(SITE_URL, cfg, auth);
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

  // Enable the device's local WebSocket xAPI channel the setup page uses to push
  // config saves back to this macro. These are the two settings provision.js
  // sets for the networked path but a manual macro upload otherwise leaves off —
  // without them the page can't reach the macro. Non-fatal: if they can't be set
  // the signage still displays, it just can't be reconfigured from the board.
  try {
    await xapi.Config.WebEngine.Features.AllowDeviceCertificate.set('True');
    await xapi.Config.NetworkServices.Websocket.set('FollowHTTPService');
  } catch (e) {
    console.warn('SignageManager: could not enable the config-save websocket:', e.Context ?? e.message ?? e);
  }

  // Register the config-save listener BEFORE applying the URL, so that even a
  // config that can't be applied (e.g. one persisted over-long by an older
  // build of this macro) can never lock the page out from sending a fix.
  xapi.Event.Message.Send.on(async ({ Text }) => {
    const msg = parseMsg(Text);
    if (!msg) return;
    const nextCfg = msg.type === 'reset' ? null : msg.cfg;
    try {
      // Apply first: composeUrl enforces the 2048-char limit and throws before
      // anything is written, so a config we can't display is never persisted to
      // the vault (which would otherwise fail again on every reboot). Commit the
      // in-memory cfg only once both the apply and the write have succeeded.
      await applySignageUrl(nextCfg, auth);
      await writeVault({ ...vault, cfg: nextCfg });
      vault.cfg = nextCfg;
      console.log('SignageManager: config ' + (msg.type === 'reset' ? 'reset' : `updated (${nextCfg.length} chars)`));
      await xapi.Command.Message.Send({ Text: 'sgn1-ack' });
    } catch (e) {
      console.error('SignageManager: config save failed:', e.Context ?? e.message ?? e);
      await xapi.Command.Message.Send({ Text: 'sgn1-nack' }).catch(() => {});
    }
  });

  await writeVault(vault);
  await applySignageUrl(vault.cfg, auth);

  console.log('SignageManager ready; config ' + (vault.cfg ? 'restored from vault' : 'not set yet'));
}

init().catch((e) => console.error('SignageManager init failed:', e.message ?? e));
