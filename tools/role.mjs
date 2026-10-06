// tools/role.mjs — assign / list account roles (shared/constants.js ROLES) in the accounts database.
//
//   node tools/role.mjs list
//   node tools/role.mjs <代号> admin      # grant 管理员
//   node tools/role.mjs <代号> dev        # grant 开发者
//   node tools/role.mjs <代号> off        # clear it (an ordinary account)
//
// The database defaults to `var/accounts.db` (server/db.mjs); `SP_DB` overrides it, exactly like the server. The role
// then shows next to the name in the lobby chip, the 在线 overlay, room seats, the in-game HUD / team panel / result
// screen, /online/api and the admin page. A running server needs no restart: the role rides on the account, so it
// takes effect at the next login / hello of that account.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.mjs';
import { AuthService } from '../server/auth.js';
import { ROLES } from '../shared/constants.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.env.SP_DB || join(ROOT, 'var', 'accounts.db');
const args = process.argv.slice(2);

const db = openDb(file);
const auth = new AuthService({ db });

const USAGE = 'node tools/role.mjs <代号> <admin|dev|off>';

if (args.length === 0 || args[0] === 'list') {
  console.log(`账号库：${file}`);
  const rows = auth.listAccounts();
  if (!rows.length) console.log('（还没有账号）');
  for (const r of rows) {
    const label = ROLES[r.role];
    console.log(`#${String(r.id).padEnd(4)} ${r.name}${label ? `  [${label}]` : ''}`);
  }
} else if (args.length !== 2) {
  console.error(`用法：${USAGE}`);
  process.exitCode = 1;
} else {
  const [name, raw] = args;
  if (raw !== 'off' && raw !== 'none' && raw !== 'clear' && !Object.prototype.hasOwnProperty.call(ROLES, raw)) {
    console.error(`未知身份「${raw}」——可用：${Object.keys(ROLES).join(' / ')} / off`);
    process.exitCode = 1;
  } else {
    const role = raw === 'off' || raw === 'none' || raw === 'clear' ? null : raw;
    const r = auth.setRole(name, role);
    if (r.error) {
      console.error(r.error === 'NO_ACCOUNT' ? `没有找到代号「${name}」的账号` : `失败：${r.error}`);
      process.exitCode = 1;
    } else {
      const label = ROLES[r.account.role];
      console.log(`${r.account.name} → ${label ? `${label}（${r.account.role}）` : '普通账号'}`);
    }
  }
}

db.close?.();
