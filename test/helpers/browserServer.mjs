// test/helpers/browserServer.mjs — a real server for a headless Chrome test, on a port Chrome will actually load.
//
// `startServer({ port: 0 })` hands back an ephemeral port, and a few of them are on Chrome's blocked list
// (net::ERR_UNSAFE_PORT, e.g. 5060/5061 SIP, 6000 X11, 6665–6669 IRC, 10080): the page then never loads and the test
// fails for a reason that has nothing to do with the code. Start again on a fresh port instead.
//
//   const srv = await startBrowserServer({ accounts: true });
//   const base = `http://127.0.0.1:${srv.port}`;
//
// tests that only use node's fetch do not need this (test/helpers/localFetch.js retries a blocked port itself).

/** Chrome's restricted ports (net/base/port_util.cc). */
export const UNSAFE_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111,
  113, 115, 117, 119, 123, 135, 137, 138, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540,
  548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566,
  6665, 6666, 6667, 6668, 6669, 6697, 10080,
]);

/**
 * Start the real server on an ephemeral port Chrome accepts.
 * @param {Parameters<typeof import('../../server/index.js').startServer>[0]} [opts]
 * @param {{ tries?: number }} [retry]
 */
export async function startBrowserServer(opts = {}, { tries = 8 } = {}) {
  const { startServer } = await import('../../server/index.js');
  for (let i = 0; i < tries; i++) {
    const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, ...opts });
    if (!UNSAFE_PORTS.has(srv.port)) return srv;
    await srv.close();
  }
  throw new Error(`no browser-safe port after ${tries} tries (${[...UNSAFE_PORTS].join(', ')})`);
}
