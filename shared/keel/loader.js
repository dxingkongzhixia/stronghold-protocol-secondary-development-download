// shared/keel/loader.js — load the executable modules of a Keel plugin. The host supplies `urlOf` (a path inside the
// plugin folder → a URL) and optionally `load` (tests inject a fake importer).

export class KeelLoadError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'KeelLoadError';
    this.code = code;
  }
}

const CODE_KINDS = new Set(['sim', 'match', 'policy']);

/**
 * @param {any} manifest a validated manifest 3
 * @param {{ urlOf?: (rel: string) => string, load?: (url: string) => Promise<any>, kinds?: string[] }} [opts]
 *   `kinds`: load only these module kinds (default: every code kind)
 * @returns {Promise<{ kind: string, entry: string, permissions: string[], code: any }[]>}
 */
export async function loadKeelModules(manifest, opts = {}) {
  const urlOf = typeof opts.urlOf === 'function' ? opts.urlOf : (rel) => rel;
  const load = typeof opts.load === 'function' ? opts.load : (url) => import(url);
  const kinds = Array.isArray(opts.kinds) ? new Set(opts.kinds) : CODE_KINDS;
  const out = [];
  for (const mod of manifest?.modules ?? []) {
    if (!CODE_KINDS.has(mod.kind) || !mod.entry || !kinds.has(mod.kind)) continue;
    let namespace;
    try {
      namespace = await load(urlOf(mod.entry));
    } catch (err) {
      throw new KeelLoadError('KEEL_LOAD_FAILED', `${mod.kind} module "${mod.entry}" could not load: ${err?.message ?? err}`);
    }
    const code = namespace?.default;
    if (!code || typeof code !== 'object') throw new KeelLoadError('KEEL_LOAD_DEFAULT', `${mod.kind} module "${mod.entry}" has no default export object`);
    if (code.setup !== undefined && typeof code.setup !== 'function') throw new KeelLoadError('KEEL_LOAD_SETUP', `${mod.kind} module "${mod.entry}" setup is not a function`);
    if (code.hooks !== undefined && (typeof code.hooks !== 'object' || code.hooks === null || Array.isArray(code.hooks))) {
      throw new KeelLoadError('KEEL_LOAD_HOOKS', `${mod.kind} module "${mod.entry}" hooks is not an object`);
    }
    out.push({ kind: mod.kind, entry: mod.entry, permissions: [...(mod.permissions ?? [])], code });
  }
  return out;
}
