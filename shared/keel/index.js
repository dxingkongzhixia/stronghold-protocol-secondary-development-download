// shared/keel/index.js — the public surface of the Keel manifest/graph layer (M0).
export {
  KEEL_API_VERSION,
  KEEL_MANIFEST_VERSION,
  KEEL_MODULE_KINDS,
  KEEL_API_DOMAIN_OF,
  KEEL_TRUST,
  KEEL_SCOPES,
  KEEL_PERMISSIONS,
  isKeelManifest,
  readKeelManifest,
} from './manifest.js';
export { V2_PERMISSION_MAP, adaptV2, assetEntries, contentParts, isV2Manifest, mapPermissions, partFiles, trustOfClass } from './adapt.js';
export { classOfKeel, keelToV2 } from './legacy.js';
export { providesFromContent, withContentProvides } from './provides.js';
export { buildKeelGraph, orderPlugins } from './graph.js';
export { KEEL_STABLE_POINTS, KEEL_EXPERIMENTAL_POINTS, KEEL_DOMAINS, pointsByDomain } from './contracts.js';
export { canonicalJson, fnv1a, hashJson } from './hash.js';
export { createRng, hashSeed } from './rng.js';
export { KeelStateError, assertJson, createState } from './state.js';
export { KeelCommandError, createCommandBus } from './commands.js';
export { KeelBudgetError, createBudget } from './budget.js';
export { SIM_HOST_METHODS, createFakeHost } from './host.js';
export { KeelLoadError, loadKeelModules } from './loader.js';
export { KeelRuntimeError, KeelDeniedError, createKeelRuntime } from './runtime.js';
