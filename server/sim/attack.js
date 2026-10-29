// server/sim/attack.js — the damage helpers a 0.3.2+ bot scores with. This fork's battle kernel lives in damage.js
// (the 0.3.2 settlement rewrite is not merged; UPSTREAM-DEV-TRIAGE §0.1), so this facade re-exports the same
// `mitigate(amount, type, target, ign)` contract from there instead of the upstream `attack/` split.
export { makeDamageInfo, mitigate } from './damage.js';
