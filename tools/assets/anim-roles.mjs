// tools/assets/anim-roles.mjs — the animation-role resolver now lives in shared/animRoles.js, so the browser can resolve
// the roles of a Spine model it loads from the local client (a version-only operator, whose charpack table the asset
// manifest never had) with the same rules tools/fetch-assets.mjs uses for the web models. This module stays the tools'
// import path.
export * from '../../shared/animRoles.js';
