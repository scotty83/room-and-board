# Manual Board Setup — via the device web UI

For installing the signage system on a Board Pro when you can't reach it from
a terminal. Everything happens in the board's local web interface. Time per
board: ~5 minutes. You need: the board's IP address and a local **admin**
account on it.

The attached `SignageManager.js` is pre-configured for
**https://signage.rvc.tech** — no editing needed.

## 1. Open the web UI

Browse to `https://<board-ip>` and sign in as admin. (If the board is in
Personal Mode / Control Hub-managed, local users may need to be enabled in
Control Hub: Devices → your board → Local Device Controls.)

## 2. Set the configurations

Go to **Settings → Configurations** and set these eight values:

| Path | Value |
|---|---|
| WebEngine → Mode | **On** |
| WebEngine → Features → AllowDeviceCertificate | **True** |
| NetworkServices → Websocket | **FollowHTTPService** |
| Standby → Signage → Mode | **On** |
| Standby → Signage → InteractionMode | **Interactive** |
| Standby → Signage → Audio | **Off** |
| Macros → Mode | **On** |
| Macros → AutoStart | **On** |

(Leave **Standby → Signage → Url** alone — the macro manages it.)

## 3. Install the macro

1. Go to **Customization → Macro Editor** (on some versions: Integrations →
   Macro Editor).
2. **Import from file…** and choose the attached `SignageManager.js`
   (or Create new macro → name it `SignageManager` → paste the file's
   contents).
3. **Save**, then toggle the macro **on** (Active). The macro runtime starts
   it immediately.

Do **not** create or touch `Signage_Storage` — the macro creates that itself.
It's the preference vault; it will appear in the editor as an inactive macro.
Leave it inactive.

## 4. Verify

1. In the Macro Editor's console pane you should see:
   `SignageManager ready; config not set yet`.
2. Leave the board alone for ~2 minutes until it half-wakes → the signage
   welcome screen appears. Tap **Quick start** (or enter a setup code from
   https://signage.rvc.tech/setup).
3. Tap the gear → **Diagnostics** → "Vault sync" should read **connected**.
   If it says *offline*, re-check `AllowDeviceCertificate` and
   `NetworkServices Websocket` from step 2, then restart the macro
   (toggle it off/on in the Macro Editor).

## 5. Optional: prove the vault works (recommended on the first board)

In the web UI go to **Settings → System Maintenance** (or Developer API) and
run:

```
xCommand WebEngine DeleteStorage Type: Signage
```

Then put the board in standby and wake it. Your configuration should return
by itself within a few seconds of the signage page loading — that's the macro
re-seeding from the vault. If instead you get the welcome screen, the vault
path isn't working: check step 4.3.

## Notes

- **Screen hours:** Cisco recommends ≤ 12 h of signage/day. Consider setting
  **Time → OfficeHours** on the board so the display sleeps overnight.
- **Updates:** the page updates itself (checks hourly, reloads nightly at
  4 AM). Board-side, nothing needs re-uploading unless the macro itself
  changes — I'll say so explicitly if a change ever requires it.
- **Removal:** deactivate + delete both macros in the Macro Editor, set
  Standby → Signage → Mode: Off, and optionally run
  `xCommand WebEngine DeleteStorage Type: Signage`.
