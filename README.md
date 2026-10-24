# ⬢ ASCENSION — Engineer Arc

A personal RPG progression game where **you are the character**. Your real-world
technical skills (Python → data → APIs → ML → deep learning → LLM engineering →
deployment → first paid work) progressively fill in a holographic character.

> "I am not checking off a to-do list. I am building my character through
> real-world accomplishments."

## ▶ How to run

**Option A — instant (recommended for daily use):**
Open **`ASCENSION_standalone.html`** in any modern browser. It's one file,
works fully offline, forever. Keep it on your desktop or phone.

**Option B — dev server (for modifying the game):**
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm run preview    # serve the production build
node tools/make-standalone.mjs   # rebuild the single-file version
```

## 💾 Your save data (IMPORTANT)

- Progress is stored **in your browser** (IndexedDB) — automatically, on every action.
- The standalone file and the dev server are **different origins = different saves**.
  Pick one home for the game.
- **Export your save weekly**: `⚙ SYSTEM → Download Save File`. Clearing browser
  data erases local saves; the exported JSON restores everything via Import.
- At **local midnight** (or next launch) new quests generate automatically.
  Unfinished quests **never expire** — they carry forward until you complete or
  abandon them. XP is never erased. Missed a day? No penalty, no guilt protocol.

## 🎮 How the game works

- **Character scanner (left):** 6 body regions fill with energy as skills gain XP —
  Head = AI/ML & math · Torso = programming & CS · Left arm = data · Right arm =
  development & automation · Legs = Linux/systems/deployment · Chest core = projects.
  Click any region to inspect it. `REPLAY SCAN` re-runs the cinematic.
- **Quest board:** adaptive daily quests sized to your mode —
  `SURVIVAL ~5 min` · `STANDARD 20–45 min` · `DEEP WORK 60–90 min`.
  Priority: overdue foundations → current chapter objectives → revision of stale
  skills → debugging/project work → portfolio & income side quests.
- **Mastery states:** every skill is `LOCKED → AVAILABLE → LEARNING → PRACTICING
  (150+ XP) → PROVEN (280+ XP + a completed ⚔ Trial with evidence)`.
  Watching a tutorial can never make a skill PROVEN — only demonstrated work can.
- **Main quest:** 6 chapters, milestones + boss battles, ending April 24, 2027 —
  a capable AI/ML engineer, plus ₹5,000–₹10,000 from legitimate technical work.
- **Skill tree:** 53 nodes across 14 domains with prerequisites, exercises,
  mini-projects and proof standards. Click any node; you can also manually deploy
  its quests to the board. Optional branches exist (e.g. web dev, scraping).
- **Honesty system:** proof-bearing quests and milestones require evidence
  (GitHub link, test result, description of what you built unaided). The system
  cannot verify your real skills — it trusts you, and your character is only as
  real as your honesty.

## 🏗 Architecture

| File | Role |
|---|---|
| `src/types.ts` | Core type definitions |
| `src/data.ts` | Skill tree (53 nodes), chapters, quest pools, achievements |
| `src/engine.ts` | IndexedDB persistence, XP/mastery math, adaptive quest generation, midnight rollover |
| `src/Character.tsx` | SVG holographic character (regions fill with XP) |
| `src/App.tsx` | HUD interface, scan cinematics, quest board, modals |
| `tests/run.ts` | 37 engine logic tests |

Run tests:
```bash
npx esbuild tests/run.ts --bundle --platform=node --format=esm --outfile=/tmp/run.mjs && node /tmp/run.mjs
```

## 🔧 Customizing

- Want new skills? Add a node object in `src/data.ts` (id, prerequisites,
  exercises, mini-project, proof) — quests, regions and unlocks wire up automatically.
- XP curve & thresholds live at the top of `src/engine.ts`.
- The campaign deadline is `CAMPAIGN_DEADLINE` in `src/data.ts`.

**Now go complete your first quest. Your character is waiting to be built.** ⬢
