// Static fallback for a plain file host (no Node server): the same shape as the dynamic /ui-config.js route
// (server/uiMode.js). With the Node server this file is never served — the route answers first and reflects the
// admin switch. Keep the default in sync with DEFAULT_UI_MODE.
window.__SP_UI__ = { main: 'hub' };
