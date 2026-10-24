// ===== ASCENSION — core types =====

export type RegionId = 'HEAD' | 'TORSO' | 'LARM' | 'RARM' | 'LEGS' | 'CORE';

export type Mastery = 'LOCKED' | 'AVAILABLE' | 'LEARNING' | 'PRACTICING' | 'PROVEN';

export type QuestKind =
  | 'LEARN' | 'PRACTICE' | 'PROVE' | 'REVISION' | 'DEBUG'
  | 'PROJECT' | 'SIDE' | 'DRILL' | 'CUSTOM';

export type DailyMode = 'SURVIVAL' | 'STANDARD' | 'DEEP';

export interface SkillNode {
  id: string;
  name: string;
  domain: string;          // one of the 14 domains
  chapter: number;         // 1..6 — priority hint, not a hard lock
  region: RegionId;        // body region it illuminates
  attribute: string;       // one of the 10 character attributes
  prereq: string[];        // skill ids that must reach PRACTICING first
  tier: number;            // difficulty 1..5 (scales XP)
  objective: string;       // practical learning objective
  exercises: string[];     // concrete practice tasks
  miniProject: string;     // proof-of-skill build
  proof: string;           // how competence is demonstrated
  drill: string;           // 5-minute micro task (SURVIVAL mode)
}

export interface QuestTemplate {
  id: string;
  skillId: string | null;
  kind: QuestKind;
  title: string;
  desc: string;
  xp: number;
  minutes: number;
  repeatable: boolean;
  grantsProof: boolean;
}

export interface QuestInstance {
  id: string;
  templateId: string;
  skillId: string | null;
  kind: QuestKind;
  title: string;
  desc: string;
  xp: number;
  minutes: number;
  repeatable: boolean;
  grantsProof: boolean;
  status: 'active' | 'completed' | 'abandoned';
  createdDate: string;        // YYYY-MM-DD (local)
  completedDate: string | null;
  evidence: string | null;
}

export interface Milestone {
  id: string;
  title: string;
  desc: string;
  xp: number;
  boss: boolean;
}

export interface Chapter {
  id: number;
  title: string;
  subtitle: string;
  milestones: Milestone[];
}

export interface ProjectItem {
  id: string;
  name: string;
  desc: string;
  link: string;
  skills: string;
  status: 'IN_PROGRESS' | 'SHIPPED';
  createdDate: string;
}

export interface HistoryEntry {
  id: string;
  title: string;
  xp: number;
  date: string;
  skillId: string | null;
  kind: string;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
}

export interface PlayerState {
  version: number;
  createdAt: string;
  totalXp: number;
  mode: DailyMode;
  soundOn: boolean;
  seenIntro: boolean;
  skillXp: Record<string, number>;
  skillProof: Record<string, number>;     // count of PROVE completions per skill
  skillLast: Record<string, string>;      // last practiced date per skill
  quests: QuestInstance[];
  history: HistoryEntry[];
  milestonesDone: Record<string, { date: string; evidence: string }>;
  projects: ProjectItem[];
  achievements: Record<string, string>;   // id -> unlock date
  lastGenDate: string;                    // last daily-generation date
  activityDays: Record<string, number>;   // date -> XP earned that day
}

export interface CompletionEvents {
  gainedXp: number;
  skillId: string | null;
  region: RegionId | null;
  prevLevel: number;
  newLevel: number;
  skillName: string | null;
  prevSkillLevel: number;
  newSkillLevel: number;
  prevMastery: Mastery | null;
  newMastery: Mastery | null;
  newAchievements: AchievementDef[];
  title: string;
}
