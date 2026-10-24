// ===== ASCENSION — engine: persistence, XP, mastery, quest generation =====
import type {
  PlayerState, QuestInstance, QuestTemplate, SkillNode, Mastery, RegionId,
  CompletionEvents, AchievementDef, DailyMode,
} from './types';
import { SKILLS, SKILL_MAP, DEPENDENTS, CHAPTERS, ALL_MILESTONES, ACHIEVEMENTS, SIDE_QUESTS, DEBUG_QUESTS, RANKS } from './data';

// ---------------- dates (local timezone) ----------------
export const todayStr = (d = new Date()): string => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
export const daysBetween = (a: string, b: string): number =>
  Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
export const uid = (): string => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

// ---------------- XP curve ----------------
export const xpNeedForLevel = (level: number): number => Math.round(60 * Math.pow(level, 1.28) + 40);
export function levelInfo(xp: number) {
  let level = 1, rem = Math.max(0, xp);
  while (rem >= xpNeedForLevel(level)) { rem -= xpNeedForLevel(level); level++; }
  const need = xpNeedForLevel(level);
  return { level, into: rem, need, pct: Math.min(1, rem / need) };
}
export const rankForLevel = (level: number): string =>
  (RANKS.find((r) => level >= r.level) ?? RANKS[RANKS.length - 1]).name;

// mastery thresholds (XP in a single skill)
// Full chain for one node ≈ 240 + 36·tier XP, so 280 makes PROVEN = full chain + trial.
export const XP_PRACTICING = 150;
export const XP_PROVEN = 280;
export const XP_SKILL_FULL = 340; // visual "fully illuminated" point for one node

export function masteryOf(state: PlayerState, node: SkillNode): Mastery {
  const xp = state.skillXp[node.id] ?? 0;
  const proof = state.skillProof[node.id] ?? 0;
  if (xp >= XP_PROVEN && proof >= 1) return 'PROVEN';
  if (xp >= XP_PRACTICING) return 'PRACTICING';
  if (xp > 0) return 'LEARNING';
  const unlocked = node.prereq.every((p) => (state.skillXp[p] ?? 0) >= XP_PRACTICING);
  return unlocked ? 'AVAILABLE' : 'LOCKED';
}
export const isUnlocked = (state: PlayerState, node: SkillNode): boolean => masteryOf(state, node) !== 'LOCKED';
export const skillLevel = (state: PlayerState, id: string): number => levelInfo(state.skillXp[id] ?? 0).level;

// ---------------- derived: regions / attributes / chapters / streak ----------------
export function regionFills(state: PlayerState): Record<RegionId, number> {
  const fills = {} as Record<RegionId, number>;
  (['HEAD', 'TORSO', 'LARM', 'RARM', 'LEGS', 'CORE'] as RegionId[]).forEach((r) => {
    const nodes = SKILLS.filter((s) => s.region === r);
    let v = nodes.length ? nodes.reduce((a, s) => a + Math.min(1, (state.skillXp[s.id] ?? 0) / XP_SKILL_FULL), 0) / nodes.length : 0;
    if (r === 'CORE') {
      const shipped = state.projects.filter((p) => p.status === 'SHIPPED').length;
      const inProg = state.projects.length - shipped;
      const milestones = Object.keys(state.milestonesDone).length;
      v = Math.min(1, v * 0.6 + shipped * 0.12 + inProg * 0.04 + milestones * 0.02);
    }
    fills[r] = v;
  });
  return fills;
}

export function attributeXp(state: PlayerState, attributeId: string): number {
  if (attributeId === 'PROJ') {
    const base = SKILLS.filter((s) => s.attribute === 'PROJ').reduce((a, s) => a + (state.skillXp[s.id] ?? 0), 0);
    return base + state.projects.length * 80 + Object.keys(state.milestonesDone).length * 40;
  }
  return SKILLS.filter((s) => s.attribute === attributeId).reduce((a, s) => a + (state.skillXp[s.id] ?? 0), 0);
}

export function chapterStates(state: PlayerState) {
  return CHAPTERS.map((c) => {
    const done = c.milestones.filter((m) => state.milestonesDone[m.id]).length;
    return { chapter: c, done, total: c.milestones.length, complete: done === c.milestones.length, pct: done / c.milestones.length };
  });
}
export const currentChapterId = (state: PlayerState): number => {
  const cs = chapterStates(state);
  const first = cs.find((c) => !c.complete);
  return first ? first.chapter.id : 6;
};

export function streakOf(state: PlayerState): number {
  let streak = 0;
  const d = new Date();
  if (!state.activityDays[todayStr(d)]) d.setDate(d.getDate() - 1); // allow "not yet today"
  while (state.activityDays[todayStr(d)]) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

// frontier: unlocked & not PROVEN, sorted by campaign relevance
export function frontierNodes(state: PlayerState): SkillNode[] {
  const cur = currentChapterId(state);
  return SKILLS
    .filter((s) => { const m = masteryOf(state, s); return m !== 'LOCKED' && m !== 'PROVEN'; })
    .sort((a, b) => {
      const ca = Math.abs(a.chapter - cur) + (a.chapter < cur ? -0.5 : 0);
      const cb = Math.abs(b.chapter - cur) + (b.chapter < cur ? -0.5 : 0);
      if (ca !== cb) return ca - cb;
      const dep = (DEPENDENTS.get(b.id)?.length ?? 0) - (DEPENDENTS.get(a.id)?.length ?? 0);
      if (dep !== 0) return dep;
      return (state.skillXp[a.id] ?? 0) - (state.skillXp[b.id] ?? 0);
    });
}

// ---------------- quest templates derived from skill nodes ----------------
export function skillQuestTemplates(node: SkillNode): QuestTemplate[] {
  const t = node.tier;
  return [
    { id: `${node.id}:learn`, skillId: node.id, kind: 'LEARN', repeatable: false, grantsProof: false,
      title: `Study: ${node.name}`,
      desc: `${node.objective} Work through one focused resource, then close it and write the key ideas in your own words. Watching alone earns nothing here — the write-up is the quest.`,
      xp: 25 + t * 5, minutes: 20 },
    { id: `${node.id}:practice`, skillId: node.id, kind: 'PRACTICE', repeatable: false, grantsProof: false,
      title: `Training: ${node.name}`,
      desc: node.exercises.map((e, i) => `(${i + 1}) ${e}`).join(' '),
      xp: 50 + t * 8, minutes: 35 },
    { id: `${node.id}:practice2`, skillId: node.id, kind: 'PRACTICE', repeatable: false, grantsProof: false,
      title: `Deep Training: ${node.name}`,
      desc: `Repeat the core exercises for ${node.name} from a blank file without consulting your previous solutions. Where you stall is exactly what to relearn. Then: ${node.exercises[0]}`,
      xp: 55 + t * 8, minutes: 40 },
    { id: `${node.id}:prove`, skillId: node.id, kind: 'PROVE', repeatable: false, grantsProof: true,
      title: `⚔ Trial: ${node.name}`,
      desc: `MINI-PROJECT: ${node.miniProject} PROOF STANDARD: ${node.proof} Evidence required to complete this quest.`,
      xp: 110 + t * 15, minutes: 50 },
    { id: `${node.id}:rev`, skillId: node.id, kind: 'REVISION', repeatable: true, grantsProof: false,
      title: `Revision Protocol: ${node.name}`,
      desc: `No notes: explain ${node.name} out loud or in writing as if teaching it. Then redo one exercise from memory: ${node.exercises[0]} Fix every gap you exposed.`,
      xp: 25, minutes: 15 },
    { id: `${node.id}:drill`, skillId: node.id, kind: 'DRILL', repeatable: true, grantsProof: false,
      title: `5-Min Drill: ${node.name}`,
      desc: node.drill, xp: 15, minutes: 5 },
  ];
}
const ALL_SKILL_TEMPLATES = new Map<string, QuestTemplate>();
SKILLS.forEach((s) => skillQuestTemplates(s).forEach((t) => ALL_SKILL_TEMPLATES.set(t.id, t)));
SIDE_QUESTS.forEach((t) => ALL_SKILL_TEMPLATES.set(t.id, t));

const stageFor = (state: PlayerState, node: SkillNode): string => {
  // next incomplete stage in the pedagogical chain: learn → practice → deep training → trial
  const done = (id: string) => state.quests.some((q) => q.templateId === id && q.status === 'completed');
  if (!done(`${node.id}:learn`)) return `${node.id}:learn`;
  if (!done(`${node.id}:practice`)) return `${node.id}:practice`;
  if (!done(`${node.id}:practice2`)) return `${node.id}:practice2`;
  if (!done(`${node.id}:prove`)) return `${node.id}:prove`;
  return `${node.id}:rev`;
};

// ---------------- adaptive daily generation ----------------
const MODE_CONFIG: Record<DailyMode, { count: number; maxMinutes: number }> = {
  SURVIVAL: { count: 1, maxMinutes: 10 },
  STANDARD: { count: 3, maxMinutes: 60 },
  DEEP: { count: 5, maxMinutes: 90 },
};

interface Candidate { tpl: QuestTemplate; score: number; }

export function generateDailyQuests(state: PlayerState, date: string, extra = 0): QuestInstance[] {
  const cfg = MODE_CONFIG[state.mode];
  const target = extra > 0 ? extra : cfg.count;
  const activeTpl = new Set(state.quests.filter((q) => q.status === 'active').map((q) => q.templateId));
  const everDone = new Set(state.quests.filter((q) => q.status === 'completed').map((q) => q.templateId));
  const doneTodayTpl = new Set(state.history.filter((h) => h.date === date).map((h) => h.id));
  const cur = currentChapterId(state);
  const cands: Candidate[] = [];
  const push = (tpl: QuestTemplate | undefined, score: number) => {
    if (!tpl) return;
    if (activeTpl.has(tpl.id)) return;                              // never duplicate an active quest
    if (!tpl.repeatable && everDone.has(tpl.id)) return;            // stage quests are one-time
    if (tpl.repeatable && state.quests.some((q) => q.templateId === tpl.id && q.status === 'completed' && q.completedDate === date)) return; // no same-day repeat
    if (tpl.minutes > cfg.maxMinutes && state.mode === 'SURVIVAL') return;
    cands.push({ tpl, score });
  };

  const frontier = frontierNodes(state);

  // P1+P2: blocking foundational + next chapter objectives (stage quest of each frontier node)
  frontier.forEach((node, i) => {
    const tpl = ALL_SKILL_TEMPLATES.get(stageFor(state, node));
    let score = 100 - i * 4;
    if (node.chapter === cur) score += 25;
    if (node.chapter < cur) score += 35;                             // overdue foundational
    score += (DEPENDENTS.get(node.id)?.length ?? 0) * 6;            // blocks others
    if (tpl?.kind === 'PROVE') score += 10;
    push(tpl, score);
    // P4: debug companion for an in-progress node
    if ((state.skillXp[node.id] ?? 0) >= 50) {
      const dbg = DEBUG_QUESTS[i % DEBUG_QUESTS.length];
      push({ ...dbg, id: `${dbg.id}:${node.id}`, skillId: node.id, title: `${dbg.title} — ${node.name}` }, 55 - i * 3);
    }
  });

  // P3: revision of weak/stale skills (practicing-but-not-proven oldest first, then stale proven)
  const revisable = SKILLS.filter((s) => (state.skillXp[s.id] ?? 0) >= 50)
    .sort((a, b) => (state.skillLast[a.id] ?? '2000-01-01').localeCompare(state.skillLast[b.id] ?? '2000-01-01'));
  revisable.slice(0, 4).forEach((node, i) => {
    const stale = state.skillLast[node.id] ? daysBetween(state.skillLast[node.id], date) : 30;
    const weak = masteryOf(state, node) !== 'PROVEN';
    push(ALL_SKILL_TEMPLATES.get(`${node.id}:rev`), 40 + Math.min(25, stale) + (weak ? 10 : 0) - i * 2);
  });

  // SURVIVAL: drills on the top frontier nodes
  frontier.slice(0, 3).forEach((node, i) => push(ALL_SKILL_TEMPLATES.get(`${node.id}:drill`), 90 - i * 10));

  // P5: project development nudge (chapter >= 3 or any in-progress project)
  if (cur >= 3 || state.projects.some((p) => p.status === 'IN_PROGRESS')) {
    push({ id: 'proj-session', skillId: null, kind: 'PROJECT', repeatable: true, grantsProof: false,
      title: 'Project Session: Advance the Build',
      desc: 'One focused session on your active project. Define the single smallest shippable increment before starting. Commit at the end — even if imperfect.',
      xp: 60, minutes: 45 }, 58);
  }

  // P6: side quests (rotate by day-of-year so the board varies)
  const daySeed = Math.floor(new Date(date + 'T12:00:00').getTime() / 86400000);
  SIDE_QUESTS.forEach((tpl, i) => {
    if (tpl.skillId && !isUnlocked(state, SKILL_MAP.get(tpl.skillId)!)) return;
    push(tpl, 30 + ((daySeed + i * 7) % 13));
  });

  cands.sort((a, b) => b.score - a.score);

  // selection with a sane mix: max 1 quest per skill (2 in DEEP), at most 1 SIDE unless board is thin
  const perSkillCap = state.mode === 'DEEP' ? 2 : 1;
  const perSkill = new Map<string, number>();
  const chosen: QuestTemplate[] = [];
  let sideCount = 0;
  for (const c of cands) {
    if (chosen.length >= target) break;
    const sid = c.tpl.skillId ?? `__${c.tpl.id}`;
    if ((perSkill.get(sid) ?? 0) >= perSkillCap) continue;
    if (c.tpl.kind === 'SIDE' && sideCount >= 1 && chosen.length < target - 1) continue;
    chosen.push(c.tpl);
    perSkill.set(sid, (perSkill.get(sid) ?? 0) + 1);
    if (c.tpl.kind === 'SIDE') sideCount++;
  }
  // fallback fill if caps starved the board
  if (chosen.length < target) {
    for (const c of cands) {
      if (chosen.length >= target) break;
      if (!chosen.includes(c.tpl)) chosen.push(c.tpl);
    }
  }

  return chosen.map((tpl) => ({
    id: uid(), templateId: tpl.id, skillId: tpl.skillId, kind: tpl.kind,
    title: tpl.title, desc: tpl.desc, xp: tpl.xp, minutes: tpl.minutes,
    repeatable: tpl.repeatable, grantsProof: tpl.grantsProof,
    status: 'active', createdDate: date, completedDate: null, evidence: null,
  }));
}

/** Daily rollover: generate today's board, preserving all pending quests. Returns true if state changed. */
export function ensureDailyQuests(state: PlayerState, today: string): boolean {
  if (state.lastGenDate === today) return false;
  const activeCount = state.quests.filter((q) => q.status === 'active').length;
  // If the board is saturated with carried-over quests, add at most 1 fresh quest to avoid overwhelm.
  const fresh = generateDailyQuests(state, today, activeCount >= 6 ? 1 : 0);
  state.quests = [...fresh, ...state.quests];
  state.lastGenDate = today;
  return true;
}

// ---------------- completion & achievements ----------------
function checkAchievements(state: PlayerState): AchievementDef[] {
  const done = state.history.length;
  const lvl = levelInfo(state.totalXp).level;
  const streak = streakOf(state);
  const provenCount = SKILLS.filter((s) => masteryOf(state, s) === 'PROVEN').length;
  const bossDone = ALL_MILESTONES.some((m) => m.boss && state.milestonesDone[m.id]);
  const chapterDone = chapterStates(state).some((c) => c.complete);
  const tests: Record<string, boolean> = {
    'first-quest': done >= 1, 'quests-25': done >= 25, 'quests-100': done >= 100,
    'xp-500': state.totalXp >= 500, 'xp-2000': state.totalXp >= 2000, 'xp-6000': state.totalXp >= 6000,
    'level-5': lvl >= 5, 'level-10': lvl >= 10,
    'streak-3': streak >= 3, 'streak-7': streak >= 7,
    'proven-1': provenCount >= 1, 'proven-6': provenCount >= 6, 'proven-15': provenCount >= 15,
    'boss-1': bossDone, 'chapter-1': chapterDone,
    'project-1': state.projects.length >= 1, 'project-3': state.projects.length >= 3,
  };
  const fresh: AchievementDef[] = [];
  ACHIEVEMENTS.forEach((a) => {
    if (tests[a.id] && !state.achievements[a.id]) {
      state.achievements[a.id] = todayStr();
      fresh.push(a);
    }
  });
  return fresh;
}

function award(state: PlayerState, xp: number, skillId: string | null, grantsProof: boolean, today: string) {
  state.totalXp += xp;
  state.activityDays[today] = (state.activityDays[today] ?? 0) + xp;
  if (skillId && SKILL_MAP.has(skillId)) {
    state.skillXp[skillId] = (state.skillXp[skillId] ?? 0) + xp;
    state.skillLast[skillId] = today;
    if (grantsProof) state.skillProof[skillId] = (state.skillProof[skillId] ?? 0) + 1;
  }
}

/** Idempotent quest completion. Returns events for UI animation, or null if already resolved. */
export function completeQuest(state: PlayerState, questId: string, evidence: string): CompletionEvents | null {
  const q = state.quests.find((x) => x.id === questId);
  if (!q || q.status !== 'active') return null; // duplicate-reward protection
  const today = todayStr();
  const node = q.skillId ? SKILL_MAP.get(q.skillId) : undefined;
  const prevLevel = levelInfo(state.totalXp).level;
  const prevSkillLevel = node ? skillLevel(state, node.id) : 0;
  const prevMastery = node ? masteryOf(state, node) : null;

  q.status = 'completed';
  q.completedDate = today;
  q.evidence = evidence || null;
  award(state, q.xp, q.skillId, q.grantsProof, today);
  state.history.unshift({ id: q.templateId, title: q.title, xp: q.xp, date: today, skillId: q.skillId, kind: q.kind });

  return {
    gainedXp: q.xp, skillId: q.skillId, region: node?.region ?? null,
    prevLevel, newLevel: levelInfo(state.totalXp).level,
    skillName: node?.name ?? null,
    prevSkillLevel, newSkillLevel: node ? skillLevel(state, node.id) : 0,
    prevMastery, newMastery: node ? masteryOf(state, node) : null,
    newAchievements: checkAchievements(state), title: q.title,
  };
}

export function completeMilestone(state: PlayerState, milestoneId: string, evidence: string): CompletionEvents | null {
  const m = ALL_MILESTONES.find((x) => x.id === milestoneId);
  if (!m || state.milestonesDone[milestoneId]) return null;
  const today = todayStr();
  const prevLevel = levelInfo(state.totalXp).level;
  state.milestonesDone[milestoneId] = { date: today, evidence };
  award(state, m.xp, null, false, today);
  state.history.unshift({ id: m.id, title: `${m.boss ? 'BOSS DEFEATED' : 'Milestone'}: ${m.title}`, xp: m.xp, date: today, skillId: null, kind: m.boss ? 'BOSS' : 'MILESTONE' });
  return {
    gainedXp: m.xp, skillId: null, region: 'CORE',
    prevLevel, newLevel: levelInfo(state.totalXp).level,
    skillName: null, prevSkillLevel: 0, newSkillLevel: 0, prevMastery: null, newMastery: null,
    newAchievements: checkAchievements(state), title: m.title,
  };
}

export function abandonQuest(state: PlayerState, questId: string): boolean {
  const q = state.quests.find((x) => x.id === questId);
  if (!q || q.status !== 'active') return false;
  q.status = 'abandoned';
  return true;
}

export function refreshAchievements(state: PlayerState): AchievementDef[] {
  return checkAchievements(state);
}

// ---------------- state factory ----------------
export function newPlayerState(): PlayerState {
  const today = todayStr();
  const s: PlayerState = {
    version: 1, createdAt: today, totalXp: 0, mode: 'STANDARD', soundOn: true, seenIntro: false,
    skillXp: {}, skillProof: {}, skillLast: {}, quests: [], history: [],
    milestonesDone: {}, projects: [], achievements: {}, lastGenDate: '', activityDays: {},
  };
  ensureDailyQuests(s, today);
  return s;
}

// ---------------- persistence: IndexedDB (localStorage fallback) ----------------
const DB_NAME = 'ascension-db', STORE = 'profile', KEY = 'player';
const LS_KEY = 'ascension-player-v1';

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(): Promise<PlayerState | null> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    tx.onsuccess = () => resolve((tx.result as PlayerState) ?? null);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbSet(state: PlayerState): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).put(state, KEY);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadState(): Promise<PlayerState> {
  try {
    const fromIdb = await idbGet();
    if (fromIdb) return migrate(fromIdb);
  } catch { /* fall through to localStorage */ }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch { /* corrupted storage → fresh profile */ }
  return newPlayerState();
}

export async function saveState(state: PlayerState): Promise<void> {
  try { await idbSet(state); return; } catch { /* fallback below */ }
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* storage full/blocked — non-fatal */ }
}

function migrate(s: PlayerState): PlayerState {
  const fresh = newPlayerState();
  return { ...fresh, ...s, version: 1, quests: s.quests ?? [], history: s.history ?? [], projects: s.projects ?? [] };
}

export function exportState(state: PlayerState): string {
  return JSON.stringify(state, null, 2);
}
export function importState(json: string): PlayerState {
  const parsed = JSON.parse(json) as PlayerState;
  if (typeof parsed.totalXp !== 'number' || !Array.isArray(parsed.quests)) throw new Error('Invalid save file');
  return migrate(parsed);
}
