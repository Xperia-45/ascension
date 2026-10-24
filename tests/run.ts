// Engine logic tests — run: npx esbuild tests/run.ts --bundle --platform=node --format=esm --outfile=/tmp/run.mjs && node /tmp/run.mjs
import {
  newPlayerState, ensureDailyQuests, completeQuest, completeMilestone, abandonQuest,
  generateDailyQuests, masteryOf, regionFills, streakOf, todayStr, importState, exportState, levelInfo,
} from '../src/engine';
import { SKILL_MAP } from '../src/data';

let passed = 0, failed = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ FAIL: ${name} ${extra}`); }
};

console.log('== 1. New player: initial board ==');
const s = newPlayerState();
ok('lastGenDate = today', s.lastGenDate === todayStr());
ok('3 quests generated (STANDARD)', s.quests.filter(q => q.status === 'active').length === 3, `got ${s.quests.length}`);
const tplIds = s.quests.map(q => q.templateId);
ok('no duplicate templates', new Set(tplIds).size === tplIds.length);
ok('no locked-skill quests (e.g. deep learning)', !tplIds.some(id => id.startsWith('dl-') || id.startsWith('llm-')));
ok('starts with Python basics available', masteryOf(s, SKILL_MAP.get('py-basics')!) === 'AVAILABLE');
ok('py-flow is LOCKED at start', masteryOf(s, SKILL_MAP.get('py-flow')!) === 'LOCKED');
ok('level 1, 0 xp', levelInfo(s.totalXp).level === 1 && s.totalXp === 0);

console.log('== 2. Same-day re-entry: no regeneration ==');
ok('ensureDailyQuests no-op same day', ensureDailyQuests(s, todayStr()) === false);

console.log('== 3. Completion: XP once, duplicate protection ==');
const q0 = s.quests.find(q => q.status === 'active')!;
const ev = completeQuest(s, q0.id, 'did the work');
ok('completion returns events', !!ev);
ok('XP awarded', s.totalXp === q0.xp, `xp=${s.totalXp}`);
ok('history recorded', s.history.length === 1);
ok('second completion blocked (null)', completeQuest(s, q0.id, 'again') === null);
ok('XP unchanged after duplicate attempt', s.totalXp === q0.xp);
ok('quest off active board', s.quests.filter(q => q.status === 'active').length === 2);
ok('first-quest achievement unlocked', !!s.achievements['first-quest']);

console.log('== 4. Midnight rollover: carryover + fresh + no dupes ==');
s.lastGenDate = '2026-10-20'; // simulate days passing
const pendingBefore = s.quests.filter(q => q.status === 'active').map(q => q.id);
const rolled = ensureDailyQuests(s, '2026-10-25');
ok('rollover happened', rolled === true && s.lastGenDate === '2026-10-25');
const activeAfter = s.quests.filter(q => q.status === 'active');
ok('pending quests preserved', pendingBefore.every(id => activeAfter.some(q => q.id === id)));
ok('new quests added', activeAfter.length > pendingBefore.length);
ok('still no duplicate active templates', new Set(activeAfter.map(q => q.templateId)).size === activeAfter.length);
ok('XP preserved across midnight', s.totalXp === q0.xp);
ok('completed quest stays in history, off board', !activeAfter.some(q => q.id === q0.id) && s.history.length === 1);
ok('new quests stamped with new date', activeAfter.some(q => q.createdDate === '2026-10-25'));

console.log('== 5. Mastery progression & prerequisite unlock ==');
const s2 = newPlayerState();
const completeTpl = (tpl: string) => {
  let q = s2.quests.find(x => x.templateId === tpl && x.status === 'active');
  if (!q) { // force-deploy like the skill modal does
    const gen = generateDailyQuests(s2, todayStr(), 8);
    s2.quests.unshift(...gen);
    q = s2.quests.find(x => x.templateId === tpl && x.status === 'active');
  }
  if (!q) throw new Error('template not generatable: ' + tpl);
  completeQuest(s2, q.id, 'evidence: built it');
};
completeTpl('py-basics:learn');
ok('py-basics LEARNING after study quest', masteryOf(s2, SKILL_MAP.get('py-basics')!) === 'LEARNING');
completeTpl('py-basics:practice');
completeTpl('py-basics:practice2');
const m2 = masteryOf(s2, SKILL_MAP.get('py-basics')!);
ok('py-basics PRACTICING after practice quests', m2 === 'PRACTICING', `got ${m2}, xp=${s2.skillXp['py-basics']}`);
ok('py-flow unlocked by PRACTICING prereq', masteryOf(s2, SKILL_MAP.get('py-flow')!) === 'AVAILABLE');
completeTpl('py-basics:rev'); completeTpl('py-basics:drill');
completeTpl('py-basics:prove');
const m3 = masteryOf(s2, SKILL_MAP.get('py-basics')!);
ok('py-basics PROVEN after trial (350+ XP + proof)', m3 === 'PROVEN', `got ${m3}, xp=${s2.skillXp['py-basics']}, proof=${s2.skillProof['py-basics']}`);
ok('TORSO region illuminated > 0', regionFills(s2).TORSO > 0);
ok('proven-1 achievement unlocked', !!s2.achievements['proven-1']);

console.log('== 6. Watching-only cannot reach PROVEN ==');
const s3 = newPlayerState();
s3.skillXp['py-basics'] = 400; // XP without any proof
ok('400 XP but zero proofs = NOT proven', masteryOf(s3, SKILL_MAP.get('py-basics')!) === 'PRACTICING');

console.log('== 7. Modes ==');
const sSurv = newPlayerState(); sSurv.mode = 'SURVIVAL'; sSurv.quests = [];
const surv = generateDailyQuests(sSurv, todayStr());
ok('SURVIVAL generates exactly 1 quest', surv.length === 1, `got ${surv.length}`);
ok('SURVIVAL quest ≤10 min', surv.every(q => q.minutes <= 10), surv.map(q => `${q.kind}:${q.minutes}`).join(','));
const sDeep = newPlayerState(); sDeep.mode = 'DEEP'; sDeep.quests = [];
const deep = generateDailyQuests(sDeep, todayStr());
ok('DEEP WORK generates 5 quests', deep.length === 5, `got ${deep.length}`);

console.log('== 8. Abandon & milestones & streak & persistence round-trip ==');
const s4 = newPlayerState();
const aq = s4.quests[0];
ok('abandon works once', abandonQuest(s4, aq.id) === true && abandonQuest(s4, aq.id) === false);
const mev = completeMilestone(s4, 'c1m1', 'github.com/me/repo — 10 scripts');
ok('milestone completion grants XP', !!mev && s4.totalXp === 100);
ok('milestone cannot double-claim', completeMilestone(s4, 'c1m1', 'again') === null && s4.totalXp === 100);
const t = todayStr(); const y = new Date(); y.setDate(y.getDate() - 1);
const yStr = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
s4.activityDays[t] = 50; s4.activityDays[yStr] = 30;
ok('streak counts today+yesterday = 2+', streakOf(s4) >= 2, `got ${streakOf(s4)}`);
const rt = importState(exportState(s4));
ok('export/import round-trip preserves XP+quests', rt.totalXp === s4.totalXp && rt.quests.length === s4.quests.length);

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
