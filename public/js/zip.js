// public/js/zip.js — a small ZIP reader for local theme packs (no dependency). Reads the central directory and
// inflates each entry with the browser's DecompressionStream('deflate-raw') (method 8) or copies a stored entry
// (method 0). Paths are checked before they leave this module: no absolute path, no '..', no NUL, no backslash.
// Caps: 4000 entries, 64 MB archive; an entry larger than 16 MB is refused (theme packs cap files far below that).

const MAX_ENTRIES = 4000;
const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_ENTRY = 16 * 1024 * 1024;

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** A safe relative path inside the archive, or null. */
export function zipPath(raw) {
  const p = String(raw || '').replace(/\\/g, '/');
  if (!p || p.length > 240 || p.endsWith('/')) return null;
  if (p.startsWith('/') || p.includes('..') || p.includes('\0') || /^[a-zA-Z]:/.test(p)) return null;
  return p;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream unavailable');
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks = [];
  let total = 0;
  const reader = ds.readable.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_ENTRY) throw new Error('zip entry too large');
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/**
 * Read a zip archive into `Map<path, Uint8Array>`.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {Promise<Map<string, Uint8Array>>}
 */
export async function readZip(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > MAX_ARCHIVE) throw new Error('zip larger than 64 MB');
  // end of central directory: scan the last 64 KB for 0x06054b50
  const min = Math.max(0, bytes.length - 65557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= min; i--) if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip archive');
  const count = u16(bytes, eocd + 10);
  if (count > MAX_ENTRIES) throw new Error('too many zip entries');
  let cd = u32(bytes, eocd + 16);
  const out = new Map();
  for (let n = 0; n < count; n++) {
    if (u32(bytes, cd) !== 0x02014b50) throw new Error('bad central directory');
    const method = u16(bytes, cd + 10);
    const csize = u32(bytes, cd + 20);
    const nameLen = u16(bytes, cd + 28);
    const extraLen = u16(bytes, cd + 30);
    const commentLen = u16(bytes, cd + 32);
    const local = u32(bytes, cd + 42);
    const name = new TextDecoder().decode(bytes.subarray(cd + 46, cd + 46 + nameLen));
    cd += 46 + nameLen + extraLen + commentLen;
    const path = zipPath(name);
    if (!path) continue; // directories and unsafe paths are skipped
    if (u32(bytes, local) !== 0x04034b50) throw new Error('bad local header');
    const lName = u16(bytes, local + 26);
    const lExtra = u16(bytes, local + 28);
    const start = local + 30 + lName + lExtra;
    const raw = bytes.subarray(start, start + csize);
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = await inflateRaw(raw);
    else throw new Error(`unsupported zip method ${method}`);
    if (data.length > MAX_ENTRY) throw new Error('zip entry too large');
    out.set(path, data);
    if (out.size > MAX_ENTRIES) throw new Error('too many zip entries');
  }
  return out;
}
