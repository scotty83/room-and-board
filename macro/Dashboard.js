/**
  * Author(s):               Sean Scott
  *                          <Title>
  *                          <Company>
  *
  * Consulting Engineer(s)   None
  *
  * Date Created:            July 17, 2026
  * Revised:                 July 18, 2026
  * Version:                 1.1.0
  *
  * Description:             Self-contained signage provisioning + Control
  *                          Panel button for the Room & Board dashboard.
  *                          init() configures the device for interactive
  *                          web signage (WebEngine, Standby Signage mode/
  *                          interaction/URL, macro autostart) and deploys a
  *                          "Dashboard" Action Button that drops the device
  *                          into half-wake, where the signage displays.
  *                          Standalone: no storage/vault macro, no bridge
  *                          account — the URL carries the board's config.
  *
  * Documentation:           https://github.com/scotty83/room-and-board
  *
  * Software Platforms:      RoomOS 11+
  *
  * Hardware Platforms:      Board / Board Pro / Desk series (touch devices)
  *
  * Code Dependencies:       None
  *
  * AI Generation:           ~90%
  *                          Claude Fable 5 (claude-fable-5)
  *                          Instruction file: RoomOS.md
  *                          AI-generated code — review and test on the
  *                          target device before production deployment.
  */

import xapi from 'xapi';

/*
 * Setup: paste this file into the Macro Editor (Settings > Macros), Save,
 * and enable — init() applies every device setting signage needs, so
 * nothing else has to be configured by hand.
 *
 * The default URL opens Room & Board's welcome screen (Quick Start + a QR
 * to the /setup page). To load a saved configuration instead, replace it
 * with your board's URL from /setup -> "Get signage URL" (it carries the
 * display's configuration in the #cfg fragment).
 *
 * NOTE: do not install SignageManager on a board this macro manages — the
 * two both own Standby Signage Url and will fight over it.
 */
const SIGNAGE_URL = 'https://roomboard.app';

const PANEL_ID = 'dashboard';

// Base64-encoded PNG for the button icon.
const ICON_BASE64 =
'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';

const PANEL_XML = `
<Extensions>
  <Panel>
    <Order>1</Order>
    <PanelId>${PANEL_ID}</PanelId>
    <Location>ControlPanel</Location>
    <Icon>Custom</Icon>
    <CustomIcon>
      <Content>${ICON_BASE64}</Content>
    </CustomIcon>
    <Name>Dashboard</Name>
    <ActivityType>Custom</ActivityType>
  </Panel>
</Extensions>`;

/**
  * Sets one configuration node to the wanted value, idempotently: reads the
  * current value first and writes only on difference, so repeated boots
  * don't churn the config store, and every actual change is logged.
  * @param {Object} node - A proxied xapi.Config node exposing get()/set().
  * @param {string} label - Human-readable config path for logs/errors.
  * @param {string} value - The desired value.
  * @throws {{Context: string, Error: string}} When the read or write fails.
  * @roomosxapi [xConfiguration](https://roomos.cisco.com/xapi/domain/?domain=Configuration)
  */
async function ensureConfig(node, label, value) {
  try {
    const current = await node.get();
    if (current === value) return;
    await node.set(value);
    console.log(`[Dashboard] ${label}: '${current}' -> '${value}'`);
  } catch (err) {
    throw { Context: `Failed to set ${label} to '${value}'`, Error: err.message ?? String(err) };
  }
}

/**
  * Applies every device setting interactive web signage needs. Mirrors the
  * settings the networked provisioning path uses, minus the vault/bridge
  * pieces this standalone macro deliberately omits. Macros Mode/AutoStart
  * are included so a hand-uploaded copy of this macro survives reboots.
  * The default URL opens the Room & Board welcome screen, so an untouched
  * install still lands somewhere useful.
  * @roomosxapi [xConfiguration Standby Signage Url](https://roomos.cisco.com/xapi/Config.Standby.Signage.Url/)
  * @roomosxapi [xConfiguration Standby Signage Mode](https://roomos.cisco.com/xapi/Config.Standby.Signage.Mode/)
  * @roomosxapi [xConfiguration Standby Signage InteractionMode](https://roomos.cisco.com/xapi/Config.Standby.Signage.InteractionMode/)
  * @roomosxapi [xConfiguration WebEngine Mode](https://roomos.cisco.com/xapi/Config.WebEngine.Mode/)
  * @roomosxapi [xConfiguration Macros AutoStart](https://roomos.cisco.com/xapi/Config.Macros.AutoStart/)
  */
async function configureSignage() {
  // Macro engine survives reboots even on a hand-provisioned board.
  await ensureConfig(xapi.Config.Macros.Mode, 'Macros Mode', 'On');
  await ensureConfig(xapi.Config.Macros.AutoStart, 'Macros AutoStart', 'On');
  // The web engine renders the signage page.
  await ensureConfig(xapi.Config.WebEngine.Mode, 'WebEngine Mode', 'On');
  // Signage displays in half-wake; Interactive = the touchscreen drives it.
  await ensureConfig(xapi.Config.Standby.Signage.Mode, 'Standby Signage Mode', 'On');
  await ensureConfig(xapi.Config.Standby.Signage.InteractionMode, 'Standby Signage InteractionMode', 'Interactive');
  await ensureConfig(xapi.Config.Standby.Signage.Url, 'Standby Signage Url', SIGNAGE_URL);
}

/**
  * Creates or overwrites the Control Panel button (idempotent — keyed by
  * PanelId).
  * @roomosxapi [xCommand UserInterface Extensions Panel Save](https://roomos.cisco.com/xapi/Command.UserInterface.Extensions.Panel.Save/)
  */
async function deployPanel() {
  try {
    await xapi.Command.UserInterface.Extensions.Panel.Save({ PanelId: PANEL_ID }, PANEL_XML);
    console.log(`[Dashboard] panel '${PANEL_ID}' deployed to the Control Panel`);
  } catch (err) {
    throw { Context: `Failed to save panel '${PANEL_ID}'`, Error: err.message ?? String(err) };
  }
}

/**
  * Drops the device into half-wake, where the configured signage displays.
  * @roomosxapi [xCommand Standby Halfwake](https://roomos.cisco.com/xapi/Command.Standby.Halfwake/)
  */
async function activateSignage() {
  try {
    await xapi.Command.Standby.Halfwake();
    console.log('[Dashboard] button pressed -> Standby Halfwake (signage up)');
  } catch (err) {
    console.error('[Dashboard] could not enter half-wake:', err.message ?? err);
  }
}

/**
  * Panel-click handler; ignores every panel but ours.
  * @param {Object} event - Panel Clicked event; PanelId identifies the panel.
  */
function onPanelClicked({ PanelId }) {
  if (PanelId !== PANEL_ID) return;
  activateSignage();
}

/**
  * Provision the device, deploy the button, then subscribe (registered once
  * here, never inside re-callable functions, so no duplicate handlers).
  * @roomosxapi [xEvent UserInterface Extensions Panel Clicked](https://roomos.cisco.com/xapi/Event.UserInterface.Extensions.Panel.Clicked/)
  */
async function init() {
  await configureSignage();
  await deployPanel();
  xapi.Event.UserInterface.Extensions.Panel.Clicked.on(onPanelClicked);
  console.log('[Dashboard] ready');
}

init().catch((err) => console.error('[Dashboard] init failed:', err.Context ?? err.message ?? err));
