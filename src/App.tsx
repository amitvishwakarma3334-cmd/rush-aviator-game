/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2,
  LogOut,
  Plane,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import type { GameStateResponse, SystemStatusResponse, User } from './types';
import { AviatorCanvas } from './components/AviatorCanvas';
import { WalletView } from './components/WalletView';
import { AdminDashboard } from './components/AdminDashboard';
import { SetupGuideModal } from './components/SetupGuideModal';
import { soundFx } from './utils/sound';
import { apiFetch, setAuthToken } from './utils/api';

const INITIAL_GAME_STATE: GameStateResponse = {
  roundId: 'FLT-INIT',
  phase: 'BETTING',
  multiplier: 1.0,
  countdownMs: 5000,
  serverSeedHash: 'initializing_provably_fair_hash',
  crashPoint: null,
  serverSeed: null,
  activeBets: [],
  myBet: null,
  recentHistory: [],
  userBalance: null,
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'game' | 'wallet' | 'deposit' | 'withdraw' | 'admin'>('game');
  const [showSetupGuide, setShowSetupGuide] = useState<boolean>(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);

  // Visitor Login / Signup Form State
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState<boolean>(false);

  // Live Game State & Bet Controls
  const [gameState, setGameState] = useState<GameStateResponse>(INITIAL_GAME_STATE);
  const [betAmountInput, setBetAmountInput] = useState<string>('50');
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState<boolean>(false);
  const [autoCashoutInput, setAutoCashoutInput] = useState<string>('2.00');
  const [betError, setBetError] = useState<string | null>(null);
  const [betSuccess, setBetSuccess] = useState<string | null>(null);
  const [betActionPending, setBetActionPending] = useState<boolean>(false);

  // Check current session and system status on load
  useEffect(() => {
    async function bootstrap() {
      try {
        const [meRes, sysRes] = await Promise.all([
          apiFetch('/api/auth/me'),
          apiFetch('/api/system/status'),
        ]);
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData.user) {
            setUser(meData.user);
            if (meData.user.role === 'admin') {
              setActiveView('admin');
            }
          }
        }
        if (sysRes.ok) {
          const sysData = await sysRes.json();
          setSystemStatus(sysData);
        }
      } catch (err) {
        console.error('Bootstrap error:', err);
      } finally {
        setAuthChecked(true);
      }
    }
    bootstrap();
  }, []);

  // Poll server-authoritative game state every 120ms
  useEffect(() => {
    let active = true;
    const pollGame = async () => {
      try {
        const res = await apiFetch('/api/game/state');
        if (!res.ok || !active) return;
        const data: GameStateResponse = await res.json();
        setGameState(data);
        if (data.userBalance !== null && data.userBalance !== undefined) {
          setUser((prev) => (prev ? { ...prev, balance: data.userBalance! } : prev));
        }
      } catch {
        // Ignore transient network poll errors
      }
    };

    pollGame();
    const timer = setInterval(pollGame, 120);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // Clear transient bet feedback on new round
  useEffect(() => {
    if (gameState.phase === 'BETTING') {
      setBetError(null);
      setBetSuccess(null);
    }
  }, [gameState.roundId, gameState.phase]);

  const handleVisitorAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const cleanUsername = usernameInput.trim();
    if (cleanUsername.length < 3) {
      setAuthError('Username must be at least 3 characters long.');
      return;
    }
    if (passwordInput.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      return;
    }
    if (authMode === 'signup' && passwordInput !== confirmPasswordInput) {
      setAuthError('Password and Confirm Password do not match.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const payload =
        authMode === 'signup'
          ? {
              username: cleanUsername,
              password: passwordInput,
              confirmPassword: confirmPasswordInput,
            }
          : {
              username: cleanUsername,
              password: passwordInput,
            };

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed.');
      } else {
        if (data.token) {
          setAuthToken(data.token);
        }
        setUser(data.user);
        setUsernameInput('');
        setPasswordInput('');
        setConfirmPasswordInput('');
        setActiveView(data.user?.role === 'admin' ? 'admin' : 'game');
      }
    } catch {
      setAuthError('Network error while communicating with authentication server.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
    setActiveView('game');
  };

  const handlePlaceBet = async (e: React.FormEvent) => {
    e.preventDefault();
    setBetError(null);
    setBetSuccess(null);

    if (!user) {
      setBetError('Please log in or sign up to place a bet.');
      return;
    }

    const amountNum = Number(betAmountInput);
    if (!Number.isFinite(amountNum) || amountNum < 1) {
      setBetError('Minimum bet amount is ₹1.00.');
      return;
    }

    let autoVal: number | null = null;
    if (autoCashoutEnabled) {
      autoVal = Number(autoCashoutInput);
      if (!Number.isFinite(autoVal) || autoVal < 1.1) {
        setBetError('Auto cashout multiplier must be at least 1.10x.');
        return;
      }
    }

    setBetActionPending(true);
    try {
      const res = await apiFetch('/api/game/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, autoCashout: autoVal }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBetError(data.error || 'Could not place bet.');
      } else {
        soundFx.playBetPlaced();
        setUser((prev) => (prev ? { ...prev, balance: data.balance } : prev));
        setBetSuccess(`Bet of ₹${amountNum.toFixed(2)} placed for round ${gameState.roundId}`);
      }
    } catch {
      setBetError('Network error placing bet.');
    } finally {
      setBetActionPending(false);
    }
  };

  const handleCashout = async () => {
    setBetError(null);
    setBetActionPending(true);
    try {
      const res = await apiFetch('/api/game/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        setBetError(data.error || 'Cashout failed.');
      } else {
        soundFx.playCashoutSuccess();
        setUser((prev) => (prev ? { ...prev, balance: data.balance } : prev));
        setBetSuccess(
          `Cashed out ₹${data.payout.toFixed(2)} at ${data.cashoutMultiplier.toFixed(2)}x!`
        );
      }
    } catch {
      setBetError('Network error during cashout.');
    } finally {
      setBetActionPending(false);
    }
  };

  const handleBalanceSync = useCallback((newBal: number) => {
    setUser((prev) => (prev ? { ...prev, balance: newBal } : prev));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0E14] text-slate-100">
      {/* TOP BAR CONTRACT: Strictly 1 row, 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800/90 bg-[#0E121B]">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#arena"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('game');
          }}
          className="text-lg font-display font-extrabold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          AVIATOR
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <button
            type="button"
            onClick={() => setActiveView('game')}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'game' ? 'text-white underline font-semibold' : ''
            }`}
          >
            Game
          </button>
          <button
            type="button"
            onClick={() => setActiveView('wallet')}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'wallet' ? 'text-white underline font-semibold' : ''
            }`}
          >
            Wallet
          </button>
          <button
            type="button"
            onClick={() => setActiveView('deposit')}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'deposit' ? 'text-white underline font-semibold' : ''
            }`}
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={() => setActiveView('withdraw')}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'withdraw' ? 'text-white underline font-semibold' : ''
            }`}
          >
            Withdraw
          </button>
          <button
            type="button"
            onClick={() => setActiveView('admin')}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'admin' ? 'text-white underline font-semibold' : ''
            }`}
          >
            Admin
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action Button */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveView('game')}
              className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Login / Sign Up
            </button>
          )}
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="flex md:hidden items-center justify-around border-b border-slate-800 bg-[#111622] px-3 py-2 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveView('game')}
          className={`px-2.5 py-1 rounded whitespace-nowrap shrink-0 ${
            activeView === 'game' ? 'text-rose-400 underline' : 'text-slate-400'
          }`}
        >
          Game
        </button>
        <button
          type="button"
          onClick={() => setActiveView('wallet')}
          className={`px-2.5 py-1 rounded whitespace-nowrap shrink-0 ${
            activeView === 'wallet' ? 'text-rose-400 underline' : 'text-slate-400'
          }`}
        >
          Wallet
        </button>
        <button
          type="button"
          onClick={() => setActiveView('deposit')}
          className={`px-2.5 py-1 rounded whitespace-nowrap shrink-0 ${
            activeView === 'deposit' ? 'text-rose-400 underline' : 'text-slate-400'
          }`}
        >
          Deposit
        </button>
        <button
          type="button"
          onClick={() => setActiveView('withdraw')}
          className={`px-2.5 py-1 rounded whitespace-nowrap shrink-0 ${
            activeView === 'withdraw' ? 'text-rose-400 underline' : 'text-slate-400'
          }`}
        >
          Withdraw
        </button>
        <button
          type="button"
          onClick={() => setActiveView('admin')}
          className={`px-2.5 py-1 rounded whitespace-nowrap shrink-0 ${
            activeView === 'admin' ? 'text-rose-400 underline' : 'text-slate-400'
          }`}
        >
          Admin
        </button>
      </div>

      {/* Account & Balance Sub-Header Strip when Logged In */}
      {user && (
        <div className="bg-[#111622]/90 border-b border-slate-800/80 px-6 py-2.5">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <span>Account:</span>
              <strong className="text-white">@{user.username}</strong>
            </div>

            <div className="flex items-center gap-4 font-mono-tabular">
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <Wallet className="w-3.5 h-3.5" />
                <span>Balance: ₹{user.balance.toFixed(2)}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* MAIN WORKSPACE CONTENT */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {!authChecked ? (
          <div className="py-20 text-center text-sm text-slate-400">
            Loading application...
          </div>
        ) : activeView === 'admin' ? (
          <AdminDashboard
            currentUser={user}
            onAdminAuthenticated={(adminUser) => {
              setUser(adminUser);
              setActiveView('admin');
            }}
          />
        ) : activeView === 'wallet' || activeView === 'deposit' || activeView === 'withdraw' ? (
          /* WALLET / DEPOSIT / WITHDRAW VIEW (Accessible anytime) */
          <WalletView
            user={user}
            onBalanceChange={handleBalanceSync}
            onRequireLogin={() => setActiveView('game')}
            initialSubTab={
              activeView === 'deposit'
                ? 'deposit'
                : activeView === 'withdraw'
                ? 'withdraw'
                : 'overview'
            }
          />
        ) : !user ? (
          /* VISITOR LANDING: LOGIN / SIGN UP + LIVE FLIGHT ARENA */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Left Column: Login & Sign Up Card */}
            <div className="lg:col-span-5 bg-[#121723] border border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-2xl">
              <div className="space-y-5">
                <div>
                  <div className="text-xs font-semibold text-rose-400 tracking-wide">
                    ACCOUNT ACCESS
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-white mt-1 text-balance">
                    {authMode === 'login' ? 'Sign In to Your Account' : 'Create a New Account'}
                  </h1>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    {authMode === 'login'
                      ? 'Enter your username and password to access your wallet and join live rounds.'
                      : 'Register with a unique username and password to get started immediately.'}
                  </p>
                </div>

                {/* Login / Sign Up Mode Switcher */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0A0D14] border border-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError(null);
                    }}
                    className={`py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      authMode === 'login'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signup');
                      setAuthError(null);
                    }}
                    className={`py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      authMode === 'signup'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Sign Up
                  </button>
                </div>

                {/* Auth Form */}
                <form onSubmit={handleVisitorAuth} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Username
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={24}
                      autoComplete="username"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      placeholder="Enter your username"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white text-sm focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white text-sm focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  {authMode === 'signup' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Confirm Password
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={confirmPasswordInput}
                        onChange={(e) => setConfirmPasswordInput(e.target.value)}
                        placeholder="Confirm your password"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white text-sm focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  )}

                  {authError && (
                    <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-700/60 text-xs text-rose-300">
                      {authError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={authSubmitting}
                    className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>
                      {authSubmitting
                        ? 'Please wait...'
                        : authMode === 'login'
                        ? 'Login'
                        : 'Sign Up'}
                    </span>
                  </button>
                </form>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span>Encrypted session security</span>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => setActiveView('admin')}
                  className="text-slate-300 hover:text-white hover:underline font-medium cursor-pointer"
                >
                  Admin Login →
                </button>
              </div>
            </div>

            {/* Right Column: Live Flight Arena Preview */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
              <AviatorCanvas gameState={gameState} />

              <div className="bg-[#121723] border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-emerald-400">
                    REAL-TIME MULTIPLIER TELEMETRY
                  </div>
                  <h2 className="text-base font-display font-bold text-white">
                    Provably Fair SHA-256 Flight Rounds
                  </h2>
                  <p className="text-xs text-slate-400">
                    Sign in or create an account to place bets, configure auto-cashout multipliers, and manage your wallet.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSetupGuide(true)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  Project Documentation
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* AUTHENTICATED AVIATOR FLIGHT CRASH ARENA */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left / Center 8 Columns: Flight Canvas + Bet Control Deck */}
            <div className="lg:col-span-8 space-y-5">
              <AviatorCanvas gameState={gameState} />

              {/* Interactive Bet & Cashout Cockpit Panel */}
              <div className="bg-[#121723] border border-slate-800 rounded-2xl p-5 sm:p-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                  {/* Left: Bet Amount & Presets + Optional Auto-Cashout */}
                  <div className="md:col-span-7 space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">
                        Bet Amount (₹)
                      </label>
                      <span className="text-xs text-slate-400 font-mono-tabular">
                        Balance: ₹{user.balance.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        step="1"
                        disabled={Boolean(gameState.myBet)}
                        value={betAmountInput}
                        onChange={(e) => setBetAmountInput(e.target.value)}
                        className="w-32 px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white font-mono-tabular font-bold text-base focus:outline-none focus:border-rose-500 disabled:opacity-60"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {[10, 25, 50, 100, 250].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            disabled={Boolean(gameState.myBet)}
                            onClick={() => setBetAmountInput(String(preset))}
                            className={`px-2.5 py-2 rounded-lg text-xs font-mono-tabular font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                              Number(betAmountInput) === preset
                                ? 'bg-rose-600 text-white'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            ₹{preset}
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled={Boolean(gameState.myBet)}
                          onClick={() =>
                            setBetAmountInput(
                              String(Math.max(1, Math.min(10000, Math.floor(user.balance))))
                            )
                          }
                          className="px-2.5 py-2 rounded-lg text-xs font-mono-tabular font-semibold bg-slate-800 text-rose-400 hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          MAX
                        </button>
                      </div>
                    </div>

                    {/* Auto-Cashout Toggle & Multiplier Input */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          disabled={Boolean(gameState.myBet)}
                          checked={autoCashoutEnabled}
                          onChange={(e) => setAutoCashoutEnabled(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-rose-600 focus:ring-rose-500"
                        />
                        <span>Auto Cash Out</span>
                      </label>

                      {autoCashoutEnabled && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1.10"
                            max="200"
                            step="0.10"
                            disabled={Boolean(gameState.myBet)}
                            value={autoCashoutInput}
                            onChange={(e) => setAutoCashoutInput(e.target.value)}
                            className="w-24 px-2.5 py-1.5 rounded-lg bg-[#0A0D14] border border-slate-700 text-white font-mono-tabular text-xs focus:outline-none focus:border-rose-500"
                          />
                          <span className="text-xs font-mono-tabular text-slate-400">x</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Big Primary Action Button (Place Bet / Cash Out / Status) */}
                  <div className="md:col-span-5 flex flex-col justify-center">
                    {gameState.myBet && !gameState.myBet.cashedOut && gameState.phase === 'FLYING' ? (
                      <button
                        type="button"
                        disabled={betActionPending}
                        onClick={handleCashout}
                        className="w-full py-5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-extrabold text-lg tracking-tight shadow-lg transition-transform active:scale-[0.99] cursor-pointer flex flex-col items-center justify-center"
                      >
                        <span>CASH OUT</span>
                        <span className="text-sm font-mono-tabular font-bold mt-0.5">
                          ₹{(gameState.myBet.amount * gameState.multiplier).toFixed(2)} (
                          {gameState.multiplier.toFixed(2)}x)
                        </span>
                      </button>
                    ) : gameState.myBet && gameState.myBet.cashedOut ? (
                      <div className="w-full py-5 px-6 rounded-2xl bg-emerald-950/60 border border-emerald-700/60 text-emerald-300 flex flex-col items-center justify-center text-center">
                        <div className="flex items-center gap-1.5 text-sm font-bold">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>CASHED OUT AT {gameState.myBet.cashoutMultiplier?.toFixed(2)}x</span>
                        </div>
                        <div className="text-xs font-mono-tabular mt-1">
                          Won ₹{gameState.myBet.payout?.toFixed(2)}
                        </div>
                      </div>
                    ) : gameState.myBet && gameState.phase === 'BETTING' ? (
                      <div className="w-full py-5 px-6 rounded-2xl bg-emerald-950/50 border border-emerald-700/50 text-emerald-300 flex flex-col items-center justify-center text-center">
                        <span className="text-sm font-bold">BET CONFIRMED</span>
                        <span className="text-xs font-mono-tabular mt-1">
                          ₹{gameState.myBet.amount.toFixed(2)} locked for takeoff
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={gameState.phase !== 'BETTING' || betActionPending}
                        onClick={handlePlaceBet}
                        className={`w-full py-5 px-6 rounded-2xl font-display font-extrabold text-lg tracking-tight transition-all flex flex-col items-center justify-center ${
                          gameState.phase === 'BETTING'
                            ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg cursor-pointer'
                            : 'bg-slate-800/80 text-slate-400 cursor-not-allowed border border-slate-700'
                        }`}
                      >
                        <span>
                          {gameState.phase === 'BETTING' ? 'PLACE BET' : 'ROUND IN PROGRESS'}
                        </span>
                        <span className="text-xs font-mono-tabular font-normal mt-0.5 opacity-90">
                          {gameState.phase === 'BETTING'
                            ? `₹${Number(betAmountInput || 0).toFixed(2)}`
                            : 'Bets open during pre-flight countdown'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Feedback Messages */}
                {(betError || betSuccess) && (
                  <div
                    className={`mt-4 p-3 rounded-xl text-xs font-medium border ${
                      betError
                        ? 'bg-rose-950/60 border-rose-700/60 text-rose-300'
                        : 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                    }`}
                  >
                    {betError || betSuccess}
                  </div>
                )}
              </div>
            </div>

            {/* Right 4 Columns: Wallet Card & Active Round Bets */}
            <div className="lg:col-span-4 space-y-5">
              {/* Quick Wallet Summary Card */}
              <div className="bg-[#121723] border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400">Balance</div>
                    <div className="text-2xl font-display font-extrabold text-white font-mono-tabular mt-0.5">
                      ₹{user.balance.toFixed(2)}
                    </div>
                  </div>
                  <Plane className="w-6 h-6 text-rose-500" />
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveView('deposit')}
                    className="py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Deposit
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('withdraw')}
                    className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Withdraw
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('wallet')}
                    className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    History
                  </button>
                </div>
              </div>

              {/* Active Flight Bets Roster */}
              <div className="bg-[#121723] border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2 text-sm font-display font-bold text-white">
                    <Users className="w-4 h-4 text-rose-400" />
                    <span>Live Bets</span>
                  </div>
                  <span className="text-xs font-mono-tabular text-slate-400">
                    {gameState.activeBets.length} Active
                  </span>
                </div>

                {gameState.activeBets.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500">
                    No bets placed yet for round {gameState.roundId}.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    {gameState.activeBets.map((b, idx) => (
                      <div
                        key={`${b.username}-${idx}`}
                        className="p-3 rounded-xl bg-[#0A0D14] border border-slate-800/90 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-white">@{b.username}</div>
                          <div className="text-slate-400 font-mono-tabular">
                            ₹{b.amount.toFixed(2)}
                          </div>
                        </div>

                        <div className="text-right font-mono-tabular">
                          {b.cashedOut ? (
                            <div className="text-emerald-400 font-bold">
                              {b.cashoutMultiplier?.toFixed(2)}x (+₹{b.payout?.toFixed(2)})
                            </div>
                          ) : gameState.phase === 'CRASHED' ? (
                            <div className="text-rose-400 font-semibold">Flew Away</div>
                          ) : (
                            <div className="text-amber-300 flex items-center gap-1">
                              <TrendingUp className="w-3.5 h-3.5" />
                              <span>In Flight</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800/80 bg-[#0A0D14] px-6 py-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>Aviator Flight Multiplier Application · Full-Stack Engineering Project</div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowSetupGuide(true)}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Project Documentation
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => setActiveView('admin')}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Admin
            </button>
          </div>
        </div>
      </footer>

      {/* Project Documentation Modal */}
      <SetupGuideModal
        isOpen={showSetupGuide}
        onClose={() => setShowSetupGuide(false)}
        systemStatus={systemStatus}
      />
    </div>
  );
}
