// test/fixtures/keelSandboxMatch.js — a probe Match for the Keel sandbox host E2E.
export class Match {
  constructor(opts) { this.opts = opts; }
  start() {
    const registry = this.opts.extensions;
    const plugin = this.opts.keel?.plugins?.find((p) => p.id === 'keel-probe');
    const probe = {
      ok: typeof registry?.EXTENSIONS?.char_x_keel_probe === 'function',
      preloaded: plugin?.v2?.preloaded === true,
      sealed: registry?.owners?.has('kit:char_x_keel_probe') === true,
    };
    this.opts.broadcast({ t: 'm.public', keelProbe: probe });
    this.opts.onEnd({ stub: true, keelProbe: probe });
  }
  dispose() {}
}
