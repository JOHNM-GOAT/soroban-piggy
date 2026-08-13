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
  UserCheck,
  X,
  Trophy,
  Flame,
  Zap,
  Volume2,
  VolumeX,
  Award,
  Sparkles,
  CheckCircle2,
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
  AchievementBadge,
} from "../lib/gamification";

// Alice Testnet Account
const ALICE_ADDRESS = "GAPWFBDWYICFBIUQRYLECMFWHZN4YLVXUKVNKCAU4X2TMZMBV4RKMESZ";

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

  // Gamification State
  const [xp, setXp] = useState<number>(150);
  const [streak, setStreak] = useState<number>(1);
  const [badges, setBadges] = useState<AchievementBadge[]>(INITIAL_BADGES);

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
  }, []);

  // Save Gamification state whenever xp, streak, or badges change
  useEffect(() => {
    const unlockedIds = badges.filter((b) => b.unlocked).map((b) => b.id);
    saveGamificationState({ xp, streak, badges: unlockedIds });
  }, [xp, streak, badges]);

  // Check freighter status & wallet connection on mount
  useEffect(() => {
    isFreighterInstalled().then((installed) => {
      setFreighterInstalled(installed);
      if (!installed) {
        setStatusMessage({
          type: "warning",
          text: "Freighter browser extension not detected. You can install Freighter or use Alice Test Account to test.",
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

  // 60s Lock / 20s Unlock Cycle Ticker
  useEffect(() => {
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
  }, [phase, soundEnabled]);

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

  const handleUseAliceAccount = () => {
    setWalletAddress(ALICE_ADDRESS);
    addXp(50, "Alice Mode");
    setStatusMessage({
      type: "success",
      text: "Connected with Alice Test Account (GAPW...MESZ)",
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
        text: "🎉 Vault funds successfully withdrawn!",
        hash: res.txHash,
      });
      setPhase("LOCKED");
      setSecondsRemaining(LOCK_DURATION);
      fetchVaultState();
    } else {
      setStatusMessage({
        type: "error",
        text: res.error || "Withdrawal failed. Check lock status or authorization.",
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

          {walletAddress ? (
            <button className="btn-secondary" style={{ borderColor: "rgba(16, 185, 129, 0.4)" }}>
              <Wallet size={16} style={{ color: "#10b981" }} />
              {formatAddress(walletAddress)}
            </button>
          ) : (
            <>
              <button className="btn-primary" onClick={handleConnectWallet}>
                <Wallet size={16} />
                Connect Freighter
              </button>
              <button className="btn-secondary" onClick={handleUseAliceAccount}>
                <UserCheck size={16} />
                Alice Mode
              </button>
            </>
          )}
        </div>
      </nav>

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
                <h3 style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                  Level {levelInfo.level}: {levelInfo.title}
                </h3>
                <span className="status-badge unlocked" style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}>
                  <Sparkles size={12} /> {xp} XP
                </span>
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                Next level at {levelInfo.nextLevelXp} XP ({Math.floor(levelInfo.nextLevelXp - xp)} XP remaining)
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <div style={{ background: "rgba(244, 63, 94, 0.15)", padding: "0.6rem 1.25rem", borderRadius: "16px", border: "1px solid rgba(244, 63, 94, 0.3)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Flame size={20} style={{ color: "#f43f5e" }} />
              <div>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f43f5e" }}>{streak} Cycles</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Streak 🔥</div>
              </div>
            </div>
          </div>
        </div>

        {/* XP Progress Bar */}
        <div style={{ width: "100%", height: "10px", background: "rgba(0, 0, 0, 0.4)", borderRadius: "10px", marginTop: "1.25rem", overflow: "hidden", border: "1px solid var(--border-card)" }}>
          <div
            style={{
              width: `${xpProgressPercent}%`,
              height: "100%",
              background: "linear-gradient(90deg, #6366f1 0%, #00f2fe 100%)",
              borderRadius: "10px",
              transition: "width 0.5s ease-in-out",
            }}
          ></div>
        </div>
      </div>

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
        <div className="glass-card">
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

      {/* Achievement Badges Showcase */}
      <div className="glass-card" style={{ marginTop: "2rem" }}>
        <h4 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Trophy size={20} style={{ color: "#00f2fe" }} />
          Achievement Badges
        </h4>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          {badges.map((badge) => (
            <div
              key={badge.id}
              style={{
                background: badge.unlocked ? "rgba(99, 102, 241, 0.12)" : "rgba(0, 0, 0, 0.3)",
                border: badge.unlocked ? "1px solid rgba(99, 102, 241, 0.4)" : "1px solid rgba(255, 255, 255, 0.05)",
                borderRadius: "18px",
                padding: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                opacity: badge.unlocked ? 1 : 0.45,
                transition: "all 0.3s ease",
              }}
            >
              <div style={{ fontSize: "1.8rem" }}>{badge.emoji}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.9rem", color: badge.unlocked ? "#fff" : "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                  {badge.title} {badge.unlocked && <CheckCircle2 size={14} style={{ color: "#10b981" }} />}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  {badge.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contract Specs Footer Card */}
      <div className="glass-card" style={{ marginTop: "2rem" }}>
        <h4 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          Soroban Contract Metadata
        </h4>

        <div className="info-row">
          <span style={{ color: "var(--text-secondary)" }}>Contract Address</span>
          <a
            href={`${STELLAR_CONFIG.explorerBaseUrl}/contract/${STELLAR_CONFIG.contractId}`}
            target="_blank"
            rel="noreferrer"
            className="mono-text"
            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            {STELLAR_CONFIG.contractId} <ExternalLink size={12} />
          </a>
        </div>

        <div className="info-row">
          <span style={{ color: "var(--text-secondary)" }}>Vault Owner</span>
          <span className="mono-text">{vaultInfo?.owner ? formatAddress(vaultInfo.owner) : "..."}</span>
        </div>

        <div className="info-row">
          <span style={{ color: "var(--text-secondary)" }}>Token Contract (SAC)</span>
          <span className="mono-text">{vaultInfo?.token ? formatAddress(vaultInfo.token) : "..."}</span>
        </div>

        <div className="info-row">
          <span style={{ color: "var(--text-secondary)" }}>Network</span>
          <span style={{ color: "var(--accent-indigo)", fontWeight: 600 }}>Stellar Testnet</span>
        </div>
      </div>
    </main>
  );
}
