import React, { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2,
  DollarSign,
  Flame,
  Image,
  Lock,
  Plane,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  UserCheck,
  UserX,
  XCircle,
} from 'lucide-react';
import type {
  AppConfigRecord,
  AuditLogRecord,
  CrashRoundHistoryItem,
  TransactionRecord,
  TransferRequestRecord,
  User,
} from '../types';
import { UPLOADED_QR_DATA_URI, optimizeUploadedQrImage } from '../utils/qrImage';
import { apiFetch, setAuthToken } from '../utils/api';

interface AdminDashboardProps {
  currentUser: User | null;
  onAdminAuthenticated: (user: User) => void;
  onConfigUpdated?: (config: AppConfigRecord) => void;
}

interface AdminMetrics {
  totalRegisteredUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
}

interface AdminGameEngineStatus {
  roundId: string;
  phase: 'BETTING' | 'FLYING' | 'CRASHED';
  statusLabel?: 'Waiting' | 'Flying' | 'Crashed';
  multiplier: number;
  crashPoint?: number;
  countdownMs: number;
  activeBetsCount: number;
  totalBetPool: number;
  serverSeedHash: string;
  serverSeed?: string;
  nextRound?: {
    roundId: string;
    crashPoint: number;
    serverSeedHash: string;
  };
  config: {
    houseEdgePercent: number;
    maxMultiplier: number;
    bettingDurationMs: number;
    crashedHoldMs: number;
  };
  recentHistory: CrashRoundHistoryItem[];
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  onAdminAuthenticated,
  onConfigUpdated,
}) => {
  // Admin Login Form State
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);

  // Dashboard Data State
  const [activeTab, setActiveTab] = useState<'users' | 'requests' | 'gameEngine' | 'config' | 'logs'>('users');
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [metrics, setMetrics] = useState<AdminMetrics>({
    totalRegisteredUsers: 0,
    activeUsers: 0,
    suspendedUsers: 0,
    pendingDeposits: 0,
    pendingWithdrawals: 0,
  });
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<TransferRequestRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [config, setConfig] = useState<AppConfigRecord>({
    welcomeBonus: 500,
    placeholderQrUrl: UPLOADED_QR_DATA_URI,
    logoUrl: '',
    depositBonusEnabled: true,
    depositBonusPercent: 9,
    minWithdrawalAmount: 500,
    houseEdgePercent: 3,
    maxMultiplier: 250,
    bettingDurationMs: 5000,
    crashedHoldMs: 3500,
  });

  // Live Game Engine Status
  const [gameEngineStatus, setGameEngineStatus] = useState<AdminGameEngineStatus | null>(null);

  // Inline & Modal Balance Adjustment State
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [adjustingUser, setAdjustingUser] = useState<User | null>(null);
  const [adjustOp, setAdjustOp] = useState<'ADD' | 'SUBTRACT'>('ADD');
  const [adjustAmount, setAdjustAmount] = useState<string>('100');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [adjustFeedback, setAdjustFeedback] = useState<string | null>(null);
  const [adjustLoading, setAdjustLoading] = useState<boolean>(false);

  // Request Review State
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [processingReqId, setProcessingReqId] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Config & Fair Engine Form State
  const [bonusInput, setBonusInput] = useState<string>('500');
  const [qrUrlInput, setQrUrlInput] = useState<string>('');
  const [logoUrlInput, setLogoUrlInput] = useState<string>('');
  const [loadingLogoUrlInput, setLoadingLogoUrlInput] = useState<string>('');
  const [depositBonusEnabled, setDepositBonusEnabled] = useState<boolean>(true);
  const [depositBonusPercentInput, setDepositBonusPercentInput] = useState<string>('9');
  const [minWithdrawalInput, setMinWithdrawalInput] = useState<string>('500');
  const [referralBonusInput, setReferralBonusInput] = useState<string>('50');
  const [configSaving, setConfigSaving] = useState<boolean>(false);

  const isAdmin = currentUser?.role === 'admin';

  const fetchAdminOverview = useCallback(async (search = '') => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/overview?search=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (!res.ok) {
        setActionBanner({
          type: 'error',
          text: data.error || 'Could not load administrator data. Please sign in again.',
        });
        return;
      }
      setMetrics(data.metrics);
      const loadedUsers: User[] = data.users || [];
      setUsers(loadedUsers);
      setSelectedUserId((prev) =>
        prev && loadedUsers.some((u) => u.id === prev) ? prev : loadedUsers[0]?.id || ''
      );
      setRequests(data.requests || []);
      setTransactions(data.transactions || []);
      setAuditLogs(data.auditLogs || []);
      if (data.config) {
        setConfig(data.config);
        setBonusInput(String(data.config.welcomeBonus));
        setQrUrlInput(data.config.placeholderQrUrl || UPLOADED_QR_DATA_URI);
        setLogoUrlInput(data.config.logoUrl || '');
        setLoadingLogoUrlInput(data.config.loadingLogoUrl || '');
        setDepositBonusEnabled(data.config.depositBonusEnabled !== false);
        setDepositBonusPercentInput(String(data.config.depositBonusPercent ?? 9));
        setMinWithdrawalInput(String(data.config.minWithdrawalAmount ?? 500));
        setReferralBonusInput(String(data.config.referralBonus ?? 50));
      }
    } catch (err) {
      console.error('Failed to load admin overview:', err);
      setActionBanner({
        type: 'error',
        text: 'Network error while fetching administrator data.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchAdminOverview(searchQuery);
    }
  }, [isAdmin, fetchAdminOverview, searchQuery]);

  // Real-time polling of fair game telemetry when on the gameEngine tab
  useEffect(() => {
    if (!isAdmin || activeTab !== 'gameEngine') return;
    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const res = await apiFetch('/api/admin/game-status');
        if (res.ok && isMounted) {
          const data = await res.json();
          setGameEngineStatus(data);
        }
      } catch {
        // ignore transient poll error
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 250);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAdmin, activeTab]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await apiFetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });

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
          setLoginError(data.error);
        } else if (res.status === 401) {
          setLoginError('Invalid administrator credentials.');
        } else if (res.status >= 500) {
          setLoginError(`Administrator authentication server error (HTTP ${res.status}).`);
        } else {
          setLoginError(`Administrator sign-in failed (HTTP ${res.status}).`);
        }
      } else {
        if (data && data.token) {
          setAuthToken(data.token);
        }
        onAdminAuthenticated(data?.user);
      }
    } catch (err: any) {
      console.error('Admin login error:', err);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setLoginError('You are currently offline. Please check your internet connection.');
      } else {
        setLoginError('Unable to reach the administrator authentication server over HTTPS.');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleReviewRequest = async (requestId: string, decision: 'APPROVED' | 'REJECTED') => {
    setProcessingReqId(requestId);
    setActionBanner(null);
    try {
      const res = await apiFetch(`/api/admin/requests/${requestId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          adminNote: reviewNotes[requestId] || `${decision} by administrator`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionBanner({ type: 'error', text: data.error || 'Could not process request.' });
      } else {
        setActionBanner({
          type: 'success',
          text: `Request ${requestId} marked as ${decision}. Updated user balance: ₹${data.updatedBalance.toFixed(2)}.`,
        });
        await fetchAdminOverview(searchQuery);
      }
    } catch {
      setActionBanner({ type: 'error', text: 'Network error while reviewing request.' });
    } finally {
      setProcessingReqId(null);
    }
  };

  const submitBalanceAdjustmentForUser = async (targetId: string, e: React.FormEvent) => {
    e.preventDefault();
    setAdjustFeedback(null);
    setActionBanner(null);

    if (!targetId) {
      setAdjustFeedback('Please select a user account first.');
      return;
    }

    const numAmount = Number(adjustAmount);
    if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > 1000000) {
      setAdjustFeedback('Please enter a valid amount between ₹0.01 and ₹1,000,000.');
      return;
    }

    if (!adjustReason.trim() || adjustReason.trim().length < 3) {
      setAdjustFeedback('Please enter a clear reason (at least 3 characters) for the audit log.');
      return;
    }

    setAdjustLoading(true);
    try {
      const res = await apiFetch(`/api/admin/users/${targetId}/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: adjustOp,
          amount: numAmount,
          reason: adjustReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAdjustFeedback(data.error || 'Failed to adjust user balance.');
        setActionBanner({
          type: 'error',
          text: data.error || 'Failed to adjust user balance.',
        });
      } else {
        setActionBanner({
          type: 'success',
          text: `Successfully ${adjustOp === 'ADD' ? 'added' : 'subtracted'} ₹${numAmount.toFixed(
            2
          )} for @${data.user.username} (Account ID: ${data.user.id}). New Balance: ₹${data.user.balance.toFixed(2)}.`,
        });
        setAdjustingUser(null);
        setAdjustReason('');
        await fetchAdminOverview(searchQuery);
      }
    } catch {
      setAdjustFeedback('Network error during balance adjustment.');
    } finally {
      setAdjustLoading(false);
    }
  };

  const handleToggleUserStatus = async (u: User) => {
    const nextStatus = u.status === 'active' ? 'suspended' : 'active';
    setActionBanner(null);
    try {
      const res = await apiFetch(`/api/admin/users/${u.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          reason: `Account ${nextStatus} via Admin Panel`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionBanner({ type: 'error', text: data.error || 'Could not update user status.' });
      } else {
        setActionBanner({
          type: 'success',
          text: `Account @${u.username} (${u.id}) is now ${nextStatus.toUpperCase()}.`,
        });
        await fetchAdminOverview(searchQuery);
      }
    } catch {
      setActionBanner({ type: 'error', text: 'Network error updating user status.' });
    }
  };

  const handleSaveConfig = async (
    options?: { resetDefaultQr?: boolean; resetDefaultLogo?: boolean; resetDefaultLoadingLogo?: boolean } | boolean
  ) => {
    const opts = typeof options === 'boolean' ? { resetDefaultQr: options } : options || {};
    setConfigSaving(true);
    setActionBanner(null);
    try {
      const res = await apiFetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          welcomeBonus: Number(bonusInput),
          placeholderQrUrl: qrUrlInput,
          resetDefaultQr: opts.resetDefaultQr,
          logoUrl: logoUrlInput,
          resetDefaultLogo: opts.resetDefaultLogo,
          loadingLogoUrl: loadingLogoUrlInput,
          resetDefaultLoadingLogo: opts.resetDefaultLoadingLogo,
          depositBonusEnabled,
          depositBonusPercent: Number(depositBonusPercentInput),
          minWithdrawalAmount: Number(minWithdrawalInput),
          referralBonus: Number(referralBonusInput),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionBanner({ type: 'error', text: data.error || 'Failed to update configuration.' });
      } else {
        setConfig(data.config);
        onConfigUpdated?.(data.config);
        setBonusInput(String(data.config.welcomeBonus));
        setQrUrlInput(data.config.placeholderQrUrl);
        setLogoUrlInput(data.config.logoUrl || '');
        setLoadingLogoUrlInput(data.config.loadingLogoUrl || '');
        setDepositBonusEnabled(data.config.depositBonusEnabled !== false);
        setDepositBonusPercentInput(String(data.config.depositBonusPercent ?? 9));
        setMinWithdrawalInput(String(data.config.minWithdrawalAmount ?? 500));
        setReferralBonusInput(String(data.config.referralBonus ?? 50));
        setActionBanner({
          type: 'success',
          text: opts.resetDefaultQr
            ? 'Deposit QR code restored to default image.'
            : opts.resetDefaultLogo
            ? 'Game logo restored to default branding.'
            : opts.resetDefaultLoadingLogo
            ? 'Loading screen logo restored to default branding.'
            : 'Administrator settings saved permanently to database.',
        });
        await fetchAdminOverview(searchQuery);
      }
    } catch {
      setActionBanner({ type: 'error', text: 'Network error while saving settings.' });
    } finally {
      setConfigSaving(false);
    }
  };

  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setActionBanner({
        type: 'error',
        text: 'Please select a logo image file smaller than 10 MB.',
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUri = reader.result as string;
      setLogoUrlInput(dataUri);
      try {
        const res = await apiFetch('/api/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logoUrl: dataUri }),
        });
        const data = await res.json();
        if (res.ok && data.config) {
          setConfig(data.config);
          onConfigUpdated?.(data.config);
          setActionBanner({
            type: 'success',
            text: 'New Game Logo uploaded and saved permanently in the database.',
          });
        }
      } catch {
        setActionBanner({
          type: 'error',
          text: 'Failed to upload logo image file.',
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLoadingLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setActionBanner({
        type: 'error',
        text: 'Please select an image file smaller than 10 MB.',
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUri = reader.result as string;
      setLoadingLogoUrlInput(dataUri);
      try {
        const res = await apiFetch('/api/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loadingLogoUrl: dataUri }),
        });
        const data = await res.json();
        if (res.ok && data.config) {
          setConfig(data.config);
          onConfigUpdated?.(data.config);
          setActionBanner({
            type: 'success',
            text: 'New Loading Screen Logo uploaded and saved permanently in the database.',
          });
        }
      } catch {
        setActionBanner({
          type: 'error',
          text: 'Failed to upload loading logo image file.',
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleQrFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setActionBanner({
        type: 'error',
        text: 'Please choose an image file smaller than 25 MB.',
      });
      return;
    }
    try {
      const optimizedDataUri = await optimizeUploadedQrImage(file);
      setQrUrlInput(optimizedDataUri);
      // Automatically persist to server so admin does not even have to click a second button
      const res = await apiFetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          welcomeBonus: Number(bonusInput),
          placeholderQrUrl: optimizedDataUri,
        }),
      });
      const data = await res.json();
      if (res.ok && data.config) {
        setConfig(data.config);
        onConfigUpdated?.(data.config);
        setActionBanner({
          type: 'success',
          text: 'New Deposit QR Code uploaded and saved permanently in the database.',
        });
      }
    } catch {
      setActionBanner({
        type: 'error',
        text: 'Failed to process the selected image file.',
      });
    }
  };

  const [crashingFlight, setCrashingFlight] = useState<boolean>(false);
  const handleEndFlight = async () => {
    setCrashingFlight(true);
    setActionBanner(null);
    try {
      const res = await apiFetch('/api/admin/flight/crash', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setActionBanner({
          type: 'error',
          text: data.error || 'Failed to end flight.',
        });
      } else {
        setActionBanner({
          type: 'success',
          text: `Flight ended manually at ${Number(data.crashedAtMultiplier).toFixed(2)}x for round ${data.roundId}. Synchronized across all players.`,
        });
        const statusRes = await apiFetch('/api/admin/game-status');
        if (statusRes.ok) {
          const sData = await statusRes.json();
          setGameEngineStatus(sData);
        }
        await fetchAdminOverview(searchQuery);
      }
    } catch {
      setActionBanner({ type: 'error', text: 'Network error ending flight.' });
    } finally {
      setCrashingFlight(false);
    }
  };

  // --------------------------------------------------------------------------
  // RENDER SEPARATE ADMIN LOGIN VIEW IF NOT AUTHENTICATED AS ADMIN
  // --------------------------------------------------------------------------
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto my-8 bg-[#121723] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-2.5 text-rose-400 text-xs font-semibold mb-2">
          <Lock className="w-4 h-4" />
          <span>ADMINISTRATOR ACCESS</span>
        </div>
        <h1 className="text-2xl font-display font-bold text-white">
          Administrator Sign In
        </h1>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Sign in with your authorized administrator credentials to manage users, balances, QR settings, and requests.
        </p>

        <form onSubmit={handleAdminLogin} className="space-y-4 mt-6">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Username
            </label>
            <input
              type="text"
              required
              autoComplete="username"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white text-sm focus:outline-none focus:border-rose-500"
              placeholder="Enter administrator username"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white text-sm focus:outline-none focus:border-rose-500"
              placeholder="Enter administrator password"
            />
          </div>

          {loginError && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700/60 text-xs text-rose-300">
              {loginError}
            </div>
          )}

          <button
            type="submit"
            disabled={loginLoading}
            className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            {loginLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER AUTHENTICATED ADMINISTRATOR CONTROL PANEL
  // --------------------------------------------------------------------------
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header & KPI Metrics Strip */}
      <div className="bg-[#121723] border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>ADMINISTRATOR SESSION · @{currentUser.username} (ID: {currentUser.id})</span>
            </div>
            <h1 className="text-2xl font-display font-bold text-white mt-0.5">
              Admin Dashboard
            </h1>
          </div>
          <button
            type="button"
            onClick={() => fetchAdminOverview(searchQuery)}
            className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-800">
          <div className="p-4 rounded-xl bg-[#0A0D14] border border-slate-800/90">
            <div className="text-xs text-slate-400">Registered Users</div>
            <div className="text-2xl font-display font-bold text-white font-mono-tabular mt-1">
              {metrics.totalRegisteredUsers}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {metrics.activeUsers} Active · {metrics.suspendedUsers} Suspended
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#0A0D14] border border-slate-800/90">
            <div className="text-xs text-slate-400">Pending Deposits</div>
            <div className="text-2xl font-display font-bold text-amber-400 font-mono-tabular mt-1">
              {metrics.pendingDeposits}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Awaiting review</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0A0D14] border border-slate-800/90">
            <div className="text-xs text-slate-400">Pending Withdrawals</div>
            <div className="text-2xl font-display font-bold text-rose-400 font-mono-tabular mt-1">
              {metrics.pendingWithdrawals}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Reserved on server</div>
          </div>

          <div className="p-4 rounded-xl bg-[#0A0D14] border border-slate-800/90">
            <div className="text-xs text-slate-400">Welcome Bonus</div>
            <div className="text-2xl font-display font-bold text-emerald-400 font-mono-tabular mt-1">
              ₹{config.welcomeBonus}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">New account signup bonus</div>
          </div>
        </div>
      </div>

      {actionBanner && (
        <div
          className={`p-4 rounded-xl border text-xs font-medium flex items-center justify-between ${
            actionBanner.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
              : 'bg-rose-950/60 border-rose-700/60 text-rose-300'
          }`}
        >
          <span>{actionBanner.text}</span>
          <button
            type="button"
            onClick={() => setActionBanner(null)}
            className="text-xs underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-[#121723] border border-slate-800 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'users' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Users & Balance ({metrics.totalRegisteredUsers})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'requests' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Deposit & Withdrawal Requests ({metrics.pendingDeposits + metrics.pendingWithdrawals} Pending)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('gameEngine')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'gameEngine' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Plane className="w-3.5 h-3.5" />
          <span>Fair Flight Engine</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('config')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'config' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Brand, Bonus & QR</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'logs' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Audit Logs
        </button>
      </div>

      {/* TAB 1: REGISTERED USERS & DIRECT BALANCE ADJUSTMENT */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Direct Balance Adjustment Card */}
          <div className="bg-[#121723] border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-display font-bold text-white">
              Add or Update User Balance
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Select any registered user below (or click "Adjust Balance" next to a user in the table) to add or subtract funds with an audit reason.
            </p>

            <form
              onSubmit={(e) => submitBalanceAdjustmentForUser(selectedUserId, e)}
              className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end mt-4"
            >
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Select User Account
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                >
                  {users.length === 0 ? (
                    <option value="">No registered users</option>
                  ) : (
                    users.map((u) => (
                      <option key={u.id} value={u.id}>
                        @{u.username} (₹{u.balance.toFixed(2)}) — {u.id}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Operation
                </label>
                <div className="grid grid-cols-2 gap-1 p-1 bg-[#0A0D14] rounded-xl border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setAdjustOp('ADD')}
                    className={`py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      adjustOp === 'ADD'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    + Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustOp('SUBTRACT')}
                    className={`py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      adjustOp === 'SUBTRACT'
                        ? 'bg-rose-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    - Subtract
                  </button>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Amount (₹)
                </label>
                <input
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  required
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white font-mono-tabular text-xs focus:outline-none focus:border-rose-500"
                  placeholder="100.00"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Reason (Required)
                </label>
                <input
                  type="text"
                  required
                  maxLength={140}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g., Manual top-up / Bonus credit"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={adjustLoading || users.length === 0}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {adjustLoading ? 'Updating...' : 'Update Balance'}
                </button>
              </div>
            </form>

            {adjustFeedback && !adjustingUser && (
              <div className="mt-3 p-3 rounded-xl bg-rose-950/60 border border-rose-700/60 text-xs text-rose-300">
                {adjustFeedback}
              </div>
            )}
          </div>

          {/* Registered Users List */}
          <div className="bg-[#121723] border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-display font-bold text-white">
                  Registered User Accounts ({users.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Showing username, account ID, current balance, registration date, and account status.
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by username or ID..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0A0D14] border border-slate-700 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            {users.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No matching user accounts found.
              </div>
            ) : (
              <div className="space-y-2.5">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="p-4 rounded-xl bg-[#0A0D14] border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-white">
                        <span>@{u.username}</span>
                        <span className="text-slate-500 font-normal">·</span>
                        <span className="text-xs font-mono-tabular font-normal text-slate-400">
                          Account ID: {u.id}
                        </span>
                        <span className="text-slate-500 font-normal">·</span>
                        <span
                          className={`text-xs font-semibold ${
                            u.status === 'active' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {u.status === 'active' ? 'ACTIVE' : 'SUSPENDED'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 font-mono-tabular flex flex-wrap items-center gap-2">
                        <span className="font-bold text-emerald-400">
                          Balance: ₹{u.balance.toFixed(2)}
                        </span>
                        <span>·</span>
                        <span className="text-slate-400">
                          Registered: {new Date(u.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setAdjustingUser(u);
                          setSelectedUserId(u.id);
                          setAdjustOp('ADD');
                          setAdjustAmount('100');
                          setAdjustReason('');
                          setAdjustFeedback(null);
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Adjust Balance
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleUserStatus(u)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          u.status === 'active'
                            ? 'bg-rose-950/80 text-rose-300 hover:bg-rose-900/80 border border-rose-800/60'
                            : 'bg-emerald-950/80 text-emerald-300 hover:bg-emerald-900/80 border border-emerald-800/60'
                        }`}
                      >
                        {u.status === 'active' ? (
                          <>
                            <UserX className="w-3.5 h-3.5" />
                            <span>Suspend</span>
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Reactivate</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DEPOSIT & WITHDRAWAL REQUESTS QUEUE */}
      {activeTab === 'requests' && (
        <div className="bg-[#121723] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-lg font-display font-bold text-white">
                Deposit & Withdrawal Requests
              </h2>
              <p className="text-xs text-slate-400">
                Review pending deposit and withdrawal requests (including mobile number and UPI ID). Processed requests are locked against duplicate updates.
              </p>
            </div>
          </div>

          {requests.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No deposit or withdrawal requests found.
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="p-4 rounded-xl bg-[#0A0D14] border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono-tabular font-bold text-white">{req.id}</span>
                      <span>·</span>
                      <span
                        className={`font-semibold ${
                          req.type === 'DEPOSIT' ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {req.type === 'DEPOSIT' ? 'DEPOSIT' : 'WITHDRAWAL'}
                      </span>
                      <span>·</span>
                      <span className="text-slate-300 font-semibold">
                        Account: @{req.username} ({req.userId})
                      </span>
                      <span>·</span>
                      <span className="font-mono-tabular font-bold text-white">
                        ₹{req.amount.toFixed(2)}
                      </span>
                    </div>

                    {(req.accountHolderName || req.maskedAccountNumber || req.ifscCode || req.mobileNumber || req.upiId) && (
                      <div className="text-xs font-mono-tabular text-emerald-300 flex flex-wrap items-center gap-2 bg-[#121723] px-2.5 py-1.5 rounded-lg border border-slate-800">
                        {req.accountHolderName && <span>Holder: <strong className="text-white">{req.accountHolderName}</strong></span>}
                        {req.accountHolderName && (req.maskedAccountNumber || req.ifscCode) && <span>·</span>}
                        {req.maskedAccountNumber && <span>A/C: <strong className="text-amber-300">{req.maskedAccountNumber}</strong></span>}
                        {req.ifscCode && <span>· IFSC: <strong className="text-rose-300">{req.ifscCode}</strong></span>}
                        {req.mobileNumber && <span>· Mobile: {req.mobileNumber}</span>}
                        {req.upiId && <span>· UPI: {req.upiId}</span>}
                      </div>
                    )}

                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                      <span>Submitted: {new Date(req.createdAt).toLocaleString()}</span>
                      {req.userNote && (
                        <>
                          <span>·</span>
                          <span>Details: "{req.userNote}"</span>
                        </>
                      )}
                    </div>

                    {req.status !== 'PENDING' && (
                      <div className="text-xs text-slate-500">
                        Processed by @{req.processedBy} at{' '}
                        {req.processedAt ? new Date(req.processedAt).toLocaleString() : ''} · Note:{' '}
                        {req.adminNote}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {req.status === 'PENDING' ? (
                      <>
                        <input
                          type="text"
                          placeholder="Optional note..."
                          value={reviewNotes[req.id] || ''}
                          onChange={(e) =>
                            setReviewNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                          }
                          className="px-3 py-1.5 rounded-lg bg-[#121723] border border-slate-700 text-xs text-white focus:outline-none focus:border-rose-500"
                        />
                        <button
                          type="button"
                          disabled={processingReqId === req.id}
                          onClick={() => handleReviewRequest(req.id, 'APPROVED')}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={processingReqId === req.id}
                          onClick={() => handleReviewRequest(req.id, 'REJECTED')}
                          className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        {req.status === 'APPROVED' ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span className="text-emerald-400">Approved</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 text-rose-400" />
                            <span className="text-rose-400">Rejected</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FAIR FLIGHT ENGINE & LIVE FLIGHT CONTROLS */}
      {activeTab === 'gameEngine' && (
        <div className="space-y-6">
          {/* Live Flight Telemetry & Admin Flight Control */}
          <div className="bg-[#121723] border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-400">
                <Plane className="w-4 h-4" />
                <span>ADMIN FLIGHT CONTROL & CRASH TELEMETRY</span>
              </div>
              {gameEngineStatus && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono-tabular uppercase ${
                    gameEngineStatus.phase === 'FLYING'
                      ? 'bg-amber-950/80 text-amber-300 border border-amber-600/60 animate-pulse'
                      : gameEngineStatus.phase === 'BETTING'
                      ? 'bg-blue-950/80 text-blue-300 border border-blue-600/60'
                      : 'bg-rose-950/80 text-rose-300 border border-rose-600/60'
                  }`}
                >
                  ● {gameEngineStatus.statusLabel || (gameEngineStatus.phase === 'BETTING' ? 'Waiting' : gameEngineStatus.phase === 'FLYING' ? 'Flying' : 'Crashed')}
                </span>
              )}
            </div>

            {/* Round KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-[#0A0D14] border border-slate-800">
                <div className="text-[11px] text-slate-400">Current Round Status</div>
                <div className="text-lg font-bold font-display text-white mt-0.5">
                  {gameEngineStatus?.phase === 'BETTING'
                    ? 'Waiting / Countdown'
                    : gameEngineStatus?.phase === 'FLYING'
                    ? 'Flying in Progress'
                    : 'Crashed'}
                </div>
                <div className="text-[10px] text-slate-500 font-mono-tabular mt-0.5 truncate">
                  {gameEngineStatus?.roundId || 'Initializing...'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#0A0D14] border border-slate-800">
                <div className="text-[11px] text-slate-400">
                  {gameEngineStatus?.phase === 'CRASHED' ? 'Final Crash Multiplier' : 'Live Multiplier'}
                </div>
                <div
                  className={`text-2xl font-black font-mono-tabular mt-0.5 ${
                    gameEngineStatus?.phase === 'CRASHED'
                      ? 'text-rose-400'
                      : gameEngineStatus?.phase === 'FLYING'
                      ? 'text-amber-400 animate-pulse'
                      : 'text-slate-300'
                  }`}
                >
                  {gameEngineStatus
                    ? gameEngineStatus.phase === 'CRASHED'
                      ? `${(gameEngineStatus.crashPoint || gameEngineStatus.multiplier).toFixed(2)}x`
                      : `${gameEngineStatus.multiplier.toFixed(2)}x`
                    : '1.00x'}
                </div>
                <div className="text-[10px] text-slate-500 font-mono-tabular mt-0.5">
                  Target Crash: {gameEngineStatus?.crashPoint ? `${gameEngineStatus.crashPoint.toFixed(2)}x` : '--'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#0A0D14] border border-slate-800 col-span-2 sm:col-span-1">
                <div className="text-[11px] text-slate-400">Next Round Crash Point</div>
                <div className="text-2xl font-black font-mono-tabular text-emerald-400 mt-0.5">
                  {gameEngineStatus?.nextRound?.crashPoint
                    ? `${gameEngineStatus.nextRound.crashPoint.toFixed(2)}x`
                    : '--'}
                </div>
                <div className="text-[10px] text-slate-500 font-mono-tabular mt-0.5 truncate">
                  Next ID: {gameEngineStatus?.nextRound?.roundId || '--'}
                </div>
              </div>
            </div>

            {/* Active Flight Bets & Security Details */}
            <div className="p-3.5 rounded-xl bg-[#0A0D14] border border-slate-800 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-400">Active Players in Round:</span>
                <span className="font-bold text-white font-mono-tabular">
                  {gameEngineStatus?.activeBetsCount ?? 0} bets placed (₹{Number(gameEngineStatus?.totalBetPool || 0).toFixed(2)} pool)
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2 font-mono-tabular">
                <span className="text-slate-400">Provably Fair SHA-256 Hash:</span>
                <span className="text-slate-300 text-[11px] truncate max-w-[280px]">
                  {gameEngineStatus?.serverSeedHash || '--'}
                </span>
              </div>
            </div>

            {/* Admin Flight Ending Button */}
            <div className="pt-2">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-rose-950/40 to-slate-900 border border-rose-800/50">
                <div className="space-y-0.5">
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <Flame className="w-4 h-4 text-rose-500" />
                    <span>Admin-Controlled Flight Ending</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    End the flight immediately across all connected clients and record an authorized audit log entry.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={gameEngineStatus?.phase !== 'FLYING' || crashingFlight}
                  onClick={handleEndFlight}
                  className={`px-5 py-3 rounded-xl font-display font-extrabold text-xs tracking-wider transition-all whitespace-nowrap shrink-0 flex items-center justify-center gap-2 shadow-lg ${
                    gameEngineStatus?.phase === 'FLYING' && !crashingFlight
                      ? 'bg-rose-600 hover:bg-rose-500 text-white cursor-pointer active:scale-95 animate-pulse'
                      : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
                  }`}
                >
                  <Plane className="w-4 h-4 rotate-45" />
                  <span>{crashingFlight ? 'Ending Flight...' : 'End Flight / Crash Plane'}</span>
                </button>
              </div>
              {gameEngineStatus?.phase !== 'FLYING' && (
                <p className="text-[11px] text-slate-500 text-center mt-2">
                  * The "End Flight / Crash Plane" button is only enabled when a flight is actively in progress.
                </p>
              )}
            </div>
          </div>

          {/* Provably Fair Round History & Auditing Table */}
          <div className="bg-[#121723] border border-slate-800 rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h3 className="text-base font-display font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Provably Fair Round History & Verification</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Recent rounds with SHA-256 pre-commitment hashes and revealed server seeds for cryptographic fairness verification.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="py-2.5 px-3">Round ID</th>
                    <th className="py-2.5 px-3">Crash Multiplier</th>
                    <th className="py-2.5 px-3">Server Seed SHA-256 Hash</th>
                    <th className="py-2.5 px-3">Revealed Server Seed</th>
                    <th className="py-2.5 px-3 text-right">Completed Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono-tabular">
                  {gameEngineStatus?.recentHistory && gameEngineStatus.recentHistory.length > 0 ? (
                    gameEngineStatus.recentHistory.map((item) => (
                      <tr key={item.roundId} className="hover:bg-slate-800/30 text-slate-200">
                        <td className="py-2.5 px-3 font-bold text-white">{item.roundId}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`font-black px-2 py-0.5 rounded ${
                              item.crashPoint >= 10
                                ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                                : item.crashPoint >= 2
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                                : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                            }`}
                          >
                            {item.crashPoint.toFixed(2)}x
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px] truncate max-w-[200px]">
                          {item.serverSeedHash}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px] truncate max-w-[200px]">
                          {item.serverSeed || '(Active in Round)'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-400 text-[11px]">
                          {new Date(item.completedAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No round history recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PLATFORM CONFIGURATION (LOGO, BONUS, MIN WITHDRAWAL & QR CODE) */}
      {activeTab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-[#121723] border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-400">
              <Settings className="w-4 h-4" />
              <span>ADMIN-ONLY SYSTEM SETTINGS</span>
            </div>
            <h2 className="text-xl font-display font-bold text-white">
              Platform Branding, Bonus & Financial Controls
            </h2>
            <p className="text-xs text-slate-400">
              Configure game logo, deposit bonuses, withdrawal thresholds, and the official deposit QR code. Settings are stored permanently in the database and applied across the entire application.
            </p>

            <div className="space-y-5">
              {/* SECTION 1: GAME LOGO */}
              <div className="p-4 rounded-xl bg-[#0A0D14] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Image className="w-3.5 h-3.5 text-rose-400" />
                      <span>Admin-Controlled Game Logo</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Upload or specify a custom game logo. Displayed on the game top navigation bar for all players.
                    </p>
                  </div>
                </div>

                <div>
                  <input
                    type="text"
                    value={logoUrlInput}
                    onChange={(e) => setLogoUrlInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#121723] border border-slate-700 text-white text-xs font-mono-tabular focus:outline-none focus:border-rose-500"
                    placeholder="Enter image URL or upload image file below"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-rose-400" />
                    <span>Upload & Save Logo File</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoFileUpload}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => handleSaveConfig({ resetDefaultLogo: true })}
                    disabled={configSaving}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
                  >
                    Restore Default Logo
                  </button>
                </div>
              </div>

              {/* SECTION 1B: LOADING SCREEN LOGO */}
              <div className="p-4 rounded-xl bg-[#0A0D14] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Image className="w-3.5 h-3.5 text-rose-400" />
                      <span>Loading Screen Logo</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Upload or specify a custom logo image for the splash/loading screen.
                    </p>
                  </div>
                </div>

                <div>
                  <input
                    type="text"
                    value={loadingLogoUrlInput}
                    onChange={(e) => setLoadingLogoUrlInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#121723] border border-slate-700 text-white text-xs font-mono-tabular focus:outline-none focus:border-rose-500"
                    placeholder="Enter image URL or upload image file below"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-rose-400" />
                    <span>Upload & Save Loading Logo File</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLoadingLogoFileUpload}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => handleSaveConfig({ resetDefaultLoadingLogo: true })}
                    disabled={configSaving}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
                  >
                    Restore Default Loading Logo
                  </button>
                </div>
              </div>

              {/* SECTION 2: DEPOSIT BONUS */}
              <div className="p-4 rounded-xl bg-[#0A0D14] border border-slate-800 space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Deposit Bonus Configuration</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Configure bonus percentage credited on approved deposit requests. Calculated reliably on the server side to prevent manipulation.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={depositBonusEnabled}
                      onChange={(e) => setDepositBonusEnabled(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-rose-600 focus:ring-rose-500"
                    />
                    <span>Enable Deposit Bonus</span>
                  </label>
                </div>

                {depositBonusEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Bonus Percentage (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={depositBonusPercentInput}
                        onChange={(e) => setDepositBonusPercentInput(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#121723] border border-slate-700 text-white font-mono-tabular text-xs focus:outline-none focus:border-rose-500"
                        placeholder="e.g. 9"
                      />
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#121723] border border-slate-800 flex flex-col justify-center text-[11px] text-slate-400">
                      <span className="text-emerald-400 font-bold">Bonus Formula Example:</span>
                      <span className="font-mono-tabular mt-0.5">
                        Deposit ₹10,000 + {depositBonusPercentInput}% Bonus = ₹{(10000 * (1 + Number(depositBonusPercentInput || 0) / 100)).toFixed(2)} Credited
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: FINANCIAL CONTROLS (MIN WITHDRAWAL, WELCOME BONUS & REFERRAL REWARD) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-[#0A0D14] border border-slate-800 space-y-2">
                  <label className="block text-xs font-bold text-white uppercase tracking-wider">
                    Minimum Withdrawal (₹)
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Enforced on server and displayed in withdrawal interface.
                  </p>
                  <input
                    type="number"
                    min="1"
                    max="100000"
                    step="1"
                    value={minWithdrawalInput}
                    onChange={(e) => setMinWithdrawalInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#121723] border border-slate-700 text-white font-mono-tabular text-sm focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="p-4 rounded-xl bg-[#0A0D14] border border-slate-800 space-y-2">
                  <label className="block text-xs font-bold text-white uppercase tracking-wider">
                    Welcome Bonus (₹)
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Credited automatically once upon player registration.
                  </p>
                  <input
                    type="number"
                    min="0"
                    max="100000"
                    step="1"
                    value={bonusInput}
                    onChange={(e) => setBonusInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#121723] border border-slate-700 text-white font-mono-tabular text-sm focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="p-4 rounded-xl bg-[#0A0D14] border border-slate-800 space-y-2">
                  <label className="block text-xs font-bold text-white uppercase tracking-wider">
                    Referral Reward (₹)
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Reward credited per verified invited player signup.
                  </p>
                  <input
                    type="number"
                    min="0"
                    max="50000"
                    step="1"
                    value={referralBonusInput}
                    onChange={(e) => setReferralBonusInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#121723] border border-slate-700 text-white font-mono-tabular text-sm focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* SECTION 4: DEPOSIT QR CODE */}
              <div className="p-4 rounded-xl bg-[#0A0D14] border border-slate-800 space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span>Deposit QR Code Image</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Official QR code image displayed to users in the Deposit section.
                  </p>
                </div>

                <div>
                  <input
                    type="text"
                    value={qrUrlInput}
                    onChange={(e) => setQrUrlInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#121723] border border-slate-700 text-white text-xs font-mono-tabular focus:outline-none focus:border-rose-500"
                    placeholder="Paste image URL or upload an image file below"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-rose-400" />
                    <span>Upload & Save QR Image File</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleQrFileUpload}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => handleSaveConfig({ resetDefaultQr: true })}
                    disabled={configSaving}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
                  >
                    Restore Default QR Image
                  </button>
                </div>
              </div>

              {/* Save All Platform Settings Button */}
              <div className="pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => handleSaveConfig(false)}
                  disabled={configSaving}
                  className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors cursor-pointer shadow-lg"
                >
                  {configSaving ? 'Saving Platform Settings...' : 'Save All Platform Settings Permanently'}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Previews */}
          <div className="lg:col-span-5 space-y-6">
            {/* Live Logo Preview Card */}
            <div className="bg-[#121723] border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-between text-center">
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-1">
                  ACTIVE GAME LOGO PREVIEW
                </div>
                <p className="text-xs text-slate-500">
                  Rendered in the game header navigation bar
                </p>
              </div>

              <div className="my-4 p-4 rounded-xl border border-slate-800 bg-[#0A0D14] w-full flex items-center justify-center min-h-[90px]">
                {logoUrlInput ? (
                  <img
                    src={logoUrlInput}
                    alt="Active Game Logo Preview"
                    className="max-h-16 max-w-[200px] object-contain mx-auto rounded"
                  />
                ) : (
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-mono-tabular">
                    <span className="text-lg font-display font-extrabold text-white">AVIATOR</span>
                    <span className="text-[10px] text-slate-500">(Default Wordmark)</span>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-500">
                {logoUrlInput ? 'Custom logo active' : 'Using default branding wordmark'}
              </div>
            </div>

            {/* Live Loading Logo Preview Card */}
            <div className="bg-[#121723] border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-between text-center">
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-1">
                  ACTIVE LOADING LOGO PREVIEW
                </div>
                <p className="text-xs text-slate-500">
                  Rendered on the initial game splash loading screen
                </p>
              </div>

              <div className="my-4 p-4 rounded-xl border border-slate-800 bg-[#0A0D14] w-full flex items-center justify-center min-h-[90px]">
                {loadingLogoUrlInput ? (
                  <img
                    src={loadingLogoUrlInput}
                    alt="Active Loading Screen Logo Preview"
                    className="max-h-16 max-w-[200px] object-contain mx-auto rounded"
                  />
                ) : (
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-mono-tabular">
                    <span className="text-lg font-display font-extrabold text-rose-500">AVIATOR</span>
                    <span className="text-[10px] text-slate-500">(Default Splash Logo)</span>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-500">
                {loadingLogoUrlInput ? 'Custom loading logo active' : 'Using default splash branding'}
              </div>
            </div>

            {/* Live Deposit QR Preview Card */}
            <div className="bg-[#121723] border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-between text-center">
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-1">
                  ACTIVE DEPOSIT QR CODE PREVIEW
                </div>
                <p className="text-xs text-slate-500">
                  Displayed in the Deposit section for all users
                </p>
              </div>

              <div className="my-4">
                {qrUrlInput ? (
                  <img
                    src={qrUrlInput}
                    alt="Deposit QR Code Preview"
                    referrerPolicy="no-referrer"
                    className="w-56 h-auto max-h-64 object-contain rounded-xl border border-slate-800 bg-black p-2 mx-auto"
                  />
                ) : (
                  <div className="w-52 h-52 rounded-xl border border-slate-700 bg-slate-900 flex items-center justify-center text-xs text-slate-500">
                    No QR Image Set
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-500">
                Last updated by @{config.updatedBy || 'system'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TRANSACTIONS & AUDIT LOGS */}
      {activeTab === 'logs' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Administrative Audit Logs */}
          <div className="lg:col-span-6 bg-[#121723] border border-slate-800 rounded-2xl p-5">
            <h2 className="text-base font-display font-bold text-white pb-3 mb-3 border-b border-slate-800">
              Audit Logs ({auditLogs.length})
            </h2>
            {auditLogs.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                No administrative actions logged yet.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-xl bg-[#0A0D14] border border-slate-800 space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono-tabular font-bold text-rose-400">
                        {log.action}
                      </span>
                      <span className="text-slate-500 font-mono-tabular">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-white">{log.details}</div>
                    <div className="text-xs text-slate-400 font-mono-tabular flex flex-wrap items-center gap-1.5">
                      <span>Admin: @{log.adminUsername} ({log.adminId})</span>
                      {log.targetUsername && (
                        <>
                          <span>·</span>
                          <span>
                            User: @{log.targetUsername}
                            {log.targetUserId ? ` (${log.targetUserId})` : ''}
                          </span>
                        </>
                      )}
                      {log.amount !== undefined && log.amount !== null && (
                        <>
                          <span>·</span>
                          <span>
                            Amount: {log.amount >= 0 ? '+' : '-'}₹{Math.abs(log.amount).toFixed(2)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Global Transaction History */}
          <div className="lg:col-span-6 bg-[#121723] border border-slate-800 rounded-2xl p-5">
            <h2 className="text-base font-display font-bold text-white pb-3 mb-3 border-b border-slate-800">
              Transaction History ({transactions.length})
            </h2>
            {transactions.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                No transactions recorded yet.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3.5 rounded-xl bg-[#0A0D14] border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        @{tx.username} ({tx.userId}) · {tx.description}
                      </div>
                      <div className="text-xs text-slate-500 font-mono-tabular">
                        ID: {tx.id} · {new Date(tx.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right font-mono-tabular shrink-0">
                      <div
                        className={`text-xs font-bold ${
                          tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {tx.amount >= 0 ? '+' : '-'}₹{Math.abs(tx.amount).toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-500">
                        Balance: ₹{tx.balanceAfter.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal for Adding or Subtracting Balance with Required Reason */}
      {adjustingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-[#121723] border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-display font-bold text-white">
              Adjust Balance for @{adjustingUser.username}
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-mono-tabular">
              Account ID: {adjustingUser.id} · Current Balance:{' '}
              <span className="text-white font-semibold">
                ₹{adjustingUser.balance.toFixed(2)}
              </span>
            </p>

            <form
              onSubmit={(e) => submitBalanceAdjustmentForUser(adjustingUser.id, e)}
              className="space-y-4 mt-4"
            >
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#0A0D14] rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setAdjustOp('ADD')}
                  className={`py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    adjustOp === 'ADD'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  + Add Balance
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustOp('SUBTRACT')}
                  className={`py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    adjustOp === 'SUBTRACT'
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  - Subtract Balance
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Amount (₹)
                </label>
                <input
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  required
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white font-mono-tabular text-sm focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Reason (Required for Audit Log)
                </label>
                <input
                  type="text"
                  required
                  maxLength={140}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Enter reason for adjustment"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white text-sm focus:outline-none focus:border-rose-500"
                />
              </div>

              {adjustFeedback && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700/60 text-xs text-rose-300">
                  {adjustFeedback}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustingUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustLoading}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  {adjustLoading ? 'Saving...' : 'Confirm Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
