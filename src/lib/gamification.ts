export interface LevelInfo {
  level: number;
  title: string;
  badgeEmoji: string;
  minXp: number;
  maxXp: number;
  nextLevelXp: number;
}

export interface AchievementBadge {
  id: string;
  title: string;
  description: string;
  emoji: string;
  unlocked: boolean;
}

export const LEVEL_TIERS: LevelInfo[] = [
  { level: 1, title: "Piggy Novice", badgeEmoji: "🐷", minXp: 0, maxXp: 499, nextLevelXp: 500 },
  { level: 2, title: "Penny Saver", badgeEmoji: "💰", minXp: 500, maxXp: 1499, nextLevelXp: 1500 },
  { level: 3, title: "Vault Master", badgeEmoji: "🛡️", minXp: 1500, maxXp: 3499, nextLevelXp: 3500 },
  { level: 4, title: "Diamond Hands", badgeEmoji: "💎", minXp: 3500, maxXp: 6999, nextLevelXp: 7000 },
  { level: 5, title: "Stellar Whale", badgeEmoji: "🐋", minXp: 7000, maxXp: 99999, nextLevelXp: 100000 },
];

export const INITIAL_BADGES: AchievementBadge[] = [
  {
    id: "first_deposit",
    title: "First Deposit",
    description: "Deposit your first XLM into the Piggy Bank.",
    emoji: "🐣",
    unlocked: false,
  },
  {
    id: "iron_lock",
    title: "Iron Vault",
    description: "Complete a 60-second timelock cycle.",
    emoji: "🔒",
    unlocked: false,
  },
  {
    id: "diamond_hands",
    title: "Diamond Saver",
    description: "Accumulate 5.0+ XLM in the savings vault.",
    emoji: "💎",
    unlocked: false,
  },
  {
    id: "streak_master",
    title: "Streak Master",
    description: "Achieve a 3-cycle savings streak.",
    emoji: "🔥",
    unlocked: false,
  },
  {
    id: "stellar_rocket",
    title: "Stellar Rocket",
    description: "Reach Piggy Level 3 (Vault Master).",
    emoji: "🚀",
    unlocked: false,
  },
];

/**
 * Calculate level info based on current XP
 */
export function getLevelInfo(xp: number): LevelInfo {
  for (let i = LEVEL_TIERS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_TIERS[i].minXp) {
      return LEVEL_TIERS[i];
    }
  }
  return LEVEL_TIERS[0];
}

/**
 * Save Gamification State to LocalStorage
 */
export function saveGamificationState(data: { xp: number; streak: number; badges: string[] }) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("soroban_piggy_gamification", JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save gamification state:", e);
  }
}

/**
 * Load Gamification State from LocalStorage
 */
export function loadGamificationState(): { xp: number; streak: number; badges: string[] } {
  if (typeof window === "undefined") {
    return { xp: 0, streak: 0, badges: [] };
  }
  try {
    const raw = localStorage.getItem("soroban_piggy_gamification");
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Failed to load gamification state:", e);
  }
  return { xp: 150, streak: 1, badges: [] }; // Initial starter XP
}
