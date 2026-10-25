// shared/origins.js — the official public origin and the small helpers the server uses to tell where a player opened
// the game. A browser sends its page origin in the WebSocket `Origin` header; `server/net.js` keeps it on the session
// and `server/lobby.js` reminds a player on any other address to log in through the official one (the account database
// and the deployed build live there). Pure: no I/O.

/** The official deployment players should use (the reverse proxy's public address). `SP_OFFICIAL_ORIGIN` overrides it. */
export const OFFICIAL_ORIGIN = 'https://strongholdprotocolcsym.top:10785';

/**
 * Normalize an `Origin` header (or any absolute URL) to `scheme://host[:port]`; null when it is not an http(s) URL.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeOrigin(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * True for the owner's own machine / test server (localhost, loopback, `0.0.0.0`): those are never reminded, so a
 * development visit to `http://127.0.0.1:3000` stays quiet.
 * @param {unknown} value
 */
export function isLocalOrigin(value) {
  const origin = normalizeOrigin(value);
  if (!origin) return false;
  const host = new URL(origin).hostname.replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
}
