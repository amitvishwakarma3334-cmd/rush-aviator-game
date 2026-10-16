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
import type { BettingSlotConfig, GameStateResponse, SystemStatusResponse, User } from './types';
import { AviatorCanvas } from './components/AviatorCanvas';
import { WalletView } from './components/WalletView';
import { AdminDashboard } from './components/AdminDashboard';
import { SetupGuideModal } from './components/SetupGuideModal';
import { AviatorSplashScreen } from './components/AviatorSplashScreen';
import { soundFx } from './utils/sound';
import { apiFetch, setAuthToken } from './utils/api';

// Doubled the number of betting slots compared to the original implementation (2 slots)
export const DYNAMIC_BETTING_SLOTS: BettingSlotConfig[] = [
  { id: 'slot-1', label: 'Bet Slot 1', badge: 'SLOT 1', defaultAmount: '50', defaultAutoCashout: '2.00' },
  { id: 'slot-2', label: 'Bet Slot 2', badge: 'SLOT 2', defaultAmount: '100', defaultAutoCashout: '3.00' },
];

export interface SlotControlState {
  amount: string;
  autoCashoutEnabled: boolean;
  autoCashout: string;
  isPending: boolean;
  error: string | null;
  success: string | null;
}

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
  myBets: [],
  recentHistory: [],
  userBalance: null,
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [splashFinished, setSplashFinished] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'game' | 'wallet' | 'deposit' | 'withdraw' | 'admin'>('game');
  const [showSetupGuide, setShowSetupGuide] = useState<boolean>(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);

  // Visitor Login / Signup Form State
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState<string>('');
  const [referralCodeInput, setReferralCodeInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState<boolean>(false);

  // Live Game State & Dynamic Slot Cockpit Controls State
  const [gameState, setGameState] = useState<GameStateResponse>(INITIAL_GAME_STATE);
  const [slotStates, setSlotStates] = useState<Record<string, SlotControlState>>(() => {
    const initial: Record<string, SlotControlState> = {};
    for (const slot of DYNAMIC_BETTING_SLOTS) {
      initial[slot.id] = {
        amount: slot.defaultAmount,
        autoCashoutEnabled: false,
        autoCashout: slot.defaultAutoCashout,
        isPending: false,
        error: null,
        success: null,
      };
    }
    return initial;
  });

  // Check current session, system status, and referral query param on load
  useEffect(() => {
    async function bootstrap() {
      try {
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const refParam = params.get('ref') || params.get('referral');
          if (refParam && refParam.trim().length >= 3) {
            setReferralCodeInput(refParam.trim().toUpperCase());
            setAuthMode('signup');
          }
        }

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
      setSlotStates((prev) => {
        const next = { ...prev };
        for (const slot of DYNAMIC_BETTING_SLOTS) {
          if (next[slot.id]) {
            next[slot.id] = { ...next[slot.id], error: null, success: null };
          }
        }
        return next;
      });
    }
  }, [gameState.roundId, gameState.phase]);

  const handleVisitorAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const rawUsername =
      (formData.get('username') as string) ||
      (form.elements.namedItem('username') as HTMLInputElement)?.value ||
      usernameInput;
    const rawPassword =
      (formData.get('password') as string) ||
      (form.elements.namedItem('password') as HTMLInputElement)?.value ||
      passwordInput;
    const rawConfirm =
      (formData.get('confirmPassword') as string) ||
      (form.elements.namedItem('confirmPassword') as HTMLInputElement)?.value ||
      confirmPasswordInput;
    const rawReferral =
      (formData.get('referralCode') as string) ||
      (form.elements.namedItem('referralCode') as HTMLInputElement)?.value ||
      referralCodeInput;

    const cleanUsername = String(rawUsername || '').trim();
    const finalPassword = String(rawPassword || '');
    const finalConfirm = String(rawConfirm || '');
    const cleanRefCode = String(rawReferral || '').trim().toUpperCase();

    if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 24) {
      setAuthError('Username must be between 3 and 24 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      setAuthError('Username may only contain letters, numbers, and underscores.');
      return;
    }
    if (!finalPassword || finalPassword.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      return;
    }
    if (authMode === 'signup' && finalPassword !== finalConfirm) {
      setAuthError('Password and Confirm Password do not match.');
      return;
    }

    setUsernameInput(cleanUsername);
    setPasswordInput(finalPassword);
    if (authMode === 'signup') {
      setConfirmPasswordInput(finalConfirm);
      setReferralCodeInput(cleanRefCode);
    }

    setAuthSubmitting(true);
    try {
      const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const payload =
        authMode === 'signup'
          ? {
              username: cleanUsername,
              password: finalPassword,
              confirmPassword: finalConfirm,
              referralCode: cleanRefCode || undefined,
            }
          : {
              username: cleanUsername,
              password: finalPassword,
            };

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Safely parse JSON or text response body without crashing on HTML error pages
      let data: any = null;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      } else {
        const text = await res.text().catch(() => '');
        try {
          data = JSON.parse(text);
        } catch {
          data = { error: text || null };
        }
      }

      if (!res.ok) {
        if (data && data.error && typeof data.error === 'string') {
          setAuthError(data.error);
        } else if (res.status === 401) {
          setAuthError('Invalid username or password. Please verify your credentials.');
        } else if (res.status === 403) {
          setAuthError('Your account has been suspended or access is forbidden. Contact administrator.');
        } else if (res.status === 404) {
          setAuthError('Authentication service endpoint not found (HTTP 404). Please ensure backend is deployed.');
        } else if (res.status === 409) {
          setAuthError('That username is already taken. Please choose another username.');
        } else if (res.status >= 500) {
          setAuthError(`Authentication server error (HTTP ${res.status}). The server or database encountered an issue. Please try again.`);
        } else {
          setAuthError(`Authentication failed (HTTP ${res.status}).`);
        }
      } else {
        if (!data || !data.user) {
          setAuthError('Authentication server returned an invalid response structure.');
          return;
        }
        if (data.token) {
          setAuthToken(data.token);
        }
        setUser(data.user);
        setUsernameInput('');
        setPasswordInput('');
        setConfirmPasswordInput('');
        setActiveView(data.user?.role === 'admin' ? 'admin' : 'game');
      }
    } catch (err: any) {
      console.error('Authentication communication error:', err);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setAuthError('You appear to be offline. Please check your internet connection.');
      } else if (err?.name === 'AbortError') {
        setAuthError('Authentication request timed out. Please try again.');
      } else {
        setAuthError('Unable to reach the authentication server over HTTPS. Please verify backend availability.');
      }
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

  const handlePlaceSlotBet = async (slotId: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!user) {
      setSlotStates((prev) => ({
        ...prev,
        [slotId]: { ...prev[slotId], error: 'Please log in or sign up to place a bet.', success: null },
      }));
      return;
    }

    const currentSlot = slotStates[slotId];
    if (!currentSlot) return;

    const amountNum = Number(currentSlot.amount);
    if (!Number.isFinite(amountNum) || amountNum < 1) {
      setSlotStates((prev) => ({
        ...prev,
        [slotId]: { ...prev[slotId], error: 'Minimum bet amount is ₹1.00.', success: null },
      }));
      return;
    }

    if (amountNum > 10000) {
      setSlotStates((prev) => ({
        ...prev,
        [slotId]: { ...prev[slotId], error: 'Maximum bet per slot is ₹10,000.00.', success: null },
      }));
      return;
    }

    if (amountNum > user.balance) {
      setSlotStates((prev) => ({
        ...prev,
        [slotId]: {
          ...prev[slotId],
          error: `Insufficient balance (Available: ₹${user.balance.toFixed(2)}).`,
          success: null,
        },
      }));
      return;
    }

    let autoVal: number | null = null;
    if (currentSlot.autoCashoutEnabled) {
      autoVal = Number(currentSlot.autoCashout);
      if (!Number.isFinite(autoVal) || autoVal < 1.1) {
        setSlotStates((prev) => ({
          ...prev,
          [slotId]: {
            ...prev[slotId],
            error: 'Auto cashout multiplier must be at least 1.10x.',
            success: null,
          },
        }));
        return;
      }
    }

    setSlotStates((prev) => ({
      ...prev,
      [slotId]: { ...prev[slotId], isPending: true, error: null, success: null },
    }));

    try {
      const endpoint = gameState.phase === 'BETTING' ? '/api/game/bet' : '/api/game/queue-bet';
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, autoCashout: autoVal, slotId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSlotStates((prev) => ({
          ...prev,
          [slotId]: { ...prev[slotId], error: data.error || 'Could not place bet.' },
        }));
      } else {
        soundFx.playBetPlaced();
        setUser((prev) => (prev ? { ...prev, balance: data.balance } : prev));
        if (data.queued && data.queuedBet) {
          setGameState((prev) => {
            const oldQueued = (prev.myQueuedBets || []).filter((q) => (q.slotId || 'slot-1') !== slotId);
            return {
              ...prev,
              myQueuedBets: [...oldQueued, data.queuedBet],
            };
          });
          setSlotStates((prev) => ({
            ...prev,
            [slotId]: {
              ...prev[slotId],
              error: null,
              success: `Next Round Bet: ₹${amountNum.toFixed(2)} confirmed on ${slotId.toUpperCase()}`,
            },
          }));
        } else {
          setSlotStates((prev) => ({
            ...prev,
            [slotId]: {
              ...prev[slotId],
              error: null,
              success: `Bet of ₹${amountNum.toFixed(2)} placed on ${slotId.toUpperCase()} for round ${gameState.roundId}`,
            },
          }));
        }
      }
    } catch {
      setSlotStates((prev) => ({
        ...prev,
        [slotId]: { ...prev[slotId], error: 'Network error placing bet.' },
      }));
    } finally {
      setSlotStates((prev) => ({
        ...prev,
        [slotId]: { ...prev[slotId], isPending: false },
      }));
    }
  };

  const handleCancelQueuedBet = async (slotId: string) => {
    setSlotStates((prev) => ({
      ...prev,
      [slotId]: { ...prev[slotId], isPending: true, error: null, success: null },
    }));
    try {
      const res = await apiFetch('/api/game/cancel-queued-bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSlotStates((prev) => ({
          ...prev,
          [slotId]: { ...prev[slotId], error: data.error || 'Could not cancel queued bet.' },
        }));
      } else {
        setUser((prev) => (prev ? { ...prev, balance: data.balance } : prev));
        setGameState((prev) => ({
          ...prev,
          myQueuedBets: (prev.myQueuedBets || []).filter((q) => (q.slotId || 'slot-1') !== slotId),
        }));
        setSlotStates((prev) => ({
          ...prev,
          [slotId]: {
            ...prev[slotId],
            error: null,
            success: `Queued bet on ${slotId.toUpperCase()} cancelled and refunded.`,
          },
        }));
      }
    } catch {
      setSlotStates((prev) => ({
        ...prev,
        [slotId]: { ...prev[slotId], error: 'Network error cancelling queued bet.' },
      }));
    } finally {
      setSlotStates((prev) => ({
        ...prev,
        [slotId]: { ...prev[slotId], isPending: false },
      }));
    }
  };

  const handleCashoutSlot = async (slotId: string) => {
    setSlotStates((prev) => ({
      ...prev,
      [slotId]: { ...prev[slotId], isPending: true, error: null, success: null },
    }));
    try {
      const res = await apiFetch('/api/game/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSlotStates((prev) => ({
          ...prev,
          [slotId]: { ...prev[slotId], error: data.error || 'Cashout failed.' },
        }));
      } else {
        soundFx.playCashoutSuccess();
        setUser((prev) => (prev ? { ...prev, balance: data.balance } : prev));
        setSlotStates((prev) => ({
          ...prev,
          [slotId]: {
            ...prev[slotId],
            error: null,
            success: `Cashed out ₹${data.payout.toFixed(2)} at ${data.cashoutMultiplier.toFixed(2)}x!`,
          },
        }));
      }
    } catch {
      setSlotStates((prev) => ({
        ...prev,
        [slotId]: { ...prev[slotId], error: 'Network error during cashout.' },
      }));
    } finally {
      setSlotStates((prev) => ({
        ...prev,
        [slotId]: { ...prev[slotId], isPending: false },
      }));
    }
  };

  const handleBalanceSync = useCallback((newBal: number) => {
    setUser((prev) => (prev ? { ...prev, balance: newBal } : prev));
  }, []);

  return (
    <>
      {!splashFinished && (
        <AviatorSplashScreen
          isReady={authChecked}
          onFinish={() => setSplashFinished(true)}
          minDisplayTimeMs={1500}
          customLogoUrl={systemStatus?.loadingLogoUrl || systemStatus?.logoUrl}
        />
      )}
      <div className="min-h-screen flex flex-col bg-[#0B0E14] text-slate-100">
        {/* TOP BAR CONTRACT: Strictly 1 row, 3 zones separated by gap-8 */}
        <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800/90 bg-[#0E121B]">
        {/* Zone 1: Brand Wordmark or Admin-Configured Logo */}
        <a
          href="#arena"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('game');
          }}
          className="flex items-center gap-2.5 text-lg font-display font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer"
        >
          {systemStatus?.logoUrl ? (
            <img
              src={systemStatus.logoUrl}
              alt="Game Logo"
              className="h-8 max-w-[140px] object-contain rounded"
            />
          ) : null}
          <span>AVIATOR</span>
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
            onConfigUpdated={(newCfg) => {
              setSystemStatus((prev) => ({
                ...(prev || {
                  storageMode: 'Local',
                  mongoConfigured: false,
                  welcomeBonus: 500,
                  totalUsers: 0,
                }),
                ...newCfg,
              }));
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
                    <label htmlFor="visitor-username" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Username
                    </label>
                    <input
                      id="visitor-username"
                      name="username"
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
                    <label htmlFor="visitor-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Password
                    </label>
                    <input
                      id="visitor-password"
                      name="password"
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
                    <>
                      <div>
                        <label htmlFor="visitor-confirm-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                          Confirm Password
                        </label>
                        <input
                          id="visitor-confirm-password"
                          name="confirmPassword"
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

                      <div>
                        <label htmlFor="visitor-referral-code" className="flex items-center justify-between text-xs font-medium text-slate-300 mb-1.5">
                          <span>Referral Code (Optional)</span>
                          {referralCodeInput && (
                            <span className="text-[10px] text-emerald-400 font-semibold font-mono-tabular">
                              Invite Applied
                            </span>
                          )}
                        </label>
                        <input
                          id="visitor-referral-code"
                          name="referralCode"
                          type="text"
                          maxLength={16}
                          value={referralCodeInput}
                          onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                          placeholder="e.g. AVI-XYZ123"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white text-sm font-mono-tabular uppercase focus:outline-none focus:border-rose-500 placeholder:normal-case placeholder:font-sans"
                        />
                      </div>
                    </>
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

              {/* Dynamic Betting Slots Cockpit: Side-by-Side on all screen sizes */}
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                {DYNAMIC_BETTING_SLOTS.map((slot) => {
                  const slotState = slotStates[slot.id] || {
                    amount: slot.defaultAmount,
                    autoCashoutEnabled: false,
                    autoCashout: slot.defaultAutoCashout,
                    isPending: false,
                    error: null,
                    success: null,
                  };

                  const allUserBets = gameState.myBets || (gameState.myBet ? [gameState.myBet] : []);
                  const slotBet = allUserBets.find((b) => (b.slotId || 'slot-1') === slot.id) || null;
                  const allQueuedBets = gameState.myQueuedBets || [];
                  const slotQueuedBet = allQueuedBets.find((q) => (q.slotId || 'slot-1') === slot.id && q.status === 'QUEUED') || null;

                  const isInputDisabled =
                    Boolean(slotBet && !slotBet.cashedOut && gameState.phase === 'FLYING') ||
                    Boolean(slotBet && gameState.phase === 'BETTING') ||
                    slotState.isPending;

                  return (
                    <div
                      key={slot.id}
                      className="bg-[#121723] border border-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-5 flex flex-col justify-between space-y-2 sm:space-y-4 min-w-0"
                    >
                      {/* Slot Header */}
                      <div className="flex items-center justify-between pb-2 sm:pb-3 border-b border-slate-800/80 gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="px-1.5 py-0.5 rounded text-[9px] sm:text-[11px] font-bold font-mono-tabular bg-slate-800 text-slate-200 border border-slate-700 shrink-0">
                            {slot.badge}
                          </span>
                          <span className="text-[10px] sm:text-xs font-bold text-white tracking-wide truncate">
                            {slot.label}
                          </span>
                        </div>

                        <div className="shrink-0 text-right">
                          {slotBet ? (
                            slotBet.cashedOut ? (
                              <span className="text-[9px] sm:text-[11px] font-bold text-emerald-400">
                                Cashed Out
                              </span>
                            ) : gameState.phase === 'FLYING' ? (
                              <span className="text-[9px] sm:text-[11px] font-bold text-amber-400 animate-pulse">
                                Flying
                              </span>
                            ) : (
                              <span className="text-[9px] sm:text-[11px] font-bold text-emerald-300">
                                Placed
                              </span>
                            )
                          ) : slotQueuedBet ? (
                            <span className="text-[9px] sm:text-[11px] font-bold text-amber-300 font-mono-tabular">
                              Next: ₹{slotQueuedBet.amount.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-[9px] sm:text-[11px] text-slate-400 font-mono-tabular truncate block">
                              ₹{user.balance.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Queued Next-Round Bet Telemetry Banner */}
                      {slotQueuedBet && (
                        <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                            <span className="text-[10px] sm:text-xs font-bold text-amber-300 truncate">
                              Next Round Bet: ₹{slotQueuedBet.amount.toFixed(2)}
                            </span>
                            {slotQueuedBet.autoCashout && (
                              <span className="text-[9px] sm:text-[10px] font-mono-tabular text-amber-400/80 shrink-0">
                                @{slotQueuedBet.autoCashout.toFixed(2)}x
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={slotState.isPending}
                            onClick={() => handleCancelQueuedBet(slot.id)}
                            className="px-2 py-0.5 rounded bg-rose-600/80 hover:bg-rose-600 text-white text-[9px] sm:text-[10px] font-semibold transition-colors cursor-pointer shrink-0"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {/* Controls: Amount Input + Presets */}
                      <div className="space-y-1.5 sm:space-y-3">
                        <div>
                          <div className="relative">
                            <input
                              type="number"
                              min="1"
                              max="10000"
                              step="1"
                              disabled={isInputDisabled}
                              value={slotState.amount}
                              onChange={(e) =>
                                setSlotStates((prev) => ({
                                  ...prev,
                                  [slot.id]: { ...prev[slot.id], amount: e.target.value, error: null },
                                }))
                              }
                              className="w-full px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl bg-[#0A0D14] border border-slate-700 text-white font-mono-tabular font-bold text-xs sm:text-sm focus:outline-none focus:border-rose-500 disabled:opacity-60"
                            />
                          </div>

                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {[10, 50, 100, 250].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                disabled={isInputDisabled}
                                onClick={() =>
                                  setSlotStates((prev) => ({
                                    ...prev,
                                    [slot.id]: {
                                      ...prev[slot.id],
                                      amount: String(preset),
                                      error: null,
                                    },
                                  }))
                                }
                                className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-[9px] sm:text-xs font-mono-tabular font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                                  Number(slotState.amount) === preset
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                }`}
                              >
                                ₹{preset}
                              </button>
                            ))}
                            <button
                              type="button"
                              disabled={isInputDisabled}
                              onClick={() =>
                                setSlotStates((prev) => ({
                                  ...prev,
                                  [slot.id]: {
                                    ...prev[slot.id],
                                    amount: String(Math.max(1, Math.min(10000, Math.floor(user.balance)))),
                                    error: null,
                                  },
                                }))
                              }
                              className="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded text-[9px] sm:text-xs font-mono-tabular font-semibold bg-slate-800 text-rose-400 hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              MAX
                            </button>
                          </div>
                        </div>

                        {/* Auto-Cashout Switch & Input */}
                        <div className="flex items-center justify-between pt-1.5 sm:pt-2 border-t border-slate-800/60 text-[10px] sm:text-xs gap-1">
                          <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none truncate">
                            <input
                              type="checkbox"
                              disabled={isInputDisabled}
                              checked={slotState.autoCashoutEnabled}
                              onChange={(e) =>
                                setSlotStates((prev) => ({
                                  ...prev,
                                  [slot.id]: {
                                    ...prev[slot.id],
                                    autoCashoutEnabled: e.target.checked,
                                  },
                                }))
                              }
                              className="rounded border-slate-700 bg-slate-900 text-rose-600 focus:ring-rose-500 w-3 h-3 sm:w-3.5 sm:h-3.5"
                            />
                            <span className="truncate">Auto Cash</span>
                          </label>

                          {slotState.autoCashoutEnabled && (
                            <div className="flex items-center gap-1 shrink-0">
                              <input
                                type="number"
                                min="1.10"
                                max="200"
                                step="0.10"
                                disabled={isInputDisabled}
                                value={slotState.autoCashout}
                                onChange={(e) =>
                                  setSlotStates((prev) => ({
                                    ...prev,
                                    [slot.id]: {
                                      ...prev[slot.id],
                                      autoCashout: e.target.value,
                                    },
                                  }))
                                }
                                className="w-14 sm:w-18 px-1.5 py-0.5 rounded bg-[#0A0D14] border border-slate-700 text-white font-mono-tabular text-[10px] sm:text-xs focus:outline-none focus:border-rose-500"
                              />
                              <span className="font-mono-tabular text-slate-400 text-[10px] sm:text-xs">x</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Primary Slot Action Button */}
                      <div>
                        {slotBet && !slotBet.cashedOut && gameState.phase === 'FLYING' ? (
                          <button
                            type="button"
                            disabled={slotState.isPending}
                            onClick={() => handleCashoutSlot(slot.id)}
                            className="w-full py-2.5 sm:py-3.5 px-2 sm:px-4 rounded-lg sm:rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-extrabold text-xs sm:text-sm tracking-tight shadow-lg transition-transform active:scale-[0.99] cursor-pointer flex flex-col items-center justify-center leading-tight"
                          >
                            <span>CASH OUT</span>
                            <span className="text-[10px] sm:text-xs font-mono-tabular font-bold mt-0.5">
                              ₹{(slotBet.amount * gameState.multiplier).toFixed(2)} ({gameState.multiplier.toFixed(2)}x)
                            </span>
                          </button>
                        ) : slotBet && slotBet.cashedOut ? (
                          <div className="space-y-2">
                            <div className="w-full py-2 sm:py-2.5 px-2 sm:px-4 rounded-lg sm:rounded-xl bg-emerald-950/60 border border-emerald-700/60 text-emerald-300 flex flex-col items-center justify-center text-center leading-tight">
                              <div className="flex items-center gap-1 text-[10px] sm:text-xs font-bold truncate">
                                <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                                <span className="truncate">AT {slotBet.cashoutMultiplier?.toFixed(2)}x</span>
                              </div>
                              <div className="text-[10px] sm:text-xs font-mono-tabular mt-0.5 font-semibold">
                                Won ₹{slotBet.payout?.toFixed(2)}
                              </div>
                            </div>
                            {!slotQueuedBet ? (
                              <button
                                type="button"
                                disabled={slotState.isPending}
                                onClick={() => handlePlaceSlotBet(slot.id)}
                                className="w-full py-2 sm:py-2.5 px-2 sm:px-4 rounded-lg sm:rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-display font-bold text-xs sm:text-sm tracking-tight shadow transition-transform active:scale-[0.99] cursor-pointer flex items-center justify-center gap-1"
                              >
                                <span>BET FOR NEXT ROUND (₹{Number(slotState.amount || 0).toFixed(2)})</span>
                              </button>
                            ) : null}
                          </div>
                        ) : slotBet && gameState.phase === 'BETTING' ? (
                          <div className="w-full py-2 sm:py-3 px-2 sm:px-4 rounded-lg sm:rounded-xl bg-emerald-950/50 border border-emerald-700/50 text-emerald-300 flex flex-col items-center justify-center text-center leading-tight">
                            <span className="text-[10px] sm:text-xs font-bold">BET CONFIRMED</span>
                            <span className="text-[10px] sm:text-xs font-mono-tabular mt-0.5">
                              ₹{slotBet.amount.toFixed(2)}
                            </span>
                          </div>
                        ) : gameState.phase === 'BETTING' ? (
                          <button
                            type="button"
                            disabled={slotState.isPending}
                            onClick={() => handlePlaceSlotBet(slot.id)}
                            className="w-full py-2.5 sm:py-3.5 px-2 sm:px-4 rounded-lg sm:rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-display font-extrabold text-xs sm:text-sm tracking-tight shadow-lg transition-transform active:scale-[0.99] cursor-pointer flex flex-col items-center justify-center leading-tight"
                          >
                            <span>PLACE BET</span>
                            <span className="text-[9px] sm:text-xs font-mono-tabular font-normal mt-0.5 opacity-90 truncate">
                              ₹{Number(slotState.amount || 0).toFixed(2)}
                            </span>
                          </button>
                        ) : slotQueuedBet ? (
                          <div className="flex items-center gap-1.5 w-full">
                            <button
                              type="button"
                              disabled={slotState.isPending}
                              onClick={() => handlePlaceSlotBet(slot.id)}
                              className="flex-1 py-2 sm:py-2.5 px-2 rounded-lg sm:rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-display font-bold text-[10px] sm:text-xs tracking-tight shadow transition-transform active:scale-[0.99] cursor-pointer flex flex-col items-center justify-center leading-tight"
                            >
                              <span>UPDATE NEXT BET</span>
                              <span className="font-mono-tabular text-[9px] sm:text-[10px] opacity-90">
                                Set to ₹{Number(slotState.amount || 0).toFixed(2)}
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={slotState.isPending}
                              onClick={() => handleCancelQueuedBet(slot.id)}
                              className="py-2 sm:py-2.5 px-3 rounded-lg sm:rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs sm:text-sm transition-colors cursor-pointer shrink-0"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={slotState.isPending}
                            onClick={() => handlePlaceSlotBet(slot.id)}
                            className="w-full py-2.5 sm:py-3.5 px-2 sm:px-4 rounded-lg sm:rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-display font-extrabold text-xs sm:text-sm tracking-tight shadow-lg transition-transform active:scale-[0.99] cursor-pointer flex flex-col items-center justify-center leading-tight"
                          >
                            <span>BET FOR NEXT ROUND</span>
                            <span className="text-[9px] sm:text-xs font-mono-tabular font-normal mt-0.5 opacity-90 truncate">
                              Next Round Bet: ₹{Number(slotState.amount || 0).toFixed(2)}
                            </span>
                          </button>
                        )}
                      </div>

                      {/* Per-Slot Feedback Messages */}
                      {(slotState.error || slotState.success) && (
                        <div
                          className={`p-1.5 sm:p-2 rounded-lg text-[9px] sm:text-[11px] font-medium border truncate ${
                            slotState.error
                              ? 'bg-rose-950/60 border-rose-700/60 text-rose-300'
                              : 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                          }`}
                        >
                          {slotState.error || slotState.success}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                          <div className="font-semibold text-white flex items-center gap-1.5">
                            <span>@{b.username}</span>
                            {b.slotId && (
                              <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-slate-850 border border-slate-700 text-slate-300">
                                {b.slotId.toUpperCase()}
                              </span>
                            )}
                          </div>
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
    </>
  );
}
