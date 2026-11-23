// tools/e2e-lanes.mjs — where every `test/ui/*.e2e.test.js` belongs. One file, one lane (docs/TESTING-PLAN.md 4.2):
//
//   smoke   the 26 mock-harness suites the two CI jobs run (tools/browser-smoke.mjs RUNS; no game art)
//   assets  the five asset-backed room / match suites (tools/e2e-assets.mjs; real server + 720 MB art, local only)
//   native  the three heavy native-room suites (`npm run test:e2e:assets -- --native`, 3–8 min a file)
//   local   deliberately outside CI, with the reason below (real-server, red, slow or art-dependent)
//
// `test/ui/e2e-lanes.test.js` fails when a file has no lane or two, and when a lane names a file that no longer exists —
// so a new e2e suite cannot quietly join the tree without a decision about who runs it. Keep this list honest: move a
// file to `smoke` only after it is green in both groups locally, and delete (rather than park) what nobody will fix.

/** Real server + game art: these live in the local/asset flow, not in CI. */
const REAL = 'real server + game art: local asset flow only';
/** Red on 2026-11-23; triage and a reason belong in docs/TESTING.md §7.1. */
const RED = 'red on 2026-11-23 (needs triage; docs/TESTING.md §7.1)';
/** Green but too slow for the 8-minute CI budget. */
const SLOW = 'green but >60 s: nightly only';
/** Green, but needs the official art pack (not in CI's mock lane). */
const ART = 'green locally, needs official art: asset lane';

export const ASSETS = [
  'test/ui/standin.e2e.test.js',
  'test/ui/spectator.e2e.test.js',
  'test/ui/teammate-loadout.e2e.test.js',
  'test/ui/leftovers.e2e.test.js',
  'test/ui/watch-bonds.e2e.test.js',
];

export const NATIVE = [
  'test/ui/native-room.e2e.test.js',
  'test/ui/native-room-bench.e2e.test.js',
  'test/ui/native-room-fallback.e2e.test.js',
];

/** @type {Record<string, string>} file → why it is not in a CI lane. */
export const LOCAL_ONLY = {
  'test/ui/band-draft-skip.e2e.test.js': REAL,
  'test/ui/bench-overflow.e2e.test.js': REAL,
  'test/ui/bond-audio.e2e.test.js': RED,
  'test/ui/community-controls.e2e.test.js': RED,
  'test/ui/community-layout.e2e.test.js': SLOW,
  'test/ui/devices.e2e.test.js': SLOW,
  'test/ui/diy.e2e.test.js': REAL,
  'test/ui/emotes.e2e.test.js': ART,
  'test/ui/feedback1-offers.e2e.test.js': REAL,
  'test/ui/feedback1-placement.e2e.test.js': REAL,
  'test/ui/feedback5-boss-pair.e2e.test.js': REAL,
  'test/ui/followup-023.e2e.test.js': REAL,
  'test/ui/i18n.e2e.test.js': RED,
  'test/ui/loadout.e2e.test.js': REAL,
  'test/ui/loadout-battle.e2e.test.js': REAL,
  'test/ui/loadout-ops-export.e2e.test.js': REAL,
  'test/ui/modal.e2e.test.js': RED,
  'test/ui/native-boss.e2e.test.js': REAL,
  'test/ui/playtest2.e2e.test.js': 'hangs >5 min on 2026-11-23 (needs triage)',
  'test/ui/playtest2.real.e2e.test.js': REAL,
  'test/ui/playtest5-ui.e2e.test.js': RED,
  'test/ui/playtest6-elite.e2e.test.js': REAL,
  'test/ui/playtest6-summons.e2e.test.js': REAL,
  'test/ui/playtest6-ui.e2e.test.js': RED,
  'test/ui/plugins.e2e.test.js': REAL,
  'test/ui/plugins-content-script.e2e.test.js': REAL,
  'test/ui/real.e2e.test.js': REAL,
  'test/ui/stats.e2e.test.js': REAL,
  'test/ui/stats-overlay-css.e2e.test.js': RED,
  'test/ui/ui-plugins.e2e.test.js': REAL,
};
