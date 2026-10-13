import React, { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2,
  Lock,
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
  TransactionRecord,
  TransferRequestRecord,
  User,
} from '../types';
import { UPLOADED_QR_DATA_URI, optimizeUploadedQrImage } from '../utils/qrImage';
import { apiFetch, setAuthToken } from '../utils/api';

interface AdminDashboardProps {
  currentUser: User | null;
  onAdminAuthenticated: (user: User) => void;
}

interface AdminMetrics {
  totalRegisteredUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  onAdminAuthenticated,
}) => {
  // Admin Login Form State
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);

  // Dashboard Data State
  const [activeTab, setActiveTab] = useState<'users' | 'requests' | 'config' | 'logs'>('users');
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
  });

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

  // Config Form State
  const [bonusInput, setBonusInput] = useState<string>('500');
  const [qrUrlInput, setQrUrlInput] = useState<string>('');
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
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Administrator login failed.');
      } else {
        if (data.token) {
          setAuthToken(data.token);
        }
        onAdminAuthenticated(data.user);
      }
    } catch {
      setLoginError('Network error while signing in to Administrator Panel.');
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

  const handleSaveConfig = async (resetDefaultQr = false) => {
    setConfigSaving(true);
    setActionBanner(null);
    try {
      const res = await apiFetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          welcomeBonus: Number(bonusInput),
          placeholderQrUrl: qrUrlInput,
          resetDefaultQr,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionBanner({ type: 'error', text: data.error || 'Failed to update configuration.' });
      } else {
        setConfig(data.config);
        setBonusInput(String(data.config.welcomeBonus));
        setQrUrlInput(data.config.placeholderQrUrl);
        setActionBanner({
          type: 'success',
          text: resetDefaultQr
            ? 'Deposit QR code restored to default image and saved permanently.'
            : 'Deposit QR code and Welcome Bonus settings saved permanently to database.',
        });
        await fetchAdminOverview(searchQuery);
      }
    } catch {
      setActionBanner({ type: 'error', text: 'Network error while saving settings.' });
    } finally {
      setConfigSaving(false);
    }
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
          Users & Balance Management ({metrics.totalRegisteredUsers})
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
          onClick={() => setActiveTab('config')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'config' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Settings & QR Code
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'logs' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Transaction History & Audit Logs
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

      {/* TAB 3: PLATFORM CONFIGURATION (WELCOME BONUS & ADMIN-ONLY QR CODE) */}
      {activeTab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-[#121723] border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-400">
              <Settings className="w-4 h-4" />
              <span>ADMIN-ONLY SYSTEM SETTINGS</span>
            </div>
            <h2 className="text-xl font-display font-bold text-white">
              Welcome Bonus & Deposit QR Code
            </h2>
            <p className="text-xs text-slate-400">
              Only authorized administrators can change the Deposit QR code. Any QR code uploaded or saved here is stored permanently in the database and displayed to all users in the Deposit section.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  New Account Welcome Bonus (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100000"
                  step="1"
                  value={bonusInput}
                  onChange={(e) => setBonusInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white font-mono-tabular text-sm focus:outline-none focus:border-rose-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Credited automatically once when a new user registers.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Deposit QR Code Image (Image URL or Data URI)
                </label>
                <input
                  type="text"
                  value={qrUrlInput}
                  onChange={(e) => setQrUrlInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white text-xs font-mono-tabular focus:outline-none focus:border-rose-500"
                  placeholder="Paste image URL or upload an image file below"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <label className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer">
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
                  onClick={() => handleSaveConfig(true)}
                  disabled={configSaving}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
                >
                  Restore Default QR Image
                </button>
              </div>

              <div className="pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => handleSaveConfig(false)}
                  disabled={configSaving}
                  className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors cursor-pointer"
                >
                  {configSaving ? 'Saving Settings...' : 'Save Settings Permanently'}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-[#121723] border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-between text-center">
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
                  className="w-60 h-auto max-h-72 object-contain rounded-xl border border-slate-800 bg-black p-2 mx-auto"
                />
              ) : (
                <div className="w-56 h-56 rounded-xl border border-slate-700 bg-slate-900 flex items-center justify-center text-xs text-slate-500">
                  No QR Image Set
                </div>
              )}
            </div>

            <div className="text-xs text-slate-500">
              Last updated by @{config.updatedBy || 'system'}
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
