// shared/versions.js — the rules-set labels the knowledge pack and the admin pages ask about.
//
// The 0.3.2 historical-version system (第一期上下半 / 第二期上半, data/versions/) is NOT merged in this fork
// (docs/UPSTREAM-DEV-TRIAGE.md §2 "版本系统"), so this fork has one rules set: the current data/. The helpers keep the
// upstream call shape so the external-AI knowledge pack can label a payload without knowing that.
export const DEFAULT_VERSION = 'act2autochess';
export const VERSIONS = Object.freeze([]);
export const versionById = () => null;
export const versionSlug = () => null;
export const versionOfData = () => DEFAULT_VERSION;
