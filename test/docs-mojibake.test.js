// The docs must be valid, singly-encoded UTF-8. A write through a CP936/GBK console once turned
// docs/UPSTREAM-MERGES.md into a double encoding — every UTF-8 byte re-read as GBK, so 「永不合并」 became
// 「姘镐笉鍚堝苟」 and the em dash 「—」 became 「鈥?」. This fails on that class of corruption before it can reach a
// push. The character set below is exactly what that corruption produced in the docs and it occurs nowhere else in
// the repository (checked): a real Traditional Chinese character such as 鏈 is deliberately NOT in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** UTF-8 read as GBK (CP936): the bytes of Chinese text become these. */
const GBK_MOJIBAKE =
    '¤ˉЕЩ″€℃┖╁╂█▍ゅヨㄣㄥㄦㄧㄨ㈠㈡㈤乣乷亰亾仛伀伅伒佷佸佹佺佽侀侊偍傚傛' +
  '傜傦儴儹兂兘冨冪冮凤剁劅勩勪勫勬勭勮勯勶厓厗厜厤厹叆叕叡叧叾叿呫呬呭呮呯呴咃哄哷' +
  '唴唽啀嗐嗕嗗嗘嗛噣噰噷噸噺嚎嚜嚭嚮囥囧囨囩囬圥圭坄坰垉垎垏垗垙垚垛垜垨垪垬垮垯垰' +
  '垹埌埗埛埡埧堜堝堟堢堣堥堬墈墍墖墝墠墦墿夈夊夋夌夎夐夛夸妗妫妯妱妸姕姘姛姝姞姟姣' +
  '姩姹娆娈娉娌娓娣娲娴娼娿婁婂婃婇婊婏婚婢婧婵媺嫟嫢嫭嬩嬪嬫嬭孲宍宐宸寔寕寖寜寤寮' +
  '寲尯尶屄屻屼屽屾岀岃岄岋崱崼嵁嵆嵎嶁嶃嶄嶅嶆嶇嶈嶉嶏帇帋帓帴帺幇幈庝庡庢庣庤庨庯' +
  '彁彇彉彛彟彧彲忋忓忔忕忚忛悈悊悎悓悕悗惈愩愪愬愭愮愯憡憳憾懠懡戜戝戞戠抈抮挎挜挳' +
  '挸捐掑掕掗揅揜搂搞搧搴撀撱撳撴撻敓敞敤敭敮敼敾斤斺旀旈晥暀暃暟暰暱曘曚曞曟曠曡曪' +
  '朵村杞杩枃枟枫柇柉柊柟栥栦栧栨栬棌棣棤棩棯棰棴棿椂椤椹椼楀楁楂楄楗楠榻槑槦槸槻樸' +
  '樺樻樼樿橀檺櫒櫘櫧欎欏欐欑欒歚殑殣毚氦氫氬氭氱沗泦泭洖洘洜洿浂浇浗浘浜浠浣浼涓涔' +
  '涗涢淇渚渶渼湁湅湇湡湪湭湰湳湴湶滀滃滄滆滉潈潗潡潪潫潯潵澘澧澶濂濅濆濊濞瀛瀯瀵瀹' +
  '瀽灉灏灞炬炲炵烇煄煡煶熷熸熺熻爣爮牸犱犲犳犵犺猴珛珨琚琛瑁瑙瑾璁璇璋璐璺瓙瓧瓨甯' +
  '畠畨畻疄痉瘖瘽皟皠皬皵眬睆睘硅硶磋磥礇礋祫祻禆竴笀笁笂笅笉笌笣箙篃簨簩簬簮簰簱簳' +
  '簹粊粌粡粯粺紑紓紝紪紭紱紶絾綅綉綊綋綍綔緟緱緵縼績繘繚纭绀绂绉绌绐绔绗绛绠绫绱绻' +
  '绾缁缂缃胯脳腑舰舵芥苟荤莽袱裤褰讳讹诧诲跺蹇蹭辩辫逛鈥鈫鈮鈽銆鍏鍐鍑鍒鍓鍔鍖鍗鍘' +
  '鍙鍚鍣鍥鍦鎭鎰鎴鎵鎶鎷鎸鎹鎺鎻鎽鎿鏀鏁鏂鏃鏄鏆鏇鏉鏋鏌鏍鐏鐗鐙鐜鐞鐢鐣鐨鐩鐪鐭鑱' +
  '鑳鑴鑷鑹鑻鑼鑾钀钂钑钘锛镐閫閬閭閮閽閿闀闂闃闄闅闆闈鞏頃颁骞' +
  '' +
  '︺︾︿﹀﹁＄ｄｆｈ';

/** UTF-8 read as Latin-1 / CP1252, and a lossy decode's U+FFFD. */
const LATIN_MOJIBAKE = ['\uFFFD', 'Ã', 'Â', 'â€', 'ï¿½', 'ä¸', 'å…', 'å¤', 'å­', 'çš„'];

const BAD = new RegExp(`[${GBK_MOJIBAKE}]|${LATIN_MOJIBAKE.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}`);

/** Markdown documents that must stay clean: README / CHANGELOG / CONTRIBUTING and every file under docs/. */
function documents() {
  const out = ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md'];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) out.push(p.slice(ROOT.length + 1).split('\\').join('/'));
    }
  };
  walk(join(ROOT, 'docs'));
  return out.filter((f) => { try { return statSync(join(ROOT, f)).isFile(); } catch { return false; } });
}

test('the docs carry no double-encoded (mojibake) text', () => {
  const bad = [];
  for (const f of documents()) {
    readFileSync(join(ROOT, f), 'utf8').split('\n').forEach((line, i) => {
      if (BAD.test(line)) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(bad, [], `mojibake in the docs — reverse the wrong encoding, do not re-encode by hand:\n${bad.join('\n')}`);
});

test('the mojibake guard itself catches the corruption it was written for', () => {
  // the exact shape: 永不合并 re-read as GBK, and the em dash as 鈥?
  assert.ok(BAD.test('\u59d8\u9550\u7b09\u935a\u581d\u82df'), 'GBK-mangled 永不合并 is caught');
  assert.ok(BAD.test('\u9225\u003Fthe never-merge list'), 'the mangled em dash 鈥? is caught');
  assert.ok(BAD.test('caf\u00c3\u00a9'), 'a Latin-1-mangled sequence is caught');
  assert.ok(BAD.test('a lossy \uFFFD decode'), 'U+FFFD is caught');
  assert.ok(!BAD.test('\u94fe\u672f\u5e08\uff0c\u9501\u94fe\u52fe\u722a'), 'real Traditional Chinese (鏈術師) is NOT caught');
  assert.ok(!BAD.test('a plain English sentence \u2014 with an em dash and \u00a722.'), 'normal prose is NOT caught');
});
