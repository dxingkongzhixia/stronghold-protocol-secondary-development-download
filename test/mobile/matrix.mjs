// The phone/tablet matrix of docs/MOBILE-UI.md §7 (M0.1): landscape only; the smallest screen we promise is 640×360
// (iPhone SE 1st gen landscape). 568×320 and below are out of scope. One source for the audit tool, the docs and CI.
export const MIN_VIEWPORT = Object.freeze({ w: 640, h: 360 });

export const VIEWPORTS = Object.freeze([
  { name: 'se1', w: 640, h: 360 },
  { name: 'android-s', w: 740, h: 360 },
  { name: 'iphone14', w: 844, h: 390 },
  { name: 'pixel7', w: 915, h: 412 },
  { name: 'tablet', w: 1024, h: 768 },
]);

/** A simulated safe area (notch / home indicator), as the audit overrides `--sa-*` with. */
export const SAFE_AREA = Object.freeze({ top: 24, right: 24, bottom: 34, left: 24 });
