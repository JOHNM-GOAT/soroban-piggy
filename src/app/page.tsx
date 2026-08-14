"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import {
  PiggyBank,
  Lock,
  Unlock,
  Wallet,
  RefreshCw,
  ExternalLink,
  Coins,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Trophy,
  Flame,
  Zap,
  Volume2,
  VolumeX,
  Award,
  Sparkles,
  CheckCircle2,
  FileText,
  Eye,
  EyeOff,
  Gamepad2,
  HelpCircle,
  Check,
  Target,
  RotateCcw,
  Play,
  Key,
  LogOut,
  ArrowRight,
  Shield,
  X,
} from "lucide-react";
import { STELLAR_CONFIG } from "../config/stellar";
import {
  getVaultInfo,
  connectWallet,
  checkWalletConnection,
  isFreighterInstalled,
  depositXlm,
  withdrawXlm,
  VaultInfo,
} from "../lib/soroban";
import { playCoinSound, playLevelUpSound, playUnlockChime } from "../lib/audio";
import {
  getLevelInfo,
  loadGamificationState,
  saveGamificationState,
  INITIAL_BADGES,
  INITIAL_QUESTS,
  AchievementBadge,
  QuestTask,
  GAME_RESET_INTERVAL_MS,
} from "../lib/gamification";

const LOCK_DURATION = 60;   // 1 minute (60 seconds) lock phase
const UNLOCK_DURATION = 20; // 20 seconds unlock window

export default function Home() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [vaultInfo, setVaultInfo] = useState<VaultInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [freighterInstalled, setFreighterInstalled] = useState<boolean>(true);
  const [depositAmount, setDepositAmount] = useState<string>("1.0");
  const [txProcessing, setTxProcessing] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "warning";
    text: string;
    hash?: string;
    installLink?: boolean;
  } | null>(null);

  // 1-minute Lock / 20-second Unlock Cycle State
  const [phase, setPhase] = useState<"LOCKED" | "UNLOCKED">("LOCKED");
  const [secondsRemaining, setSecondsRemaining] = useState<number>(LOCK_DURATION);

  // Gamification & UI State
  const [xp, setXp] = useState<number>(150);
  const [streak, setStreak] = useState<number>(1);
  const [badges, setBadges] = useState<AchievementBadge[]>(INITIAL_BADGES);
  const [quests, setQuests] = useState<QuestTask[]>(INITIAL_QUESTS);
  const [activeQuiz, setActiveQuiz] = useState<QuestTask | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [showMetadata, setShowMetadata] = useState<boolean>(true);
  const [activeGameModal, setActiveGameModal] = useState<"stroop" | "code" | null>(null);
  const [questTimestamps, setQuestTimestamps] = useState<Record<string, number>>({});
  const [now, setNow] = useState<number>(Date.now());

  // Mini-Game 1: Stroop Catcher State
  const [stroopActive, setStroopActive] = useState<boolean>(false);
  const [stroopTimeLeft, setStroopTimeLeft] = useState<number>(15);
  const [stroopScore, setStroopScore] = useState<number>(0);
  const [stroopTarget, setStroopTarget] = useState<number>(4);
  const [stroopHighScore, setStroopHighScore] = useState<number>(0);

  // Mini-Game 2: Vault Code Breaker State
  const [codePhase, setCodePhase] = useState<"idle" | "showing" | "playing" | "success" | "failed">("idle");
  const [codeSequence, setCodeSequence] = useState<number[]>([]);
  const [userSequence, setUserSequence] = useState<number[]>([]);
  const [highlightKey, setHighlightKey] = useState<number | null>(null);

  // Trigger Confetti Celebration
  const fireConfetti = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Load Gamification from LocalStorage on mount
  useEffect(() => {
    const state = loadGamificationState();
    setXp(state.xp);
    setStreak(state.streak);
    if (state.badges && state.badges.length > 0) {
      setBadges((prev) =>
        prev.map((b) => ({ ...b, unlocked: state.badges.includes(b.id) }))
      );
    }
    const savedTimestamps = state.questTimestamps || {};
    setQuestTimestamps(savedTimestamps);
    if (state.completedQuests && state.completedQuests.length > 0) {
      setQuests((prev) =>
        prev.map((q) => ({
          ...q,
          completed: state.completedQuests.includes(q.id),
          lastCompletedAt: savedTimestamps[q.id],
        }))
      );
    }
  }, []);

  // Save Gamification state whenever xp, streak, badges, quests, or questTimestamps change
  useEffect(() => {
    const unlockedIds = badges.filter((b) => b.unlocked).map((b) => b.id);
    const completedQuestIds = quests.filter((q) => q.completed).map((q) => q.id);
    saveGamificationState({
      xp,
      streak,
      badges: unlockedIds,
      completedQuests: completedQuestIds,
      questTimestamps,
    });
  }, [xp, streak, badges, quests, questTimestamps]);

  // 5-minute Cooldown Reset Ticker for Game Quests (Change GAME_RESET_INTERVAL_MS to 24 * 60 * 60 * 1000 for 24-hour daily reset)
  useEffect(() => {
    const interval = setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);

      setQuests((prevQuests) =>
        prevQuests.map((q) => {
          if (q.category === "game" && q.completed && q.lastCompletedAt) {
            const elapsed = currentTime - q.lastCompletedAt;
            if (elapsed >= GAME_RESET_INTERVAL_MS) {
              return { ...q, completed: false, lastCompletedAt: undefined };
            }
          }
          return q;
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Check freighter status & wallet connection on mount
  useEffect(() => {
    isFreighterInstalled().then((installed) => {
      setFreighterInstalled(installed);
      if (!installed) {
        setStatusMessage({
          type: "warning",
          text: "Freighter browser extension not detected. Please install Freighter to connect.",
          installLink: true,
        });
      }
    });

    checkWalletConnection().then((res) => {
      if (res.connected && res.publicKey) {
        setWalletAddress(res.publicKey);
      }
    });

    fetchVaultState();
  }, []);

  // Auto-dismiss status notification after 10 seconds
  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 10000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  // Fetch contract state from Soroban RPC
  const fetchVaultState = async () => {
    setLoading(true);
    try {
      const info = await getVaultInfo();
      setVaultInfo(info);
    } catch (err) {
      console.error("Failed to fetch vault state:", err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to add XP and check for level-ups & badges
  const addXp = (amount: number, reason: string) => {
    setXp((prevXp) => {
      const oldLevel = getLevelInfo(prevXp).level;
      const newXp = prevXp + amount;
      const newLevel = getLevelInfo(newXp).level;

      if (newLevel > oldLevel) {
        if (soundEnabled) playLevelUpSound();
        fireConfetti();
        setStatusMessage({
          type: "success",
          text: `🎉 LEVEL UP! You reached Level ${newLevel}: ${getLevelInfo(newXp).title}!`,
        });
      }

      // Check badge unlocks
      setBadges((prevBadges) =>
        prevBadges.map((badge) => {
          if (badge.id === "stellar_rocket" && newLevel >= 3 && !badge.unlocked) {
            return { ...badge, unlocked: true };
          }
          return badge;
        })
      );

      return newXp;
    });
  };

  const unlockBadge = (badgeId: string) => {
    setBadges((prev) =>
      prev.map((b) => {
        if (b.id === badgeId && !b.unlocked) {
          if (soundEnabled) playLevelUpSound();
          fireConfetti();
          return { ...b, unlocked: true };
        }
        return b;
      })
    );
  };

  const handleCompleteQuest = (questId: string) => {
    const targetQuest = quests.find((q) => q.id === questId);
    if (!targetQuest || targetQuest.completed) return;

    if (soundEnabled) playCoinSound();
    fireConfetti();

    const timestamp = Date.now();
    setQuestTimestamps((prev) => ({ ...prev, [questId]: timestamp }));

    setQuests((prev) =>
      prev.map((q) =>
        q.id === questId ? { ...q, completed: true, lastCompletedAt: timestamp } : q
      )
    );

    addXp(targetQuest.rewardXp, `Completed quest: ${targetQuest.title}`);
    setStatusMessage({
      type: "success",
      text: `🎯 Quest Completed: "${targetQuest.title}"! (+${targetQuest.rewardXp} XP)`,
    });
  };

  // Mini-Game 1: Stroop Catcher Timer & Movement Ticker
  useEffect(() => {
    let timer: NodeJS.Timeout;
    let targetTimer: NodeJS.Timeout;

    if (stroopActive && stroopTimeLeft > 0) {
      timer = setInterval(() => {
        setStroopTimeLeft((prev) => prev - 1);
      }, 1000);

      targetTimer = setInterval(() => {
        setStroopTarget(Math.floor(Math.random() * 9));
      }, 650);
    } else if (stroopActive && stroopTimeLeft === 0) {
      setStroopActive(false);
      const earnedXp = Math.min(150, stroopScore * 10);
      if (earnedXp > 0) {
        addXp(earnedXp, `Stroop Catcher Score: ${stroopScore}`);
        handleCompleteQuest("stroop_catcher_game");
        setStatusMessage({
          type: "success",
          text: `🪙 Time's up! You caught ${stroopScore} Stroops and earned +${earnedXp} XP!`,
        });
      }
      if (stroopScore > stroopHighScore) {
        setStroopHighScore(stroopScore);
      }
    }

    return () => {
      clearInterval(timer);
      clearInterval(targetTimer);
    };
  }, [stroopActive, stroopTimeLeft, stroopScore, stroopHighScore]);

  const startStroopGame = () => {
    setStroopScore(0);
    setStroopTimeLeft(15);
    setStroopTarget(Math.floor(Math.random() * 9));
    setStroopActive(true);
  };

  const handleStroopClick = (index: number) => {
    if (!stroopActive || index !== stroopTarget) return;
    if (soundEnabled) playCoinSound();
    setStroopScore((prev) => prev + 1);
    setStroopTarget(Math.floor(Math.random() * 9));
  };

  // Mini-Game 2: Vault Code Breaker Logic
  const startCodeBreaker = () => {
    const sequenceLength = 4;
    const newSeq: number[] = [];
    for (let i = 0; i < sequenceLength; i++) {
      newSeq.push(Math.floor(Math.random() * 4));
    }
    setCodeSequence(newSeq);
    setUserSequence([]);
    setCodePhase("showing");

    newSeq.forEach((keyIdx, i) => {
      setTimeout(() => {
        setHighlightKey(keyIdx);
        if (soundEnabled) playUnlockChime();
        setTimeout(() => setHighlightKey(null), 400);
      }, (i + 1) * 700);
    });

    setTimeout(() => {
      setCodePhase("playing");
    }, (newSeq.length + 1) * 700);
  };

  const handleCodeKeyPress = (keyIdx: number) => {
    if (codePhase !== "playing") return;
    if (soundEnabled) playUnlockChime();

    const nextUserSeq = [...userSequence, keyIdx];
    setUserSequence(nextUserSeq);

    const stepIdx = nextUserSeq.length - 1;
    if (nextUserSeq[stepIdx] !== codeSequence[stepIdx]) {
      setCodePhase("failed");
      return;
    }

    if (nextUserSeq.length === codeSequence.length) {
      setCodePhase("success");
      const xpEarned = 150;
      addXp(xpEarned, "Vault Code Breaker Victory");
      handleCompleteQuest("code_breaker_game");
      fireConfetti();
      if (soundEnabled) playLevelUpSound();
      setStatusMessage({
        type: "success",
        text: `🔐 Vault Code Cracked! Outstanding memory! Earned +${xpEarned} XP!`,
      });
    }
  };

  // 60s Lock / 20s Unlock Cycle Ticker (Only runs when wallet is connected)
  useEffect(() => {
    if (!walletAddress) {
      setPhase("LOCKED");
      setSecondsRemaining(LOCK_DURATION);
      return;
    }

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev > 1) {
          return prev - 1;
        }
        // Switch phase when timer reaches 0
        if (phase === "LOCKED") {
          setPhase("UNLOCKED");
          if (soundEnabled) playUnlockChime();
          fireConfetti();
          addXp(200, "Completed Lock Cycle");
          unlockBadge("iron_lock");

          setStreak((s) => {
            const next = s + 1;
            if (next >= 3) unlockBadge("streak_master");
            return next;
          });

          return UNLOCK_DURATION;
        } else {
          setPhase("LOCKED");
          return LOCK_DURATION;
        }
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, walletAddress, soundEnabled]);

  const handleConnectWallet = async () => {
    setStatusMessage(null);
    const res = await connectWallet();
    if (res.address) {
      setWalletAddress(res.address);
      addXp(50, "Connected Wallet");
      setStatusMessage({ type: "success", text: `Connected: ${res.address}` });
    } else {
      setStatusMessage({
        type: "error",
        text: res.error || "Could not connect Freighter Wallet. Make sure Freighter extension is installed and unlocked.",
        installLink: !freighterInstalled,
      });
    }
  };

  const handleLogout = () => {
    setWalletAddress(null);
    setPhase("LOCKED");
    setSecondsRemaining(LOCK_DURATION);
    setStatusMessage({
      type: "warning",
      text: "Logged out. Connect your Freighter wallet to re-enter the vault.",
    });
  };

  const handleDeposit = async () => {
    if (!walletAddress) {
      await handleConnectWallet();
      return;
    }
    const val = parseFloat(depositAmount);
    if (isNaN(val) || val <= 0) {
      setStatusMessage({ type: "error", text: "Please enter a valid deposit amount." });
      return;
    }

    setTxProcessing(true);
    setStatusMessage(null);

    const res = await depositXlm(walletAddress, val);
    setTxProcessing(false);

    if (res.success && res.txHash) {
      if (soundEnabled) playCoinSound();
      fireConfetti();

      const xpEarned = Math.floor(val * 100);
      addXp(xpEarned, `Deposited ${val} XLM`);
      unlockBadge("first_deposit");
      handleCompleteQuest("vault_deposit_quest");

      if ((vaultInfo?.balanceXlm || 0) + val >= 5.0) {
        unlockBadge("diamond_hands");
      }

      setStatusMessage({
        type: "success",
        text: `💰 Deposited ${val} XLM! (+${xpEarned} XP)`,
        hash: res.txHash,
      });
      fetchVaultState();
    } else {
      setStatusMessage({
        type: "error",
        text: res.error || "Deposit transaction failed.",
      });
    }
  };

  const handleWithdraw = async () => {
    if (!walletAddress) {
      await handleConnectWallet();
      return;
    }

    if (!isUnlocked) {
      setStatusMessage({
        type: "warning",
        text: "🔒 Vault is currently locked! Please wait for the 20-second unlock window to withdraw.",
      });
      return;
    }

    if (vaultInfo && vaultInfo.balanceXlm <= 0) {
      setStatusMessage({
        type: "warning",
        text: "⚠️ Vault balance is 0 XLM. Deposit XLM into the vault first before withdrawing!",
      });
      return;
    }

    setTxProcessing(true);
    setStatusMessage(null);

    const res = await withdrawXlm(walletAddress);
    setTxProcessing(false);

    if (res.success && res.txHash) {
      if (soundEnabled) playCoinSound();
      fireConfetti();
      addXp(150, "Vault Withdrawal");

      setStatusMessage({
        type: "success",
        text: "🎉 Vault funds successfully withdrawn on-chain!",
        hash: res.txHash,
      });
      setPhase("LOCKED");
      setSecondsRemaining(LOCK_DURATION);
      fetchVaultState();
    } else {
      let errMsg = res.error || "Withdrawal failed. Check lock status or authorization.";
      if (errMsg.includes("WasmVm") || errMsg.includes("UnreachableCodeReached") || errMsg.includes("HostError")) {
        errMsg = "On-chain error: Vault lock condition not met or contract balance is 0 XLM.";
      }
      setStatusMessage({
        type: "error",
        text: errMsg,
      });
    }
  };

  const formatAddress = (addr: string) =>
    addr ? `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}` : "";

  const isUnlocked = phase === "UNLOCKED";
  const levelInfo = getLevelInfo(xp);

  const xpProgressPercent = Math.min(
    100,
    Math.max(
      0,
      ((xp - levelInfo.minXp) / (levelInfo.nextLevelXp - levelInfo.minXp)) * 100
    )
  );

  return (
    <main className="app-container">
      <div className="bg-glow-blob-1"></div>
      <div className="bg-glow-blob-2"></div>

      {/* Navigation Header */}
      <nav className="navbar">
        <div className="brand-logo">
          <div className="brand-icon">
            <PiggyBank size={24} />
          </div>
          <span className="gradient-text">Soroban PiggyBank</span>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="btn-secondary"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Mute SFX" : "Enable SFX"}
          >
            {soundEnabled ? <Volume2 size={16} style={{ color: "#00f2fe" }} /> : <VolumeX size={16} />}
          </button>

          <button className="btn-secondary" onClick={fetchVaultState} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            Sync
          </button>

          {walletAddress && (
            <>
              <button className="btn-secondary" style={{ borderColor: "rgba(16, 185, 129, 0.4)" }}>
                <Wallet size={16} style={{ color: "#10b981" }} />
                {formatAddress(walletAddress)}
              </button>
              <button
                className="btn-secondary"
                onClick={handleLogout}
                style={{ borderColor: "rgba(244, 63, 94, 0.3)", color: "var(--accent-rose)" }}
              >
                <LogOut size={16} />
                Log Out
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Status Notifications */}
      {statusMessage && (
        <div className={`toast-alert ${statusMessage.type}`}>
          {statusMessage.type === "success" && <ShieldCheck size={20} />}
          {statusMessage.type === "error" && <ShieldAlert size={20} />}
          {statusMessage.type === "warning" && <AlertTriangle size={20} />}

          <div style={{ flex: 1 }}>
            <div>{statusMessage.text}</div>
            {statusMessage.installLink && (
              <a
                href="https://www.freighter.app/"
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "#00f2fe",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  marginTop: "6px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                Click here to Install Freighter Wallet Extension <ExternalLink size={14} />
              </a>
            )}
            {statusMessage.hash && (
              <a
                href={`${STELLAR_CONFIG.explorerBaseUrl}/tx/${statusMessage.hash}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "inherit",
                  textDecoration: "underline",
                  fontSize: "0.8rem",
                  marginTop: "4px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                View transaction on Stellar Expert <ExternalLink size={12} />
              </a>
            )}
          </div>

          <button
            onClick={() => setStatusMessage(null)}
            title="Dismiss"
            style={{
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              opacity: 0.7,
              padding: "4px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {!walletAddress ? (
        /* Landing Page Hero Screen (Disconnected State) */
        <div style={{ padding: "3rem 1rem", maxWidth: "1100px", margin: "0 auto", textAlign: "center" }}>
          {/* Main Headline */}
          <h1 style={{ fontSize: "3rem", fontWeight: 800, lineHeight: 1.15, marginBottom: "1.25rem", letterSpacing: "-1px" }}>
            The Gamified Web3 <br />
            <span className="gradient-text">Timelock Savings Vault</span>
          </h1>

          {/* Subtitle */}
          <p style={{ fontSize: "1.1rem", color: "var(--text-muted)", maxWidth: "650px", margin: "0 auto 2.5rem auto", lineHeight: 1.6 }}>
            Lock your XLM safely on-chain, complete daily Web3 quests, play interactive mini-games, earn XP, and level up as you build disciplined savings habits.
          </p>

          {/* CTA Box */}
          <div className="glass-card" style={{ maxWidth: "480px", margin: "0 auto 4rem auto", padding: "2rem" }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1rem" }}>
              Get Started with Soroban PiggyBank
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
              Connect your Freighter extension wallet to access your savings vault and start earning XP rewards.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <button
                className="btn-primary"
                onClick={handleConnectWallet}
                style={{ width: "100%", justifyContent: "center", padding: "0.9rem 1.5rem", fontSize: "1rem", fontWeight: 700 }}
              >
                <Wallet size={20} />
                Connect Freighter Wallet
                <ArrowRight size={18} />
              </button>
            </div>

            {!freighterInstalled && (
              <a
                href="https://www.freighter.app/"
                target="_blank"
                rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--accent-cyan)", fontSize: "0.8rem", marginTop: "1rem", textDecoration: "underline" }}
              >
                Need Freighter? Install Extension Here <ExternalLink size={12} />
              </a>
            )}
          </div>

          {/* Feature Showcase Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem", textAlign: "left" }}>
            <div className="glass-card" style={{ padding: "1.5rem" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "rgba(0, 242, 254, 0.15)", border: "1px solid rgba(0, 242, 254, 0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem" }}>
                <Shield size={24} style={{ color: "#00f2fe" }} />
              </div>
              <h4 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Timelock Vault</h4>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                Lock funds into Rust smart contracts. Funds can only be withdrawn during a the unlock window.
              </p>
            </div>

            <div className="glass-card" style={{ padding: "1.5rem" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "rgba(245, 158, 11, 0.15)", border: "1px solid rgba(245, 158, 11, 0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem" }}>
                <Gamepad2 size={24} style={{ color: "#f59e0b" }} />
              </div>
              <h4 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Play & Earn XP</h4>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                Play arcade mini-games like Stroop Catcher & Vault Code Breaker to earn bonus XP.
              </p>
            </div>

            <div className="glass-card" style={{ padding: "1.5rem" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem" }}>
                <Trophy size={24} style={{ color: "#10b981" }} />
              </div>
              <h4 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Level Tiers & Badges</h4>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                Rank up from Piggy Novice to Stellar Whale and unlock milestone badges as your savings grow.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Main Dashboard Screen (Proceeded after Wallet Connection) */
        <>
          {/* Gamification Header: Piggy Level & Streak Bar */}
          <div className="glass-card" style={{ marginBottom: "2rem", padding: "1.5rem 2rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div
                  style={{
                    fontSize: "2.5rem",
                    width: "60px",
                    height: "60px",
                    borderRadius: "18px",
                    background: "rgba(99, 102, 241, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                  }}
                >
                  {levelInfo.badgeEmoji}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.8rem", color: "#a5b4fc", fontWeight: 600, textTransform: "uppercase" }}>
                      Level {levelInfo.level}
                    </span>
                  </div>
                  <h3 style={{ fontSize: "1.35rem", fontWeight: 800 }}>{levelInfo.title}</h3>
                </div>
              </div>

              <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>Savings Streak</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#f59e0b", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Flame size={18} fill="#f59e0b" /> {streak} Cycles
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>Total Earned XP</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#00f2fe", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Zap size={18} fill="#00f2fe" /> {xp} XP
                  </div>
                </div>
              </div>
            </div>

            {/* Level XP Progress Bar */}
            <div style={{ marginTop: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                <span>Level {levelInfo.level} Progress</span>
                <span>{xp} / {levelInfo.nextLevelXp} XP</span>
              </div>
              <div style={{ width: "100%", height: "8px", background: "rgba(255, 255, 255, 0.08)", borderRadius: "4px", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${xpProgressPercent}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #6366f1 0%, #00f2fe 100%)",
                    borderRadius: "4px",
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Main Dashboard Cards */}
          <div className="dashboard-grid">
            {/* Left Column: Vault Balance & Status */}
            <div className="glass-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem", fontWeight: 500 }}>
                  Timelock Savings Vault
                </span>
                <span className={`status-badge ${isUnlocked ? "unlocked" : "locked"}`}>
                  <span className="pulse-dot"></span>
                  {isUnlocked ? `Unlocked (${secondsRemaining}s)` : `Locked (${secondsRemaining}s)`}
                </span>
              </div>

              <div className="balance-display">
                <div className="balance-amount">
                  {loading ? "..." : vaultInfo?.balanceXlm.toLocaleString() || "0"}
                  <span className="balance-unit">XLM</span>
                </div>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                  Total stroops: {vaultInfo?.balanceStroops || "0"}
                </p>
              </div>

              {/* Countdown Clock */}
              <div style={{ marginTop: "2rem" }}>
                <div className="countdown-box">
                  <div className="time-card">
                    <div className="time-num">0</div>
                    <div className="time-label">Days</div>
                  </div>
                  <div className="time-card">
                    <div className="time-num">00</div>
                    <div className="time-label">Hours</div>
                  </div>
                  <div className="time-card">
                    <div className="time-num">00</div>
                    <div className="time-label">Mins</div>
                  </div>
                  <div className="time-card" style={{ borderColor: isUnlocked ? "rgba(16, 185, 129, 0.5)" : "rgba(99, 102, 241, 0.3)" }}>
                    <div className="time-num" style={{ color: isUnlocked ? "var(--accent-emerald)" : "#00f2fe" }}>
                      {secondsRemaining.toString().padStart(2, "0")}
                    </div>
                    <div className="time-label">Secs</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Actions (Deposit / Withdraw) */}
            <div className="glass-card" id="deposit-section">
              <h3 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1.5rem" }}>
                Vault Actions
              </h3>

              {/* Deposit Form */}
              <div className="input-group">
                <label className="input-label">Deposit XLM into Vault (+100 XP/XLM)</label>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    className="input-field"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="1.0"
                  />
                  <button
                    className="btn-primary"
                    onClick={handleDeposit}
                    disabled={txProcessing}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    <Coins size={16} />
                    Deposit
                  </button>
                </div>
              </div>

              {/* Withdraw Form */}
              <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border-card)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <div>
                    <h4 style={{ fontSize: "1rem", fontWeight: 600 }}>Withdraw Funds</h4>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {isUnlocked
                        ? `🔓 Vault is unlocked for ${secondsRemaining}s! Click below to withdraw.`
                        : `🔒 Vault is locked. Will unlock in ${secondsRemaining} seconds for a 20-second window.`}
                    </p>
                  </div>
                </div>

                <button
                  className="btn-secondary"
                  onClick={handleWithdraw}
                  disabled={txProcessing || !isUnlocked || vaultInfo?.balanceXlm === 0}
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    background: isUnlocked ? "rgba(16, 185, 129, 0.2)" : "rgba(255,255,255,0.03)",
                    borderColor: isUnlocked ? "rgba(16, 185, 129, 0.6)" : "rgba(255,255,255,0.1)",
                    color: isUnlocked ? "var(--accent-emerald)" : "var(--text-muted)",
                    boxShadow: isUnlocked ? "0 0 20px rgba(16, 185, 129, 0.3)" : "none",
                    fontWeight: isUnlocked ? 700 : 500,
                  }}
                >
                  {isUnlocked ? <Unlock size={18} /> : <Lock size={18} />}
                  {isUnlocked
                    ? `Withdraw All Funds (${secondsRemaining}s left)`
                    : `Vault Locked (Wait ${secondsRemaining}s)`}
                </button>
              </div>
            </div>
          </div>

          {/* Earn XP Tasks & Quest Game Card */}
          <div className="glass-card" style={{ marginTop: "2rem" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h3 style={{ fontSize: "1.3rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Gamepad2 size={26} style={{ color: "#f59e0b" }} />
                  Earn XP Tasks & Playable Arcade Games
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "3px" }}>
                  Complete daily tasks, answer smart contract quizzes, and play arcade games to earn XP & level up!
                </p>
              </div>

              <div style={{ background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "14px", padding: "0.5rem 1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#fbbf24" }}>
                  Quests Completed: {quests.filter((q) => q.completed).length}/{quests.length}
                </span>
                <div style={{ width: "80px", height: "8px", background: "rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: `${(quests.filter((q) => q.completed).length / quests.length) * 100}%`, height: "100%", background: "#f59e0b", transition: "width 0.3s ease" }} />
                </div>
              </div>
            </div>

            {/* 1. Daily Quests Grid */}
            <h4 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "1rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Sparkles size={18} style={{ color: "#f59e0b" }} /> Daily Tasks & Quests
            </h4>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
              {quests.map((quest) => (
                <div
                  key={quest.id}
                  style={{
                    background: quest.completed ? "#f0fdf4" : "#f8fafc",
                    border: quest.completed ? "1px solid #bbf7d0" : "1px solid #e2e8f0",
                    borderRadius: "18px",
                    padding: "1.1rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "0.85rem",
                    transition: "all 0.3s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.85rem" }}>
                    <div style={{ fontSize: "2rem", flexShrink: 0, lineHeight: 1 }}>{quest.emoji}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: quest.completed ? "#15803d" : "var(--text-primary)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                        <span>{quest.title}</span>
                        <span style={{ fontSize: "0.75rem", background: "#e0e7ff", border: "1px solid #c7d2fe", color: "#4338ca", borderRadius: "12px", padding: "2px 8px", whiteSpace: "nowrap" }}>
                          +{quest.rewardXp} XP
                        </span>
                      </div>
                      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px", lineHeight: "1.3" }}>
                        {quest.description}
                      </p>
                    </div>
                  </div>

                  {/* Action / Status Button */}
                  {quest.completed ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "auto" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--accent-emerald)", fontSize: "0.85rem", fontWeight: 600 }}>
                        <CheckCircle2 size={16} /> Completed
                      </div>
                      {quest.category === "game" && quest.lastCompletedAt && (
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                          ⏳ Resets in {(() => {
                            const remSecs = Math.max(0, Math.ceil((GAME_RESET_INTERVAL_MS - (now - quest.lastCompletedAt)) / 1000));
                            const mins = Math.floor(remSecs / 60);
                            const secs = remSecs % 60;
                            return `${mins}m ${secs.toString().padStart(2, "0")}s`;
                          })()}
                        </span>
                      )}
                    </div>
                  ) : quest.category === "game" ? (
                    <button
                      className="btn-primary"
                      onClick={() => {
                        if (quest.id === "stroop_catcher_game") {
                          setActiveGameModal("stroop");
                        } else if (quest.id === "code_breaker_game") {
                          setActiveGameModal("code");
                        }
                      }}
                      style={{ width: "100%", justifyContent: "center", padding: "0.6rem 1rem", fontSize: "0.85rem", marginTop: "auto", background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}
                    >
                      <Gamepad2 size={15} /> {quest.actionText}
                    </button>
                  ) : quest.category === "quiz" ? (
                    <button
                      className="btn-primary"
                      onClick={() => { setActiveQuiz(quest); setSelectedOption(null); setQuizError(null); }}
                      style={{ width: "100%", justifyContent: "center", padding: "0.6rem 1rem", fontSize: "0.85rem", marginTop: "auto" }}
                    >
                      <HelpCircle size={15} /> {quest.actionText}
                    </button>
                  ) : quest.category === "social" ? (
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        window.open(`${STELLAR_CONFIG.explorerBaseUrl}/contract/${STELLAR_CONFIG.contractId}`, "_blank");
                        handleCompleteQuest(quest.id);
                      }}
                      style={{ width: "100%", justifyContent: "center", padding: "0.6rem 1rem", fontSize: "0.85rem", marginTop: "auto" }}
                    >
                      <ExternalLink size={15} /> {quest.actionText}
                    </button>
                  ) : quest.category === "daily" ? (
                    <button
                      className="btn-primary"
                      onClick={() => handleCompleteQuest(quest.id)}
                      style={{ width: "100%", justifyContent: "center", padding: "0.6rem 1rem", fontSize: "0.85rem", marginTop: "auto", background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", borderColor: "#f59e0b" }}
                    >
                      <Sparkles size={15} /> {quest.actionText}
                    </button>
                  ) : (
                    <a
                      href="#deposit-section"
                      className="btn-secondary"
                      style={{ width: "100%", justifyContent: "center", padding: "0.6rem 1rem", fontSize: "0.85rem", marginTop: "auto", textDecoration: "none" }}
                    >
                      <Coins size={15} /> {quest.actionText}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Split Section: Achievement Badges & Soroban Contract Metadata */}
          <div className="dashboard-grid" style={{ marginTop: "2rem", marginBottom: 0 }}>
            {/* Card 1: Achievement Badges Showcase */}
            <div className="glass-card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <h4 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Trophy size={20} style={{ color: "#00f2fe" }} />
                Achievement Badges
              </h4>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.75rem", flex: 1, alignContent: "start" }}>
                {badges.map((badge) => (
                  <div
                    key={badge.id}
                    style={{
                      background: badge.unlocked ? "#f0fdf4" : "#f8fafc",
                      border: badge.unlocked ? "1px solid #bbf7d0" : "1px solid #e2e8f0",
                      borderRadius: "16px",
                      padding: "0.85rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      opacity: badge.unlocked ? 1 : 0.55,
                      transition: "all 0.3s ease",
                    }}
                  >
                    <div style={{ fontSize: "1.75rem", flexShrink: 0 }}>{badge.emoji}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.85rem", color: badge.unlocked ? "#15803d" : "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{badge.title}</span>
                        {badge.unlocked && <CheckCircle2 size={13} style={{ color: "#10b981", flexShrink: 0 }} />}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "2px", lineHeight: "1.25" }}>
                        {badge.description}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 2: Soroban Contract Metadata (Hidable / Unhidable) */}
            <div className="glass-card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showMetadata ? "1.25rem" : "0.5rem" }}>
                <h4 style={{ fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem", margin: 0 }}>
                  <FileText size={20} style={{ color: "#818cf8" }} />
                  Soroban Contract Metadata
                </h4>
                <button
                  onClick={() => setShowMetadata(!showMetadata)}
                  style={{
                    background: showMetadata ? "rgba(255, 255, 255, 0.06)" : "rgba(99, 102, 241, 0.2)",
                    border: showMetadata ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid rgba(99, 102, 241, 0.4)",
                    borderRadius: "10px",
                    padding: "4px 10px",
                    color: showMetadata ? "var(--text-secondary)" : "#a5b4fc",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    transition: "all 0.2s ease",
                  }}
                >
                  {showMetadata ? <EyeOff size={14} /> : <Eye size={14} />}
                  <span>{showMetadata ? "Hide" : "Show"}</span>
                </button>
              </div>

              {showMetadata ? (
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
                  <div className="info-row" style={{ padding: "0.85rem 0" }}>
                    <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Contract Address</span>
                    <a
                      href={`${STELLAR_CONFIG.explorerBaseUrl}/contract/${STELLAR_CONFIG.contractId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mono-text"
                      title={STELLAR_CONFIG.contractId}
                      style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                    >
                      {formatAddress(STELLAR_CONFIG.contractId)} <ExternalLink size={12} style={{ flexShrink: 0 }} />
                    </a>
                  </div>

                  <div className="info-row" style={{ padding: "0.85rem 0" }}>
                    <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Vault Owner</span>
                    <span className="mono-text">{vaultInfo?.owner ? formatAddress(vaultInfo.owner) : "..."}</span>
                  </div>

                  <div className="info-row" style={{ padding: "0.85rem 0" }}>
                    <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Token Contract (SAC)</span>
                    <span className="mono-text">{vaultInfo?.token ? formatAddress(vaultInfo.token) : "..."}</span>
                  </div>

                  <div className="info-row" style={{ padding: "0.85rem 0" }}>
                    <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Network</span>
                    <span style={{ color: "var(--accent-indigo)", fontWeight: 600 }}>Stellar Testnet</span>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", flex: 1 }}>
                  <EyeOff size={16} />
                  <span>Contract metadata is hidden</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Soroban Quiz Modal Overlay */}
      {activeQuiz && activeQuiz.quizQuestion && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "1rem",
        }}>
          <div className="glass-card" style={{ maxWidth: "480px", width: "100%", border: "1px solid rgba(99, 102, 241, 0.4)", position: "relative" }}>
            <button
              onClick={() => setActiveQuiz(null)}
              style={{ position: "absolute", top: "1rem", right: "1rem", background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
            >
              <X size={20} />
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <span style={{ fontSize: "1.8rem" }}>🧠</span>
              <div>
                <h4 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>Soroban Smart Quiz</h4>
                <span style={{ fontSize: "0.75rem", color: "#fbbf24", fontWeight: 600 }}>Reward: +{activeQuiz.rewardXp} XP</span>
              </div>
            </div>

            <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "1.25rem", lineHeight: 1.4 }}>
              {activeQuiz.quizQuestion.question}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", marginBottom: "1.25rem" }}>
              {activeQuiz.quizQuestion.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => { setSelectedOption(idx); setQuizError(null); }}
                  style={{
                    padding: "0.85rem 1rem",
                    borderRadius: "14px",
                    textAlign: "left",
                    background: selectedOption === idx ? "#e0e7ff" : "#f8fafc",
                    border: selectedOption === idx ? "1px solid #6366f1" : "1px solid #e2e8f0",
                    color: selectedOption === idx ? "#4338ca" : "var(--text-secondary)",
                    fontWeight: selectedOption === idx ? 600 : 400,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{option}</span>
                  {selectedOption === idx && <Check size={16} style={{ color: "#818cf8" }} />}
                </button>
              ))}
            </div>

            {quizError && (
              <div style={{ color: "var(--accent-rose)", fontSize: "0.82rem", marginBottom: "1rem", textAlign: "center" }}>
                {quizError}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                className="btn-secondary"
                onClick={() => setActiveQuiz(null)}
                style={{ flex: 1, justifyContent: "center" }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  if (selectedOption === null) {
                    setQuizError("Please select an answer first!");
                    return;
                  }
                  if (selectedOption === activeQuiz.quizQuestion?.correctAnswer) {
                    handleCompleteQuest(activeQuiz.id);
                    setActiveQuiz(null);
                  } else {
                    setQuizError("❌ Incorrect answer! Hint: Soroban powers smart contracts natively on Stellar.");
                  }
                }}
                style={{ flex: 1, justifyContent: "center" }}
              >
                Submit Answer
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Stroop Catcher Floating Game Overlay Modal */}
      {activeGameModal === "stroop" && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.8)",
          backdropFilter: "blur(10px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "1rem",
        }}>
          <div className="glass-card" style={{ maxWidth: "460px", width: "100%", border: "1px solid rgba(0, 242, 254, 0.4)", position: "relative" }}>
            <button
              onClick={() => { setStroopActive(false); setActiveGameModal(null); }}
              style={{ position: "absolute", top: "1rem", right: "1rem", background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
            >
              <X size={20} />
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <span style={{ fontSize: "1.8rem" }}>🪙</span>
              <div>
                <h4 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>Stellar Stroop Catcher</h4>
                <span style={{ fontSize: "0.75rem", color: "#00f2fe", fontWeight: 600 }}>Arcade Speed Challenge (+100 XP)</span>
              </div>
            </div>

            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
              Catch as many glowing Stroop coins as you can in 15 seconds!
            </p>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", background: "#f8fafc", border: "1px solid #e2e8f0", padding: "0.5rem 1rem", borderRadius: "12px" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                ⏱️ Time: <span style={{ color: stroopActive ? "#d97706" : "var(--text-primary)", fontWeight: 700 }}>{stroopTimeLeft}s</span>
              </span>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                🪙 Score: <span style={{ color: "#0284c7", fontWeight: 700 }}>{stroopScore}</span> (High: {stroopHighScore})
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", height: "200px", marginBottom: "1.25rem" }}>
              {Array.from({ length: 9 }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => handleStroopClick(idx)}
                  disabled={!stroopActive}
                  style={{
                    background: stroopActive && stroopTarget === idx ? "radial-gradient(circle, rgba(2, 132, 199, 0.2) 0%, rgba(79, 70, 229, 0.15) 100%)" : "#f1f5f9",
                    border: stroopActive && stroopTarget === idx ? "2px solid #0284c7" : "1px solid #e2e8f0",
                    borderRadius: "14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "2rem",
                    cursor: stroopActive && stroopTarget === idx ? "pointer" : "default",
                    transition: "all 0.15s ease",
                    transform: stroopActive && stroopTarget === idx ? "scale(1.05)" : "scale(1)",
                    boxShadow: stroopActive && stroopTarget === idx ? "0 0 15px rgba(0, 242, 254, 0.5)" : "none",
                  }}
                >
                  {stroopActive && stroopTarget === idx ? "🪙" : ""}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                className="btn-secondary"
                onClick={() => { setStroopActive(false); setActiveGameModal(null); }}
                style={{ flex: 1, justifyContent: "center" }}
              >
                Close
              </button>
              <button
                className="btn-primary"
                onClick={startStroopGame}
                disabled={stroopActive}
                style={{ flex: 1, justifyContent: "center" }}
              >
                {stroopActive ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
                {stroopActive ? "Playing..." : "Start Game"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Code Breaker Floating Game Overlay Modal */}
      {activeGameModal === "code" && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.8)",
          backdropFilter: "blur(10px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "1rem",
        }}>
          <div className="glass-card" style={{ maxWidth: "460px", width: "100%", border: "1px solid rgba(129, 140, 248, 0.4)", position: "relative" }}>
            <button
              onClick={() => { setCodePhase("idle"); setActiveGameModal(null); }}
              style={{ position: "absolute", top: "1rem", right: "1rem", background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
            >
              <X size={20} />
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <span style={{ fontSize: "1.8rem" }}>🔐</span>
              <div>
                <h4 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>Vault Code Breaker</h4>
                <span style={{ fontSize: "0.75rem", color: "#818cf8", fontWeight: 600 }}>Memory Sequence Challenge (+150 XP)</span>
              </div>
            </div>

            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
              Watch the glowing security sequence and repeat the exact pattern to crack the vault!
            </p>

            <div style={{ padding: "0.5rem", background: "rgba(0,0,0,0.3)", borderRadius: "12px", marginBottom: "0.85rem", fontSize: "0.85rem", fontWeight: 600, textAlign: "center" }}>
              {codePhase === "idle" && <span style={{ color: "var(--text-muted)" }}>Press "Start Game" to memorize the code</span>}
              {codePhase === "showing" && <span style={{ color: "#f59e0b" }}>👀 Memorize the code sequence...</span>}
              {codePhase === "playing" && <span style={{ color: "#00f2fe" }}>🧩 Repeat the pattern! ({userSequence.length}/4)</span>}
              {codePhase === "success" && <span style={{ color: "var(--accent-emerald)" }}>🔓 ACCESS GRANTED! +150 XP</span>}
              {codePhase === "failed" && <span style={{ color: "var(--accent-rose)" }}>❌ ACCESS DENIED! Try again.</span>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", height: "200px", marginBottom: "1.25rem" }}>
              {[
                { id: 0, label: "Cyan", color: "#00f2fe", icon: "🔵" },
                { id: 1, label: "Indigo", color: "#818cf8", icon: "🟣" },
                { id: 2, label: "Emerald", color: "#10b981", icon: "🟢" },
                { id: 3, label: "Amber", color: "#f59e0b", icon: "🟡" },
              ].map((k) => (
                <button
                  key={k.id}
                  onClick={() => handleCodeKeyPress(k.id)}
                  disabled={codePhase !== "playing"}
                  style={{
                    background: highlightKey === k.id ? k.color : "#f8fafc",
                    border: highlightKey === k.id ? `2px solid ${k.color}` : "1px solid #e2e8f0",
                    borderRadius: "16px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "4px",
                    color: highlightKey === k.id ? "#fff" : "var(--text-primary)",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    cursor: codePhase === "playing" ? "pointer" : "default",
                    transition: "all 0.2s ease",
                    transform: highlightKey === k.id ? "scale(1.05)" : "scale(1)",
                    boxShadow: highlightKey === k.id ? `0 0 20px ${k.color}` : "none",
                    opacity: codePhase === "showing" && highlightKey !== k.id ? 0.4 : 1,
                  }}
                >
                  <span style={{ fontSize: "1.5rem" }}>{k.icon}</span>
                  <span>{k.label}</span>
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                className="btn-secondary"
                onClick={() => { setCodePhase("idle"); setActiveGameModal(null); }}
                style={{ flex: 1, justifyContent: "center" }}
              >
                Close
              </button>
              <button
                className="btn-primary"
                onClick={startCodeBreaker}
                disabled={codePhase === "showing"}
                style={{ flex: 1, justifyContent: "center" }}
              >
                <RotateCcw size={16} />
                {codePhase === "idle" ? "Start Game" : "New Round"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
