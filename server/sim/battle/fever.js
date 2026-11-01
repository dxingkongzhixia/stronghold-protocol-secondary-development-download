// server/sim/battle/fever.js — Fever (official env_033_fever): a per-operator gauge filled by the damage a Fever
// operator deals (skill/talent “对敌人造成伤害时使 Fever +N”). A full gauge makes that operator join Fever; the env's
// steps count joined members (1–4 → `fever_mid`, 5+ → `fever_full`, 0 → `fever_stop`) and the joined state lasts
// FEVER_TIME s (the env system's audio controller `_maxPlayingTime`: 22 s), then the member leaves.
//
// The gauge size is not in the extracted data (the client's HudPlugins/char_fever_prepare_slider is code); FEVER_MAX is
// the port's [ASSUMED] 0–100 bar. Damage adds talent `cnt` points (丰川祥子 T2: 1/2/3 by promotion), so 34 hits at +3.
export const FEVER_MAX = 100;
/** How long a member stays in Fever (env_033_fever's audio component `_maxPlayingTime`). */
export const FEVER_TIME = 22;

export class BattleFever {
  /** The unit's current gauge (0 … FEVER_MAX); 0 while it is in Fever. */
  feverPoints(unit) {
    return this._feverPoints?.get(unit?.id) ?? 0;
  }

  /** The env step by the members whose Fever window still runs: 'stop' | 'mid' | 'full'. */
  feverState() {
    if (!this._feverUntil) return 'stop';
    const now = this.time;
    let n = 0;
    for (const [id, until] of this._feverUntil) {
      const u = this.units.find((x) => x.id === id);
      if (u?.alive && until > now + 1e-9) n++;
      else this._feverUntil.delete(id);
    }
    return n >= 5 ? 'full' : n >= 1 ? 'mid' : 'stop';
  }

  /** Whether the unit is in Fever right now. */
  inFever(unit) {
    return !!unit && (this._feverUntil?.get(unit.id) ?? -Infinity) > this.time + 1e-9;
  }

  /**
   * Add `n` Fever points to `unit` (its own gauge). Returns true when the gauge just filled and the unit joined Fever.
   * A unit already in Fever adds nothing ("AddFeverBySourceIfNotFull").
   */
  addFever(unit, n = 0) {
    if (!unit?.alive || !(n > 0) || this.inFever(unit)) return false;
    this._feverPoints ??= new Map();
    this._feverUntil ??= new Map();
    const p = Math.min(FEVER_MAX, (this._feverPoints.get(unit.id) ?? 0) + n);
    if (p >= FEVER_MAX) {
      this._feverPoints.set(unit.id, 0);
      this._feverUntil.set(unit.id, this.time + FEVER_TIME);
      return true;
    }
    this._feverPoints.set(unit.id, p);
    return false;
  }

  /** Drop a unit's gauge and Fever window (a redeploy starts clean; the kit calls it on `deploy`). */
  resetFever(unit) {
    if (!unit) return;
    this._feverPoints?.delete(unit.id);
    this._feverUntil?.delete(unit.id);
  }
}
