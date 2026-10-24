// ===== ASCENSION — main application =====
import { useEffect, useMemo, useRef, useState } from 'react';
import Character from './Character';
import type { PlayerState, QuestInstance, SkillNode, RegionId, DailyMode, CompletionEvents } from './types';
import {
  SKILLS, SKILL_MAP, DEPENDENTS, CHAPTERS, ACHIEVEMENTS, REGIONS, ATTRIBUTES, DOMAINS,
  CAMPAIGN_DEADLINE, ULTIMATE_QUEST, SECONDARY_QUEST,
} from './data';
import {
  todayStr, daysBetween, uid, levelInfo, rankForLevel, masteryOf, skillLevel, regionFills,
  attributeXp, chapterStates, currentChapterId, streakOf, frontierNodes, skillQuestTemplates,
  generateDailyQuests, ensureDailyQuests, completeQuest, completeMilestone, abandonQuest,
  refreshAchievements, loadState, saveState, newPlayerState, exportState, importState,
  XP_PRACTICING, XP_PROVEN,
} from './engine';

interface Toast { id: string; text: string; tone: '' | 'gold' | 'purple' | 'green'; }
type ModalState =
  | { type: 'none' }
  | { type: 'evidence'; questId?: string; milestoneId?: string; title: string; required: boolean }
  | { type: 'skill'; skillId: string }
  | { type: 'project' }
  | { type: 'custom' }
  | { type: 'settings' }
  | { type: 'abandon'; questId: string; title: string };

const MODES: { id: DailyMode; label: string; desc: string }[] = [
  { id: 'SURVIVAL', label: 'SURVIVAL', desc: '~5 min' },
  { id: 'STANDARD', label: 'STANDARD', desc: '20–45 min' },
  { id: 'DEEP', label: 'DEEP WORK', desc: '60–90 min' },
];

export default function App() {
  const [state, setState] = useState<PlayerState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [evidence, setEvidence] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState(99);
  const [highlight, setHighlight] = useState<RegionId | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<RegionId | null>(null);
  const [levelBanner, setLevelBanner] = useState<string | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const stateRef = useRef<PlayerState | null>(null);
  stateRef.current = state;

  // ---------- boot: load profile, run midnight rollover if a new day has passed ----------
  useEffect(() => {
    (async () => {
      const loaded = await loadState();
      const rolled = ensureDailyQuests(loaded, todayStr());
      setState(loaded);
      if (rolled && loaded.seenIntro) {
        setTimeout(() => pushToast('NEW DAY — quest board rotated. Unfinished quests carried forward.', 'purple'), 600);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- persistence ----------
  useEffect(() => { if (state) void saveState(state); }, [state]);

  // ---------- midnight watchdog (app left open across midnight) ----------
  useEffect(() => {
    const t = setInterval(() => {
      const s = stateRef.current;
      if (s && s.lastGenDate !== todayStr()) {
        const next = structuredClone(s);
        if (ensureDailyQuests(next, todayStr())) {
          setState(next);
          pushToast('MIDNIGHT CYCLE COMPLETE — new quests generated, pending quests preserved.', 'purple');
          beep([440, 660, 880]);
        }
      }
    }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- helpers ----------
  function pushToast(text: string, tone: Toast['tone'] = '') {
    const id = uid();
    setToasts((t) => [...t.slice(-4), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }

  function beep(freqs: number[], dur = 0.09) {
    if (!stateRef.current?.soundOn) return;
    try {
      audioRef.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ctx = audioRef.current;
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.06, ctx.currentTime + i * dur);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * dur + dur * 1.6);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + i * dur); o.stop(ctx.currentTime + i * dur + dur * 1.7);
      });
    } catch { /* audio unavailable — silent mode */ }
  }

  function runFullScan() {
    if (scanning) return;
    setScanning(true); setScanStep(0); setHighlight(null);
    beep([220, 330, 440, 550], 0.12);
    [1, 2, 3, 4].forEach((step, i) => setTimeout(() => setScanStep(step), 700 * (i + 1)));
    setTimeout(() => {
      setScanning(false); setScanStep(99);
      beep([880, 1174]);
      pushToast('SCAN COMPLETE — PLAYER PROFILE SYNCHRONIZED', 'green');
    }, 3450);
  }

  function regionScan(region: RegionId | null) {
    if (!region) return;
    setHighlight(region);
    setTimeout(() => setHighlight(null), 2600);
  }

  function handleEvents(ev: CompletionEvents) {
    beep([660, 880]);
    pushToast(`+${ev.gainedXp} XP — ${ev.title}`);
    regionScan(ev.region);
    if (ev.skillName && ev.newSkillLevel > ev.prevSkillLevel) {
      pushToast(`SKILL LEVEL UP — ${ev.skillName} → LV.${ev.newSkillLevel}`, 'purple');
      beep([523, 784, 1046]);
    }
    if (ev.skillName && ev.newMastery === 'PROVEN' && ev.prevMastery !== 'PROVEN') {
      pushToast(`★ SKILL PROVEN: ${ev.skillName} — region illuminated, follow-up quests unlocked`, 'green');
      beep([784, 988, 1175, 1568], 0.11);
    } else if (ev.skillName && ev.newMastery === 'PRACTICING' && (ev.prevMastery === 'LEARNING' || ev.prevMastery === 'AVAILABLE')) {
      pushToast(`SKILL NOW PRACTICING: ${ev.skillName} — dependent skills unlocked`, 'gold');
    }
    ev.newAchievements.forEach((a) => setTimeout(() => { pushToast(`🏆 ACHIEVEMENT: ${a.name} — ${a.desc}`, 'gold'); beep([988, 1319]); }, 450));
    if (ev.newLevel > ev.prevLevel) {
      setLevelBanner(`CHARACTER LEVEL ${ev.newLevel} — RANK: ${rankForLevel(ev.newLevel)}`);
      beep([523, 659, 784, 1046, 1319], 0.12);
      runFullScan();
      setTimeout(() => setLevelBanner(null), 2650);
    }
  }

  function update(mut: (s: PlayerState) => void) {
    if (!state) return;
    const next = structuredClone(state);
    mut(next);
    setState(next);
  }

  function doCompleteQuest(questId: string, evText: string) {
    if (!state) return;
    const next = structuredClone(state);
    const ev = completeQuest(next, questId, evText);
    if (!ev) { pushToast('Quest already resolved — no duplicate reward.', 'gold'); return; }
    setState(next); setModal({ type: 'none' }); setEvidence('');
    handleEvents(ev);
  }

  function doCompleteMilestone(milestoneId: string, evText: string) {
    if (!state) return;
    const next = structuredClone(state);
    const ev = completeMilestone(next, milestoneId, evText);
    if (!ev) return;
    setState(next); setModal({ type: 'none' }); setEvidence('');
    handleEvents(ev);
  }

  function requestReinforcement() {
    if (!state) return;
    const next = structuredClone(state);
    const fresh = generateDailyQuests(next, todayStr(), 2);
    if (fresh.length === 0) { pushToast('No additional suitable quests right now — clear the board or add a custom quest.', 'gold'); return; }
    next.quests = [...fresh, ...next.quests];
    setState(next);
    pushToast(`${fresh.length} reinforcement quest(s) deployed to the board.`);
    beep([550, 770]);
  }

  function addTemplateToBoard(node: SkillNode, templateId: string) {
    if (!state) return;
    const tpl = skillQuestTemplates(node).find((t) => t.id === templateId);
    if (!tpl) return;
    if (state.quests.some((q) => q.templateId === templateId && q.status === 'active')) { pushToast('That quest is already on the active board.', 'gold'); return; }
    if (!tpl.repeatable && state.quests.some((q) => q.templateId === templateId && q.status === 'completed')) { pushToast('That quest is already completed — one-time rewards cannot repeat.', 'gold'); return; }
    update((s) => s.quests.unshift({
      id: uid(), templateId: tpl.id, skillId: tpl.skillId, kind: tpl.kind, title: tpl.title, desc: tpl.desc,
      xp: tpl.xp, minutes: tpl.minutes, repeatable: tpl.repeatable, grantsProof: tpl.grantsProof,
      status: 'active', createdDate: todayStr(), completedDate: null, evidence: null,
    }));
    pushToast(`Quest deployed: ${tpl.title}`);
    setModal({ type: 'none' });
  }

  // ---------- derived ----------
  const derived = useMemo(() => {
    if (!state) return null;
    const li = levelInfo(state.totalXp);
    const fills = regionFills(state);
    const chapters = chapterStates(state);
    const curChapter = currentChapterId(state);
    const streak = streakOf(state);
    const today = todayStr();
    const active = state.quests.filter((q) => q.status === 'active');
    const newToday = active.filter((q) => q.createdDate === today);
    const carried = active.filter((q) => q.createdDate < today);
    const provenCount = SKILLS.filter((s) => masteryOf(state, s) === 'PROVEN').length;
    const frontier = frontierNodes(state);
    const daysLeft = daysBetween(today, CAMPAIGN_DEADLINE);
    const structural = Math.round((Object.values(fills).reduce((a, b) => a + b, 0) / 6) * 100);
    return { li, fills, chapters, curChapter, streak, active, newToday, carried, provenCount, frontier, daysLeft, structural, today };
  }, [state]);

  if (!state || !derived) return <div className="loading-screen">ASCENSION OS — LOADING PLAYER PROFILE…</div>;

  const { li, fills, today } = derived;
  const nextObjective = derived.frontier[0]?.name ?? CHAPTERS[derived.curChapter - 1].title;
  const scanVals: [string, string][] = [
    ['TECHNICAL CAPACITY', `${Math.min(99, Math.round(state.totalXp / 90))}% CHARGED`],
    ['KNOWLEDGE MATRIX', `${derived.provenCount}/${SKILLS.length} NODES VERIFIED`],
    ['PROBLEM-SOLVING INDEX', `${(attributeXp(state, 'CS') + attributeXp(state, 'PROG')).toLocaleString()} PTS`],
    ['ENGINEERING POTENTIAL', state.totalXp === 0 ? 'UNDEFINED — AWAITING FIELD DATA' : rankForLevel(li.level)],
    ['STRUCTURAL INTEGRITY', `${derived.structural}%`],
    ['NEXT OBJECTIVE', nextObjective.toUpperCase()],
  ];
  const scanPending = ['INITIALIZING…', 'SCANNING…', 'CALIBRATING…', 'ANALYZING…', 'MEASURING…', 'COMPUTING…'];

  return (
    <div className="app">
      {!state.seenIntro && (
        <IntroOverlay
          freshProfile={state.totalXp === 0 && state.history.length === 0}
          onEnter={() => { update((s) => { s.seenIntro = true; }); setTimeout(runFullScan, 350); }}
        />
      )}

      {/* ============ TOP HUD ============ */}
      <header className="top-hud">
        <div className="logo">
          <div className="l1">ASCENSION</div>
          <div className="l2">// ENGINEER ARC — CHARACTER SYSTEM</div>
        </div>
        <div className="hud-stats">
          <div className="hud-stat"><div className="k">CHARACTER LEVEL</div><div className="v">LV.{li.level}</div></div>
          <div className="hud-stat"><div className="k">RANK</div><div className="v purple">{rankForLevel(li.level)}</div></div>
          <div className="hud-stat"><div className="k">TOTAL XP</div><div className="v gold">{state.totalXp.toLocaleString()}</div></div>
          <div className="hud-stat"><div className="k">CHAPTER</div><div className="v">{derived.curChapter}/6</div></div>
          <div className="hud-stat"><div className="k">STREAK</div><div className="v">{derived.streak} DAY{derived.streak === 1 ? '' : 'S'}</div></div>
          <div className="xp-track">
            <div className="k" style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.26em', color: 'var(--text-faint)' }}>
              XP TO LV.{li.level + 1} — {li.into}/{li.need}
            </div>
            <div className="bar"><div style={{ width: `${li.pct * 100}%` }} /></div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="sys-online">SYSTEM ONLINE</span>
          <button className="btn small ghost" title="Toggle sound" onClick={() => update((s) => { s.soundOn = !s.soundOn; })}>
            {state.soundOn ? '🔊 SND' : '🔇 SND'}
          </button>
          <button className="btn small ghost" onClick={() => setModal({ type: 'settings' })}>⚙ SYSTEM</button>
        </div>
      </header>

      <div className="main-grid">
        {/* ============ LEFT: CHARACTER SCANNER ============ */}
        <div className="left-col">
          <section className="panel">
            <div className="panel-title"><span>◈ CHARACTER SCANNER</span><span className="dim">BIO-SYNC: REAL SKILLS → FORM</span></div>
            <div className="scanner-wrap">
              <div className="char-stage">
                <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
                {scanning && <div className="scan-beam" />}
                {!scanning && highlight && <div className="scan-glare" />}
                <Character fills={fills} highlight={highlight} selected={selectedRegion}
                  onSelect={(r) => setSelectedRegion(selectedRegion === r ? null : r)} />
              </div>
            </div>
            <div className="char-identity">
              <div className="char-rank">RANK: {rankForLevel(li.level)}</div>
              <div className="char-level">LEVEL {li.level}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.2em' }}>
                FORM INTEGRITY {derived.structural}% — CLICK A BODY REGION TO INSPECT
              </div>
            </div>
            <div className="readouts">
              {scanVals.map(([k, v], i) => (
                <div className="readout-row" key={k}>
                  <span className="k">{k}</span>
                  {scanning && scanStep * 2 <= i
                    ? <span className="v pend">{scanPending[i]}</span>
                    : <span className="v">{v}</span>}
                </div>
              ))}
            </div>
            <div className="scanner-actions">
              <button className="btn primary" onClick={runFullScan} disabled={scanning}>{scanning ? '◉ SCANNING…' : '▶ REPLAY SCAN'}</button>
              <button className="btn" onClick={() => document.getElementById('skill-tree')?.scrollIntoView({ behavior: 'smooth' })}>INSPECT SKILL TREE</button>
            </div>
            {selectedRegion && (
              <RegionDetail state={state} region={selectedRegion} fill={fills[selectedRegion]}
                onSkill={(id) => setModal({ type: 'skill', skillId: id })} />
            )}
          </section>

          {/* attributes */}
          <section className="panel">
            <div className="panel-title"><span>◈ CHARACTER ATTRIBUTES</span><span className="dim">10 CORE SYSTEMS</span></div>
            <div className="attr-list">
              {ATTRIBUTES.map((a) => {
                const xp = attributeXp(state, a.id);
                const info = levelInfo(xp);
                return (
                  <div className="attr-row" key={a.id}>
                    <div className="attr-head">
                      <span className="nm">{a.name}</span>
                      <span className="lv">LV.{info.level} · {xp.toLocaleString()} XP</span>
                    </div>
                    <div className={`bar thin ${a.id === 'PROJ' ? 'purple' : ''}`}><div style={{ width: `${info.pct * 100}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* ============ RIGHT: QUEST BOARD + CAMPAIGN ============ */}
        <div className="right-col">
          <section className="panel">
            <div className="panel-title">
              <span>◈ QUEST BOARD — {today}</span>
              <span className="dim">TODAY: +{state.activityDays[today] ?? 0} XP · {derived.active.length} ACTIVE</span>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '12px 16px 2px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--text-faint)' }}>DAILY MODE:</span>
              {MODES.map((m) => (
                <button key={m.id} className={`btn small ${state.mode === m.id ? 'active-mode' : ''}`}
                  onClick={() => { update((s) => { s.mode = m.id; }); pushToast(`Daily mode → ${m.label} (${m.desc}). Applies to the next generated quests.`, 'purple'); }}>
                  {m.label} · {m.desc}
                </button>
              ))}
            </div>

            {derived.active.length === 0 && (
              <div className="empty-note">
                ▸ QUEST BOARD CLEAR ◂<br />All objectives complete. Request reinforcements or forge a custom quest.
              </div>
            )}

            {derived.newToday.length > 0 && <div className="quest-group-label new">⬢ NEW TRANSMISSIONS — TODAY</div>}
            <div className="quest-list">
              {derived.newToday.map((q) => (
                <QuestCard key={q.id} q={q} state={state} isNew
                  onComplete={() => { setEvidence(''); setModal({ type: 'evidence', questId: q.id, title: q.title, required: q.grantsProof }); }}
                  onAbandon={() => setModal({ type: 'abandon', questId: q.id, title: q.title })}
                  onSkill={(id) => setModal({ type: 'skill', skillId: id })} />
              ))}
            </div>

            {derived.carried.length > 0 && <div className="quest-group-label">⬢ CARRIED OVER — PENDING (NEVER EXPIRES, NO PENALTY)</div>}
            <div className="quest-list">
              {derived.carried.map((q) => (
                <QuestCard key={q.id} q={q} state={state}
                  onComplete={() => { setEvidence(''); setModal({ type: 'evidence', questId: q.id, title: q.title, required: q.grantsProof }); }}
                  onAbandon={() => setModal({ type: 'abandon', questId: q.id, title: q.title })}
                  onSkill={(id) => setModal({ type: 'skill', skillId: id })} />
              ))}
            </div>

            <div className="board-foot">
              <button className="btn" onClick={requestReinforcement}>+ REQUEST REINFORCEMENT QUESTS</button>
              <button className="btn" onClick={() => setModal({ type: 'custom' })}>+ FORGE CUSTOM QUEST</button>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--text-faint)', alignSelf: 'center' }}>
                NEW QUESTS AUTO-GENERATE AT LOCAL MIDNIGHT · PENDING QUESTS CARRY FORWARD FOREVER
              </span>
            </div>
          </section>

          {/* campaign */}
          <section className="panel">
            <div className="panel-title"><span>◈ MAIN QUEST — THE ENGINEER ARC</span><span className="dim">6 CHAPTERS</span></div>
            <div className="ultimate">
              <div className="big">⚔ ULTIMATE QUEST: {ULTIMATE_QUEST}</div>
              <div className="sub">⬟ SECONDARY OBJECTIVE: {SECONDARY_QUEST}</div>
              <div className="deadline">⏳ T-MINUS {derived.daysLeft} DAYS TO 24 APR 2027 — EVERY PROVEN SKILL IS PERMANENT</div>
            </div>
            {derived.chapters.map(({ chapter: c, done, total, complete, pct }) => (
              <div className={`chapter ${c.id === derived.curChapter && !complete ? 'current' : ''} ${complete ? 'complete' : ''}`} key={c.id}>
                <div className="chapter-head">
                  <span className="t">CHAPTER {c.id}: {c.title.toUpperCase()}</span>
                  <span className={`tag ${complete ? 'done' : c.id === derived.curChapter ? 'cur' : 'lock'}`}>
                    {complete ? '✓ CLEARED' : c.id === derived.curChapter ? '▶ ACTIVE' : `${done}/${total}`}
                  </span>
                </div>
                <div className="sub">{c.subtitle}</div>
                <div className="bar thin purple" style={{ marginBottom: 6 }}><div style={{ width: `${pct * 100}%` }} /></div>
                {c.milestones.map((m) => {
                  const isDone = !!state.milestonesDone[m.id];
                  return (
                    <div className={`milestone ${m.boss ? 'boss' : ''}`} key={m.id}>
                      <div className="chk" title={isDone ? 'Completed' : 'Mark complete (evidence required)'}
                        onClick={() => { if (!isDone) { setEvidence(''); setModal({ type: 'evidence', milestoneId: m.id, title: m.title, required: true }); } }}>
                        {isDone ? '✓' : m.boss ? '☠' : ''}
                      </div>
                      <div>
                        <div className={`mt ${isDone ? 'done' : ''}`}>{m.title}</div>
                        <div className="md">{m.desc}{isDone && state.milestonesDone[m.id]?.evidence ? ` — Evidence: ${state.milestonesDone[m.id].evidence}` : ''}</div>
                      </div>
                      <span className="mxp">+{m.xp} XP</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        </div>
      </div>

      {/* ============ SKILL TREE ============ */}
      <section className="panel section-gap" id="skill-tree">
        <div className="panel-title">
          <span>◈ SKILL TREE — {SKILLS.length} NODES / 14 DOMAINS</span>
          <span className="dim">LEARNING &lt; PRACTICING ({XP_PRACTICING}+ XP) &lt; PROVEN ({XP_PROVEN}+ XP + TRIAL) · CLICK A NODE</span>
        </div>
        <div className="tree-domains">
          {DOMAINS.map((d) => (
            <div className="domain" key={d}>
              <h4>{d.toUpperCase()}</h4>
              {SKILLS.filter((s) => s.domain === d).map((s) => {
                const m = masteryOf(state, s);
                const xp = state.skillXp[s.id] ?? 0;
                const info = levelInfo(xp);
                return (
                  <div className={`node ${m === 'LOCKED' ? 'locked' : ''} ${m === 'PROVEN' ? 'proven' : ''}`} key={s.id}
                    onClick={() => setModal({ type: 'skill', skillId: s.id })}>
                    <div className="node-top">
                      <span className="node-name">{m === 'LOCKED' ? '🔒 ' : ''}{s.name}</span>
                      <span className={`mastery ${m}`}>{m}</span>
                    </div>
                    <div className="node-sub">LV.{info.level} · {xp} XP · CH.{s.chapter} · {s.region}{s.prereq.length ? ` · REQ: ${s.prereq.map((p) => SKILL_MAP.get(p)?.name ?? p).join(', ')}` : ' · NO PREREQUISITES'}</div>
                    <div className="bar thin"><div style={{ width: `${Math.min(100, (xp / XP_PROVEN) * 100)}%` }} /></div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* ============ BOTTOM: history / projects / achievements ============ */}
      <div className="bottom-grid">
        <section className="panel">
          <div className="panel-title"><span>◈ QUEST HISTORY</span><span className="dim">{state.history.length} COMPLETED — PERMANENT RECORD</span></div>
          <div className="scroll-list">
            {state.history.length === 0 && <div className="empty-note">NO COMPLETED QUESTS YET.<br />YOUR LEGEND BEGINS WITH THE FIRST ONE.</div>}
            {state.history.slice(0, 60).map((h, i) => (
              <div className="hist-row" key={i}>
                <span className="d">{h.date}</span>
                <span>{h.title}</span>
                <span className="x">+{h.xp} XP</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <span>◈ PROJECT INVENTORY</span>
            <button className="btn small" onClick={() => setModal({ type: 'project' })}>+ ADD PROJECT</button>
          </div>
          <div className="scroll-list">
            {state.projects.length === 0 && <div className="empty-note">NO PROJECTS REGISTERED.<br />PROJECTS POWER THE CHEST CORE.</div>}
            {state.projects.map((p) => (
              <div className="proj" key={p.id}>
                <div className="pn">{p.name} <span className={`status-tag ${p.status}`}>{p.status === 'SHIPPED' ? '🚀 SHIPPED' : '🔨 IN PROGRESS'}</span></div>
                <div className="pd">{p.desc}</div>
                <div className="pm">
                  <span>SKILLS: {p.skills || '—'}</span>
                  {p.link && <a href={p.link} target="_blank" rel="noreferrer">LINK ↗</a>}
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                    <button className="btn small ghost" onClick={() => update((s) => { const pr = s.projects.find((x) => x.id === p.id); if (pr) pr.status = pr.status === 'SHIPPED' ? 'IN_PROGRESS' : 'SHIPPED'; })}>
                      {p.status === 'SHIPPED' ? 'REOPEN' : 'MARK SHIPPED'}
                    </button>
                    <button className="btn small danger" onClick={() => update((s) => { s.projects = s.projects.filter((x) => x.id !== p.id); })}>✕</button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-title"><span>◈ ACHIEVEMENTS</span><span className="dim">{Object.keys(state.achievements).length}/{ACHIEVEMENTS.length} UNLOCKED</span></div>
          <div className="ach-grid">
            {ACHIEVEMENTS.map((a) => {
              const un = !!state.achievements[a.id];
              return (
                <div className={`ach ${un ? 'unlocked' : ''}`} key={a.id}>
                  <div className="ic">{un ? a.icon : '?'}</div>
                  <div className="an">{a.name.toUpperCase()}</div>
                  <div className="ad">{a.desc}{un ? `\n· ${state.achievements[a.id]}` : ''}</div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="footer-note">
        ASCENSION OS v1.0 — ALL PROGRESS STORED LOCALLY ON THIS DEVICE (INDEXEDDB) · EXPORT YOUR SAVE FROM ⚙ SYSTEM<br />
        "YOU ARE NOT CHECKING OFF A TO-DO LIST. YOU ARE BUILDING YOUR CHARACTER."
      </div>

      {/* ============ overlays ============ */}
      {levelBanner && (
        <div className="levelup-banner"><div className="levelup-inner">
          <div className="l1">⬆ LEVEL UP</div><div className="l2">{levelBanner}</div>
        </div></div>
      )}

      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}
      </div>

      {modal.type === 'evidence' && (
        <div className="modal-back" onClick={() => setModal({ type: 'none' })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>◈ CONFIRM COMPLETION</h3>
            <div className="sub"><b>{modal.title}</b><br />
              {modal.required
                ? 'This is a proof-bearing objective. Watching a tutorial does NOT count. Provide evidence of demonstrated ability: a GitHub link/commit, file name, test result, or a precise description of what you built and can now do unaided.'
                : 'Only confirm if you actually did the work — the system trusts your honour, and your character is only as real as your honesty. An evidence note is optional but recommended.'}
            </div>
            <label>EVIDENCE / FIELD REPORT {modal.required ? '(REQUIRED)' : '(OPTIONAL)'}</label>
            <textarea rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)}
              placeholder="e.g. github.com/you/expense-tracker — CLI works, data persists in JSON, wrote it without the tutorial open" />
            <div className="modal-actions">
              <button className="btn primary" disabled={modal.required && evidence.trim().length < 8}
                onClick={() => modal.questId ? doCompleteQuest(modal.questId, evidence.trim()) : doCompleteMilestone(modal.milestoneId!, evidence.trim())}>
                ✓ I DID THIS — CLAIM XP
              </button>
              <button className="btn ghost" onClick={() => setModal({ type: 'none' })}>NOT YET</button>
            </div>
          </div>
        </div>
      )}

      {modal.type === 'abandon' && (
        <div className="modal-back" onClick={() => setModal({ type: 'none' })}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>◈ ABANDON QUEST?</h3>
            <div className="sub"><b>{modal.title}</b><br />Abandoning removes it from the active board with no XP penalty and no guilt protocol. One-time quests can be re-added later from the skill tree.</div>
            <div className="modal-actions">
              <button className="btn danger" onClick={() => { update((s) => abandonQuest(s, modal.questId)); setModal({ type: 'none' }); pushToast('Quest abandoned. The board remains yours to command.'); }}>ABANDON</button>
              <button className="btn ghost" onClick={() => setModal({ type: 'none' })}>KEEP QUEST</button>
            </div>
          </div>
        </div>
      )}

      {modal.type === 'skill' && (
        <SkillModal state={state} skillId={modal.skillId}
          onClose={() => setModal({ type: 'none' })}
          onAdd={(node, tplId) => addTemplateToBoard(node, tplId)}
          onJump={(id) => setModal({ type: 'skill', skillId: id })} />
      )}

      {modal.type === 'project' && (
        <ProjectModal onClose={() => setModal({ type: 'none' })}
          onSave={(p) => {
            if (!state) return;
            const next = structuredClone(state);
            next.projects.unshift(p);
            const fresh = refreshAchievements(next);
            setState(next); setModal({ type: 'none' });
            pushToast(`Project registered: ${p.name} — chest core charge increased.`, 'purple');
            regionScan('CORE');
            fresh.forEach((a) => pushToast(`🏆 ACHIEVEMENT: ${a.name}`, 'gold'));
          }} />
      )}

      {modal.type === 'custom' && (
        <CustomQuestModal unlockedSkills={SKILLS.filter((s) => masteryOf(state, s) !== 'LOCKED')}
          onClose={() => setModal({ type: 'none' })}
          onSave={(q) => { update((s) => s.quests.unshift(q)); setModal({ type: 'none' }); pushToast(`Custom quest forged: ${q.title}`); }} />
      )}

      {modal.type === 'settings' && (
        <SettingsModal state={state} onClose={() => setModal({ type: 'none' })}
          onImport={(s) => { ensureDailyQuests(s, todayStr()); setState(s); setModal({ type: 'none' }); pushToast('Save imported — welcome back, operative.', 'green'); }}
          onReset={() => { setState(newPlayerState()); setModal({ type: 'none' }); pushToast('Profile reset. A new character awaits initialization.', 'purple'); }} />
      )}
    </div>
  );
}

/* ================= sub-components ================= */

function RegionDetail({ state, region, fill, onSkill }: { state: PlayerState; region: RegionId; fill: number; onSkill: (id: string) => void }) {
  const info = REGIONS.find((r) => r.id === region)!;
  const nodes = SKILLS.filter((s) => s.region === region);
  return (
    <div className="region-detail">
      <h4>{info.name} — {Math.round(fill * 100)}% ILLUMINATED</h4>
      <p>{info.desc}. This region fills as the skills below gain XP and reach PROVEN status.</p>
      {region === 'CORE' && <p>＋ Bonus charge from registered projects ({state.projects.length}) and campaign milestones ({Object.keys(state.milestonesDone).length}).</p>}
      {nodes.map((s) => (
        <div className="region-skill" key={s.id} onClick={() => onSkill(s.id)}>
          <span>{s.name}</span>
          <span className={`mastery ${masteryOf(state, s)}`}>{masteryOf(state, s)}</span>
        </div>
      ))}
      {nodes.length === 0 && <p>Powered by projects and milestones rather than direct skill nodes.</p>}
    </div>
  );
}

function QuestCard({ q, state, isNew, onComplete, onAbandon, onSkill }:
  { q: QuestInstance; state: PlayerState; isNew?: boolean; onComplete: () => void; onAbandon: () => void; onSkill: (id: string) => void }) {
  const node = q.skillId ? SKILL_MAP.get(q.skillId) : undefined;
  const age = daysBetween(q.createdDate, todayStr());
  return (
    <div className={`quest ${age > 0 ? 'overdue' : ''}`}>
      <div className="quest-top">
        <span className={`quest-kind ${q.kind}`}>{q.kind}</span>
        {isNew && <span className="new-badge">NEW</span>}
        {age > 0 && <span className="carry-badge">PENDING DAY {age + 1}</span>}
        {q.grantsProof && <span className="quest-kind PROVE">GRANTS PROOF ★</span>}
        <span className="quest-title">{q.title}</span>
      </div>
      <div className="quest-desc">{q.desc}</div>
      <div className="quest-meta">
        <span className="xp">+{q.xp} XP</span>
        <span>⏱ ~{q.minutes} MIN</span>
        {node && (
          <span style={{ cursor: 'pointer', color: 'var(--cyan)' }} onClick={() => onSkill(node.id)}>
            SKILL: {node.name} (LV.{skillLevel(state, node.id)}) ↗
          </span>
        )}
        <span className="quest-actions">
          <button className="btn small primary" onClick={onComplete}>✓ COMPLETE</button>
          <button className="btn small ghost" onClick={onAbandon}>ABANDON</button>
        </span>
      </div>
    </div>
  );
}

function SkillModal({ state, skillId, onClose, onAdd, onJump }:
  { state: PlayerState; skillId: string; onClose: () => void; onAdd: (n: SkillNode, t: string) => void; onJump: (id: string) => void }) {
  const s = SKILL_MAP.get(skillId)!;
  const m = masteryOf(state, s);
  const xp = state.skillXp[s.id] ?? 0;
  const deps = (DEPENDENTS.get(s.id) ?? []).map((id) => SKILL_MAP.get(id)!).filter(Boolean);
  const tpls = skillQuestTemplates(s);
  const tplState = (id: string, repeatable: boolean) => {
    if (state.quests.some((q) => q.templateId === id && q.status === 'active')) return 'ON BOARD';
    if (!repeatable && state.quests.some((q) => q.templateId === id && q.status === 'completed')) return 'COMPLETED';
    return 'ADD TO BOARD';
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{s.name.toUpperCase()}</h3>
        <div className="sub" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`mastery ${m}`}>{m}</span>
          <span>LV.{levelInfo(xp).level} · {xp} XP · proofs: {state.skillProof[s.id] ?? 0} · last practiced: {state.skillLast[s.id] ?? 'never'}</span>
        </div>
        <div className="bar"><div style={{ width: `${Math.min(100, (xp / XP_PROVEN) * 100)}%` }} /></div>
        <div className="kv">
          <span className="k">DOMAIN</span><span className="v">{s.domain} · Chapter {s.chapter}</span>
          <span className="k">BODY REGION</span><span className="v">{REGIONS.find((r) => r.id === s.region)?.name}</span>
          <span className="k">OBJECTIVE</span><span className="v">{s.objective}</span>
          <span className="k">MINI-PROJECT</span><span className="v">{s.miniProject}</span>
          <span className="k">PROOF STANDARD</span><span className="v">{s.proof}</span>
          <span className="k">5-MIN DRILL</span><span className="v">{s.drill}</span>
        </div>
        <label>EXERCISES</label>
        <ul>{s.exercises.map((e, i) => <li key={i}>{e}</li>)}</ul>
        <label>PREREQUISITES (MUST REACH PRACTICING)</label>
        {s.prereq.length === 0 ? <div className="sub">None — available from day one.</div> : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {s.prereq.map((p) => { const pn = SKILL_MAP.get(p)!; return (
              <button key={p} className="btn small ghost" onClick={() => onJump(p)}>
                {pn.name} · {masteryOf(state, pn)}
              </button> ); })}
          </div>
        )}
        <label>NEXT RECOMMENDED (UNLOCKED BY THIS SKILL)</label>
        {deps.length === 0 ? <div className="sub">Terminal node — mastery here feeds the campaign directly.</div> : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {deps.map((d) => <button key={d.id} className="btn small" onClick={() => onJump(d.id)}>{d.name} →</button>)}
          </div>
        )}
        <label>RELATED QUESTS</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tpls.map((t) => {
            const st = tplState(t.id, t.repeatable);
            return (
              <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                <span className={`quest-kind ${t.kind}`}>{t.kind}</span>
                <span style={{ flex: 1 }}>{t.title} · +{t.xp} XP · ~{t.minutes}m</span>
                <button className="btn small" disabled={st !== 'ADD TO BOARD' || m === 'LOCKED'} onClick={() => onAdd(s, t.id)}>{m === 'LOCKED' ? 'LOCKED' : st}</button>
              </div>
            );
          })}
        </div>
        {m === 'LOCKED' && <div className="sub" style={{ marginTop: 10 }}>🔒 Locked: bring every prerequisite to PRACTICING ({XP_PRACTICING}+ XP) to unlock this node. The quest engine will not assign its quests until then.</div>}
        <div className="modal-actions"><button className="btn ghost" onClick={onClose}>CLOSE</button></div>
      </div>
    </div>
  );
}

function ProjectModal({ onClose, onSave }: { onClose: () => void; onSave: (p: PlayerState['projects'][number]) => void }) {
  const [name, setName] = useState(''); const [desc, setDesc] = useState('');
  const [link, setLink] = useState(''); const [skills, setSkills] = useState('');
  const [status, setStatus] = useState<'IN_PROGRESS' | 'SHIPPED'>('IN_PROGRESS');
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>◈ REGISTER PROJECT</h3>
        <div className="sub">Projects are the strongest evidence of ability. They charge the chest POWER CORE and the Project Experience attribute.</div>
        <label>PROJECT NAME *</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Expense Tracker CLI" />
        <label>DESCRIPTION</label><textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What it does, what problem it solves" />
        <label>LINK (GITHUB / DEMO)</label><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://github.com/…" />
        <label>SKILLS USED</label><input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Python, JSON, CLI" />
        <label>STATUS</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as 'IN_PROGRESS' | 'SHIPPED')}>
          <option value="IN_PROGRESS">🔨 IN PROGRESS</option>
          <option value="SHIPPED">🚀 SHIPPED (WORKS END-TO-END)</option>
        </select>
        <div className="modal-actions">
          <button className="btn primary" disabled={name.trim().length < 2}
            onClick={() => onSave({ id: uid(), name: name.trim(), desc: desc.trim(), link: link.trim(), skills: skills.trim(), status, createdDate: todayStr() })}>
            REGISTER
          </button>
          <button className="btn ghost" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

function CustomQuestModal({ unlockedSkills, onClose, onSave }:
  { unlockedSkills: SkillNode[]; onClose: () => void; onSave: (q: QuestInstance) => void }) {
  const [title, setTitle] = useState(''); const [desc, setDesc] = useState('');
  const [skillId, setSkillId] = useState(''); const [xp, setXp] = useState(40); const [minutes, setMinutes] = useState(30);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>◈ FORGE CUSTOM QUEST</h3>
        <div className="sub">Define your own objective. Rule of honour: it must produce evidence — code, notes, a fix, a demo — not passive watching.</div>
        <label>QUEST TITLE *</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Rebuild yesterday's pandas exercise from memory" />
        <label>DESCRIPTION / DEFINITION OF DONE</label><textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Done when…" />
        <label>LINKED SKILL (XP FLOWS THERE)</label>
        <select value={skillId} onChange={(e) => setSkillId(e.target.value)}>
          <option value="">— General / campaign XP only —</option>
          {unlockedSkills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label>XP REWARD (BE HONEST ABOUT EFFORT)</label>
        <select value={xp} onChange={(e) => setXp(Number(e.target.value))}>
          <option value={15}>15 XP — micro task (~5 min)</option>
          <option value={40}>40 XP — solid task (~25 min)</option>
          <option value={75}>75 XP — deep task (~45 min)</option>
          <option value={120}>120 XP — major build (~60+ min)</option>
        </select>
        <label>ESTIMATED MINUTES</label>
        <input type="number" min={1} max={300} value={minutes} onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))} />
        <div className="modal-actions">
          <button className="btn primary" disabled={title.trim().length < 3}
            onClick={() => onSave({
              id: uid(), templateId: `custom:${uid()}`, skillId: skillId || null, kind: 'CUSTOM',
              title: title.trim(), desc: desc.trim() || 'Custom objective defined by the player.',
              xp, minutes, repeatable: false, grantsProof: false,
              status: 'active', createdDate: todayStr(), completedDate: null, evidence: null,
            })}>DEPLOY QUEST</button>
          <button className="btn ghost" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ state, onClose, onImport, onReset }:
  { state: PlayerState; onClose: () => void; onImport: (s: PlayerState) => void; onReset: () => void }) {
  const [importText, setImportText] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [err, setErr] = useState('');
  const download = () => {
    const blob = new Blob([exportState(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ascension-save-${todayStr()}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>⚙ SYSTEM — SAVE DATA MANAGEMENT</h3>
        <div className="sub">
          Profile created {state.createdAt} · {state.totalXp.toLocaleString()} XP · {state.history.length} quests completed.<br />
          Data persists in this browser via IndexedDB. Export regularly — clearing browser data erases local saves.
        </div>
        <label>EXPORT SAVE</label>
        <button className="btn primary" onClick={download}>⬇ DOWNLOAD SAVE FILE (.JSON)</button>
        <label>IMPORT SAVE (PASTE JSON)</label>
        <textarea rows={4} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste a previously exported ASCENSION save…" />
        {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{err}</div>}
        <div className="modal-actions">
          <button className="btn" disabled={!importText.trim()} onClick={() => {
            try { onImport(importState(importText)); } catch { setErr('Invalid save file — import aborted, current progress untouched.'); }
          }}>⬆ IMPORT & OVERWRITE</button>
        </div>
        <label>DANGER ZONE</label>
        {!confirmReset
          ? <button className="btn danger" onClick={() => setConfirmReset(true)}>☠ RESET ENTIRE CHARACTER</button>
          : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn danger" onClick={onReset}>CONFIRM — ERASE EVERYTHING</button>
              <button className="btn ghost" onClick={() => setConfirmReset(false)}>CANCEL</button>
            </div>}
        <div className="modal-actions"><button className="btn ghost" onClick={onClose}>CLOSE</button></div>
      </div>
    </div>
  );
}

function IntroOverlay({ freshProfile, onEnter }: { freshProfile: boolean; onEnter: () => void }) {
  const lines = [
    '> ASCENSION OS v1.0 — COLD BOOT SEQUENCE',
    freshProfile ? '> NO EXISTING PROFILE — CREATING NEW CHARACTER SHELL … [OK]' : '> PLAYER PROFILE LOCATED … [OK]',
    '> BIOMETRIC SCAN: TECHNICAL CAPACITY … INITIALIZING',
    '> KNOWLEDGE MATRIX … SCANNING',
    '> PROBLEM-SOLVING INDEX … CALIBRATING',
    '> ENGINEERING POTENTIAL … UNDEFINED — REQUIRES FIELD DATA',
    '> QUEST ENGINE … ONLINE · MIDNIGHT PROTOCOL ARMED',
    '> CAMPAIGN LOADED: ENGINEER ARC — 6 CHAPTERS · 53 SKILL NODES',
  ];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setShown((s) => { if (s >= lines.length) { clearInterval(t); return s; } return s + 1; }), 520);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const done = shown >= lines.length;
  return (
    <div className="intro-overlay">
      <div className="intro-box">
        <div className="intro-title">ASCENSION</div>
        <div className="intro-sub">// CHARACTER INITIALIZATION PROTOCOL</div>
        {lines.slice(0, shown).map((l, i) => <div className={`boot-line ${i === 0 ? 'dim' : ''}`} key={i}>{l}</div>)}
        {done && (
          <div className="intro-final">
            <div className="f1">INITIALIZATION COMPLETE</div>
            <div className="f2">PLAYER PROFILE ESTABLISHED · ENGINEER ARC: ACTIVE</div>
            <div className="f3">NEXT OBJECTIVE: PYTHON FOUNDATIONS</div>
            <button className="btn primary" style={{ fontSize: 13, padding: '12px 26px' }} onClick={onEnter}>▶ INITIATE ASCENSION</button>
            <div style={{ marginTop: 16, fontSize: 10.5, color: 'var(--text-faint)', letterSpacing: '0.12em', lineHeight: 1.9 }}>
              YOUR CHARACTER IS YOU. IT FILLS IN ONLY WHEN REAL SKILLS ARE DEMONSTRATED.<br />
              WATCHING A TUTORIAL GRANTS NOTHING. BUILDING SOMETHING GRANTS EVERYTHING.
            </div>
          </div>
        )}
        {!done && <button className="btn ghost small" style={{ marginTop: 22 }} onClick={() => setShown(lines.length)}>SKIP ▸▸</button>}
      </div>
    </div>
  );
}
