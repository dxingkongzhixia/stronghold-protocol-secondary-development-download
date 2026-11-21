// public/js/ui/settingsSearch.js — the settings search predicate (batch C): a row matches when its own text contains
// the needle, case-insensitively; an empty needle matches everything. Kept dependency-free so the UI test can import
// it without a DOM.
export function settingMatches(text, needle) {
  const n = String(needle ?? '').trim().toLowerCase();
  if (!n) return true;
  return String(text ?? '').toLowerCase().includes(n);
}
