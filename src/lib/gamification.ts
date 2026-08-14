/**
 * Game Task Reset Cooldown Interval
 * Resets mini-games (Stellar Stroop Catcher & Vault Code Breaker) every 5 minutes so users can replay them.
 * 
 * Note: To switch to a 24-hour daily reset in production, change this value to:
 * export const GAME_RESET_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 Hours (86,400,000 ms)
 */
export const GAME_RESET_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes (300,000 ms) -- Production: 24 * 60 * 60 * 1000 (24h)

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

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
}

export interface QuestTask {
  id: string;
  title: string;
  description: string;
  rewardXp: number;
  completed: boolean;
  category: "daily" | "quiz" | "vault" | "social" | "game";
  emoji: string;
  actionText: string;
  quizQuestion?: QuizQuestion;
  lastCompletedAt?: number;
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

export const INITIAL_QUESTS: QuestTask[] = [
  {
    id: "daily_checkin",
    title: "Daily Saver Check-In",
    description: "Claim your daily login streak bonus.",
    rewardXp: 50,
    completed: false,
    category: "daily",
    emoji: "☀️",
    actionText: "Claim +50 XP",
  },
  {
    id: "soroban_quiz",
    title: "Soroban Smart Quiz",
    description: "Answer a quick Web3 Soroban contract question.",
    rewardXp: 100,
    completed: false,
    category: "quiz",
    emoji: "🧠",
    actionText: "Take Quiz",
    quizQuestion: {
      question: "Which smart contract platform powers native smart contracts on the Stellar network?",
      options: ["EVM", "Soroban", "CosmWasm", "Solana Anchor"],
      correctAnswer: 1, // Soroban
    },
  },
  {
    id: "explore_contract",
    title: "Inspect Contract Explorer",
    description: "Inspect the Piggy Bank contract metadata on Stellar Explorer.",
    rewardXp: 75,
    completed: false,
    category: "social",
    emoji: "🔍",
    actionText: "Inspect Contract",
  },
  {
    id: "vault_deposit_quest",
    title: "Vault Depositor",
    description: "Deposit any XLM into the Timelock Savings Vault.",
    rewardXp: 150,
    completed: false,
    category: "vault",
    emoji: "💰",
    actionText: "Deposit XLM",
  },
  {
    id: "stroop_catcher_game",
    title: "Stellar Stroop Catcher",
    description: "Catch glowing Stroop coins in a 15-second speed arcade challenge.",
    rewardXp: 100,
    completed: false,
    category: "game",
    emoji: "🪙",
    actionText: "Play Game",
  },
  {
    id: "code_breaker_game",
    title: "Vault Code Breaker",
    description: "Memorize the security combination pattern to crack the vault.",
    rewardXp: 150,
    completed: false,
    category: "game",
    emoji: "🔐",
    actionText: "Play Game",
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
export function saveGamificationState(data: {
  xp: number;
  streak: number;
  badges: string[];
  completedQuests?: string[];
  questTimestamps?: Record<string, number>;
}) {
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
export function loadGamificationState(): {
  xp: number;
  streak: number;
  badges: string[];
  completedQuests: string[];
  questTimestamps: Record<string, number>;
} {
  if (typeof window === "undefined") {
    return { xp: 150, streak: 1, badges: [], completedQuests: [], questTimestamps: {} };
  }
  try {
    const raw = localStorage.getItem("soroban_piggy_gamification");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        xp: parsed.xp ?? 150,
        streak: parsed.streak ?? 1,
        badges: parsed.badges ?? [],
        completedQuests: parsed.completedQuests ?? [],
        questTimestamps: parsed.questTimestamps ?? {},
      };
    }
  } catch (e) {
    console.error("Failed to load gamification state:", e);
  }
  return { xp: 150, streak: 1, badges: [], completedQuests: [], questTimestamps: {} };
}


