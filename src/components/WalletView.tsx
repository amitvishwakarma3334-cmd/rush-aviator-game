import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import type { AppConfigRecord, ReferralSummaryResponse, TransactionRecord, TransferRequestRecord, User } from '../types';
import { UPLOADED_QR_DATA_URI } from '../utils/qrImage';
import { apiFetch } from '../utils/api';
import { soundFx } from '../utils/sound';

interface WalletViewProps {
  user: User | null;
  onBalanceChange: (newBalance: number) => void;
  onRequireLogin: () => void;
  initialSubTab?: 'overview' | 'deposit' | 'withdraw' | 'referrals';
}

export const WalletView: React.FC<WalletViewProps> = ({
  user,
  onBalanceChange,
  onRequireLogin,
  initialSubTab = 'deposit',
}) => {
  const [subTab, setSubTab] = useState<'overview' | 'deposit' | 'withdraw' | 'referrals'>(initialSubTab);
  const [loading, setLoading] = useState<boolean>(true);
  const [balance, setBalance] = useState<number>(user?.balance ?? 0);
  const [config, setConfig] = useState<AppConfigRecord>({
    welcomeBonus: 500,
    placeholderQrUrl: UPLOADED_QR_DATA_URI,
    depositBonusEnabled: true,
    depositBonusPercent: 9,
    minWithdrawalAmount: 500,
    referralBonus: 50,
  });
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [requests, setRequests] = useState<TransferRequestRecord[]>([]);
  const [referralData, setReferralData] = useState<ReferralSummaryResponse | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Deposit Form State
  const [depositAmount, setDepositAmount] = useState<string>('500');
  const [depositNote, setDepositNote] = useState<string>('');
  const [depositSubmitting, setDepositSubmitting] = useState<boolean>(false);
  const [depositFeedback, setDepositFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Withdrawal Form State (Bank details + Mobile Number + IFSC)
  const [withdrawAmount, setWithdrawAmount] = useState<string>('100');
  const [withdrawMobile, setWithdrawMobile] = useState<string>('');
  const [withdrawHolderName, setWithdrawHolderName] = useState<string>('');
  const [withdrawAccountNumber, setWithdrawAccountNumber] = useState<string>('');
  const [withdrawConfirmAccount, setWithdrawConfirmAccount] = useState<string>('');
  const [withdrawIfsc, setWithdrawIfsc] = useState<string>('');
  const [withdrawUpi, setWithdrawUpi] = useState<string>('');
  const [withdrawNote, setWithdrawNote] = useState<string>('');
  const [showAccountNumber, setShowAccountNumber] = useState<boolean>(false);
  const [withdrawSubmitting, setWithdrawSubmitting] = useState<boolean>(false);
  const [withdrawFeedback, setWithdrawFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const fetchWalletData = useCallback(async () => {
    try {
      const sysRes = await apiFetch('/api/system/status');
      if (sysRes.ok) {
        const sysData = await sysRes.json();
        setConfig((prev) => ({
          ...prev,
          welcomeBonus: sysData.welcomeBonus ?? 500,
          placeholderQrUrl: sysData.placeholderQrUrl || UPLOADED_QR_DATA_URI,
          logoUrl: sysData.logoUrl || '',
          depositBonusEnabled: sysData.depositBonusEnabled !== false,
          depositBonusPercent: sysData.depositBonusPercent ?? 9,
          minWithdrawalAmount: sysData.minWithdrawalAmount ?? 500,
          referralBonus: sysData.referralBonus ?? 50,
        }));
      }

      if (!user) {
        setLoading(false);
        return;
      }

      const res = await apiFetch('/api/wallet/summary');
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance);
        onBalanceChange(data.balance);
        if (data.config) {
          setConfig((prev) => ({
            ...prev,
            welcomeBonus: data.config.welcomeBonus ?? 500,
            placeholderQrUrl: data.config.placeholderQrUrl || UPLOADED_QR_DATA_URI,
            logoUrl: data.config.logoUrl || '',
            depositBonusEnabled: data.config.depositBonusEnabled !== false,
            depositBonusPercent: data.config.depositBonusPercent ?? 9,
            minWithdrawalAmount: data.config.minWithdrawalAmount ?? 500,
            referralBonus: data.config.referralBonus ?? 50,
          }));
        }
        setTransactions(data.transactions || []);
        setRequests(data.requests || []);
      }

      // Fetch referral summary
      try {
        const refRes = await apiFetch('/api/wallet/referrals');
        if (refRes.ok) {
          const refJson = await refRes.json();
          setReferralData(refJson);
        }
      } catch {
        // non-blocking
      }
    } catch (err) {
      console.error('Failed to fetch wallet summary:', err);
    } finally {
      setLoading(false);
    }
  }, [user, onBalanceChange]);

  const copyReferralCode = () => {
    const code = referralData?.referralCode || user?.referralCode || user?.username.toUpperCase() || '';
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyReferralLink = () => {
    const link = referralData?.referralLink || `${window.location.origin}/?ref=${referralData?.referralCode || user?.referralCode || user?.username.toUpperCase() || ''}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireLogin();
      return;
    }
    setDepositFeedback(null);
    const num = Number(depositAmount);
    if (!Number.isFinite(num) || num < 1 || num > 50000) {
      setDepositFeedback({
        type: 'error',
        message: 'Please enter a valid deposit amount between ₹1 and ₹50,000.',
      });
      return;
    }

    setDepositSubmitting(true);
    try {
      const res = await apiFetch('/api/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: num, userNote: depositNote }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDepositFeedback({
          type: 'error',
          message: data.error || 'Could not submit deposit request.',
        });
      } else {
        // Play clear deposit submission success audio
        soundFx.playDepositSuccess();
        const bonusMsg = data.bonusAmount > 0
          ? ` (${data.bonusPercent || 9}% bonus: +₹${Number(data.bonusAmount).toFixed(2)}, total credited upon approval: ₹${Number(data.creditedAmount).toFixed(2)})`
          : '';
        setDepositFeedback({
          type: 'success',
          message: `Deposit request submitted. Reference ID: ${data.request.id} · Status: Pending${bonusMsg}`,
        });
        setDepositNote('');
        await fetchWalletData();
      }
    } catch {
      setDepositFeedback({
        type: 'error',
        message: 'Network error while submitting deposit request.',
      });
    } finally {
      setDepositSubmitting(false);
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireLogin();
      return;
    }
    setWithdrawFeedback(null);
    const num = Number(withdrawAmount);
    const minW = Math.max(1, config.minWithdrawalAmount || 500);
    if (!Number.isFinite(num) || num < minW) {
      setWithdrawFeedback({
        type: 'error',
        message: `Minimum withdrawal amount is ₹${minW.toFixed(2)}.`,
      });
      return;
    }
    if (num > balance) {
      setWithdrawFeedback({
        type: 'error',
        message: `Insufficient available balance (₹${balance.toFixed(2)}).`,
      });
      return;
    }

    const cleanMobile = withdrawMobile.trim().replace(/[\s\-+]/g, '');
    if (!cleanMobile || !/^\d{10}$/.test(cleanMobile)) {
      setWithdrawFeedback({
        type: 'error',
        message: 'Please enter a valid 10-digit mobile number.',
      });
      return;
    }

    const cleanHolder = withdrawHolderName.trim();
    if (!cleanHolder || cleanHolder.length < 2 || cleanHolder.length > 70) {
      setWithdrawFeedback({
        type: 'error',
        message: 'Please enter a valid Bank Account Holder Name (2 to 70 characters).',
      });
      return;
    }

    const cleanAccount = withdrawAccountNumber.trim().replace(/\s+/g, '');
    if (!cleanAccount || !/^\d{9,18}$/.test(cleanAccount)) {
      setWithdrawFeedback({
        type: 'error',
        message: 'Bank Account Number must be between 9 and 18 digits.',
      });
      return;
    }

    const cleanConfirm = withdrawConfirmAccount.trim().replace(/\s+/g, '');
    if (cleanConfirm !== cleanAccount) {
      setWithdrawFeedback({
        type: 'error',
        message: 'Bank Account Number and Confirm Account Number do not match.',
      });
      return;
    }

    const cleanIfsc = withdrawIfsc.trim().toUpperCase();
    if (!cleanIfsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      setWithdrawFeedback({
        type: 'error',
        message: 'Please enter a valid 11-character IFSC code (e.g., SBIN0001234, HDFC0000001).',
      });
      return;
    }

    setWithdrawSubmitting(true);
    try {
      const res = await apiFetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: num,
          mobileNumber: cleanMobile,
          accountHolderName: cleanHolder,
          bankAccountNumber: cleanAccount,
          confirmBankAccountNumber: cleanConfirm,
          ifscCode: cleanIfsc,
          upiId: withdrawUpi.trim(),
          userNote: withdrawNote.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWithdrawFeedback({
          type: 'error',
          message: data.error || 'Could not submit withdrawal request.',
        });
      } else {
        // Play clear banking withdrawal confirmation audio
        soundFx.playWithdrawalRequest();
        setWithdrawFeedback({
          type: 'success',
          message: `Withdrawal request submitted successfully. Reference ID: ${data.request.id} · Status: Pending Review`,
        });
        // Clear sensitive bank details from state immediately
        setWithdrawMobile('');
        setWithdrawHolderName('');
        setWithdrawAccountNumber('');
        setWithdrawConfirmAccount('');
        setWithdrawIfsc('');
        setWithdrawUpi('');
        setWithdrawNote('');
        await fetchWalletData();
      }
    } catch {
      setWithdrawFeedback({
        type: 'error',
        message: 'Network error while submitting withdrawal request.',
      });
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  const activeQrSrc = config.placeholderQrUrl || UPLOADED_QR_DATA_URI;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Wallet Header Bar */}
      <div className="bg-[#121723] border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <Wallet className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{user ? `Account · @${user.username}` : 'Wallet & Payments'}</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-white">
            Wallet
          </h1>
          <p className="text-sm text-slate-400">
            Scan the QR code to submit a deposit request, request a withdrawal, or view your transaction history.
          </p>
        </div>

        <div className="flex items-center gap-5 shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-800">
          <div>
            <div className="text-xs text-slate-400">Balance</div>
            <div className="text-2xl sm:text-3xl font-display font-extrabold text-white font-mono-tabular">
              ₹{balance.toFixed(2)}
            </div>
          </div>
          <button
            type="button"
            onClick={fetchWalletData}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            title="Refresh wallet"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Segmented Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-[#121723] border border-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('deposit')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'deposit'
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={() => setSubTab('withdraw')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'withdraw'
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Withdraw
          </button>
          <button
            type="button"
            onClick={() => setSubTab('overview')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'overview'
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Transaction History
          </button>
          <button
            type="button"
            onClick={() => setSubTab('referrals')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'referrals'
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Refer & Earn</span>
          </button>
        </div>
      </div>

      {/* DEPOSIT SECTION (QR Code Read-Only for Users; Configurable Only by Admin) */}
      {subTab === 'deposit' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Column: Scan QR Code */}
          <div className="lg:col-span-5 bg-[#121723] border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-between">
            <div className="w-full text-center space-y-1">
              <h2 className="text-xl font-display font-bold text-white">
                Scan QR Code
              </h2>
              <p className="text-xs text-slate-400">
                Scan with any supported UPI app and submit your deposit request
              </p>
            </div>

            <div className="my-5 flex flex-col items-center justify-center w-full">
              <div className="bg-black rounded-2xl border border-slate-800 p-3 shadow-2xl">
                <img
                  src={activeQrSrc}
                  alt="Scan QR Code"
                  referrerPolicy="no-referrer"
                  className="w-64 sm:w-72 h-auto object-contain rounded-lg select-none"
                />
              </div>
            </div>

            <div className="w-full text-center text-xs text-slate-400 border-t border-slate-800 pt-3">
              Scan the QR code above and enter the deposit amount on the right.
            </div>
          </div>

          {/* Right Column: Deposit Request Form */}
          <div className="lg:col-span-7 bg-[#121723] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-display font-bold text-white">
                  Deposit Request
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Enter the deposit amount and optional UTR / reference ID. Your balance will be updated once the request is approved.
                </p>
              </div>

              <form onSubmit={handleDepositSubmit} className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Amount (₹)
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2.5">
                    {[100, 250, 500, 1000, 2500].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setDepositAmount(String(preset))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono-tabular font-semibold transition-colors cursor-pointer ${
                          Number(depositAmount) === preset
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        ₹{preset}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="50000"
                    step="1"
                    required
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white font-mono-tabular text-sm focus:outline-none focus:border-rose-500"
                    placeholder="Enter amount (₹1 - ₹50,000)"
                  />

                  {/* Real-time Deposit Bonus Breakdown (9% Server Calculated) */}
                  {config.depositBonusEnabled !== false && (
                    <div className="p-3 rounded-xl bg-gradient-to-r from-rose-950/40 via-purple-950/20 to-amber-950/40 border border-rose-800/50 text-xs space-y-1 mt-2.5">
                      <div className="flex items-center justify-between text-rose-300 font-semibold">
                        <span>🔥 {config.depositBonusPercent ?? 9}% Instant Deposit Bonus</span>
                        <span className="font-mono-tabular text-amber-300 font-bold">
                          +₹{(Math.round((Math.max(0, Number(depositAmount || 0)) * ((config.depositBonusPercent ?? 9) / 100)) * 100) / 100).toFixed(2)} Bonus
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-300 font-mono-tabular text-[11px] pt-1 border-t border-rose-900/40">
                        <span>Base Amount: ₹{Math.max(0, Number(depositAmount || 0)).toFixed(2)}</span>
                        <span className="text-emerald-400 font-bold">
                          Total Credited: ₹{(Math.max(0, Number(depositAmount || 0)) + Math.round((Math.max(0, Number(depositAmount || 0)) * ((config.depositBonusPercent ?? 9) / 100)) * 100) / 100).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    UTR / Reference ID (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={140}
                    value={depositNote}
                    onChange={(e) => setDepositNote(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white text-sm focus:outline-none focus:border-rose-500"
                    placeholder="Enter 12-digit UTR or reference note"
                  />
                </div>

                {depositFeedback && (
                  <div
                    className={`p-3.5 rounded-xl text-xs font-medium border ${
                      depositFeedback.type === 'success'
                        ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300'
                        : 'bg-rose-950/50 border-rose-700/60 text-rose-300'
                    }`}
                  >
                    {depositFeedback.message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={depositSubmitting}
                  className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors cursor-pointer"
                >
                  {!user
                    ? 'Sign In to Submit Deposit Request'
                    : depositSubmitting
                    ? 'Submitting Request...'
                    : 'Submit Deposit Request'}
                </button>
              </form>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
              <span>Status: Pending Review</span>
              <span>·</span>
              <span>Reference ID generated automatically</span>
            </div>
          </div>
        </div>
      )}

      {/* WITHDRAW SECTION (Amount + Mobile + Bank Account + Confirm Account + IFSC) */}
      {subTab === 'withdraw' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 bg-[#121723] border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-xl font-display font-bold text-white">
                Withdraw Funds
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Enter your withdrawal amount (minimum ₹{config.minWithdrawalAmount || 500}.00), mobile number, and verified bank account details.
              </p>
            </div>

            <form onSubmit={handleWithdrawSubmit} className="space-y-4 pt-2">
              {/* Amount & Presets */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-slate-300">
                    Withdrawal Amount (Minimum ₹{config.minWithdrawalAmount || 500}) *
                  </span>
                  <span className="text-slate-400 font-mono-tabular">
                    Balance: ₹{balance.toFixed(2)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-2.5">
                  {[
                    config.minWithdrawalAmount || 500,
                    (config.minWithdrawalAmount || 500) * 2,
                    2000,
                    5000,
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setWithdrawAmount(String(preset))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono-tabular font-semibold transition-colors cursor-pointer ${
                        Number(withdrawAmount) === preset
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      ₹{preset}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setWithdrawAmount(String(Math.floor(balance)))}
                    className="px-3 py-1.5 rounded-lg text-xs font-mono-tabular font-semibold bg-slate-800 text-rose-400 hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    MAX
                  </button>
                </div>
                <input
                  type="number"
                  min={config.minWithdrawalAmount || 500}
                  step="0.01"
                  required
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white font-mono-tabular text-sm focus:outline-none focus:border-rose-500"
                  placeholder={`Minimum ₹${config.minWithdrawalAmount || 500}.00`}
                />
              </div>

              {/* Mobile Number & Account Holder Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Mobile Number (10 Digits) *
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={withdrawMobile}
                    onChange={(e) => setWithdrawMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white font-mono-tabular text-sm focus:outline-none focus:border-rose-500"
                    placeholder="e.g. 9876543210"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Bank Account Holder Name *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={70}
                    value={withdrawHolderName}
                    onChange={(e) => setWithdrawHolderName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white text-sm focus:outline-none focus:border-rose-500"
                    placeholder="Full name as per bank records"
                  />
                </div>
              </div>

              {/* Bank Account Number & Confirm Account Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-slate-300">
                      Bank Account Number *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAccountNumber(!showAccountNumber)}
                      className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      {showAccountNumber ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Hide</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Show</span>
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    type={showAccountNumber ? 'text' : 'password'}
                    required
                    maxLength={18}
                    value={withdrawAccountNumber}
                    onChange={(e) => setWithdrawAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 18))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white font-mono-tabular text-sm focus:outline-none focus:border-rose-500"
                    placeholder="9 to 18 digit account number"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Confirm Bank Account Number *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={18}
                    value={withdrawConfirmAccount}
                    onChange={(e) => setWithdrawConfirmAccount(e.target.value.replace(/\D/g, '').slice(0, 18))}
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border text-white font-mono-tabular text-sm focus:outline-none ${
                      withdrawConfirmAccount && withdrawConfirmAccount !== withdrawAccountNumber
                        ? 'border-rose-500 text-rose-200'
                        : 'border-slate-700 focus:border-rose-500'
                    }`}
                    placeholder="Re-enter bank account number"
                  />
                  {withdrawConfirmAccount && withdrawConfirmAccount !== withdrawAccountNumber && (
                    <span className="text-[11px] text-rose-400 mt-1 block">
                      Account numbers do not match
                    </span>
                  )}
                </div>
              </div>

              {/* IFSC Code & Optional UPI ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    IFSC Code *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={11}
                    value={withdrawIfsc}
                    onChange={(e) => setWithdrawIfsc(e.target.value.toUpperCase().slice(0, 11))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white font-mono-tabular uppercase text-sm focus:outline-none focus:border-rose-500"
                    placeholder="e.g. SBIN0001234"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    11 characters (4 letters, 0, 6 alphanumeric)
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    UPI ID (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={withdrawUpi}
                    onChange={(e) => setWithdrawUpi(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white text-sm focus:outline-none focus:border-rose-500"
                    placeholder="e.g. username@upi"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Additional Note (Optional)
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={withdrawNote}
                  onChange={(e) => setWithdrawNote(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white text-sm focus:outline-none focus:border-rose-500"
                  placeholder="Optional remark"
                />
              </div>

              {withdrawFeedback && (
                <div
                  className={`p-3.5 rounded-xl text-xs font-medium border ${
                    withdrawFeedback.type === 'success'
                      ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300'
                      : 'bg-rose-950/50 border-rose-700/60 text-rose-300'
                  }`}
                >
                  {withdrawFeedback.message}
                </div>
              )}

              <button
                type="submit"
                disabled={withdrawSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors cursor-pointer"
              >
                {!user
                  ? 'Sign In to Submit Withdrawal Request'
                  : withdrawSubmitting
                  ? 'Submitting Request...'
                  : 'Submit Withdrawal Request'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 bg-[#121723] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-lg font-display font-bold text-white">
                Withdrawal Guidelines
              </h3>
              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <p>
                  <strong className="text-white">01. Minimum Limit:</strong> Withdrawal requests require a minimum amount of ₹{config.minWithdrawalAmount || 500}.00 and cannot exceed your available balance.
                </p>
                <p>
                  <strong className="text-white">02. Verified Banking Details:</strong> Please provide your active mobile number, Account Holder Name, Bank Account Number, and valid IFSC Code.
                </p>
                <p>
                  <strong className="text-white">03. Privacy & Masking:</strong> Sensitive bank account numbers are masked (<code className="text-rose-400 font-mono-tabular">•••• •••• 1234</code>) and never stored in client browser storage.
                </p>
                <p>
                  <strong className="text-white">04. Pending Review:</strong> Requests remain in a pending state until reviewed and approved by an authorized administrator.
                </p>
                <p>
                  <strong className="text-white">05. Automatic Refund on Rejection:</strong> If a pending request is rejected by the administrator, the reserved amount is automatically refunded back to your balance.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 text-xs text-slate-400">
              Track your request status and reference ID in the history below.
            </div>
          </div>
        </div>
      )}

      {/* REFER & EARN SECTION */}
      {subTab === 'referrals' && (
        <div className="space-y-6">
          {/* Top Referral Stats Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#121723] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
              <div className="text-xs text-slate-400 font-medium">Reward Per Friend</div>
              <div className="text-3xl font-display font-extrabold text-emerald-400 font-mono-tabular mt-2">
                +₹{Number(config.referralBonus ?? 50).toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Credited directly to your wallet balance
              </div>
            </div>

            <div className="bg-[#121723] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
              <div className="text-xs text-slate-400 font-medium">Friends Joined</div>
              <div className="text-3xl font-display font-extrabold text-white font-mono-tabular mt-2">
                {referralData?.totalReferred ?? user?.referralCount ?? 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Verified player accounts signed up
              </div>
            </div>

            <div className="bg-[#121723] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
              <div className="text-xs text-slate-400 font-medium">Total Referral Earnings</div>
              <div className="text-3xl font-display font-extrabold text-amber-400 font-mono-tabular mt-2">
                ₹{(referralData?.totalEarnings ?? user?.referralEarnings ?? 0).toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Earned with zero withdrawal restrictions
              </div>
            </div>
          </div>

          {/* Referral Code & Share Link Boxes */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7 bg-[#121723] border border-slate-800 rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-rose-500" />
                  <span>Your Referral Code & Link</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Share your exclusive code or direct sign-up link. When friends join, your reward is processed immediately.
                </p>
              </div>

              {/* Code Box */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Your Unique Referral Code
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-4 py-3 rounded-xl bg-[#0A0D14] border border-slate-700 font-mono-tabular font-bold text-lg text-rose-400 tracking-wider">
                    {referralData?.referralCode || user?.referralCode || user?.username.toUpperCase() || 'AVIATOR'}
                  </div>
                  <button
                    type="button"
                    onClick={copyReferralCode}
                    className={`flex items-center gap-1.5 px-4 py-3 rounded-xl text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
                      copiedCode
                        ? 'bg-emerald-600 text-white'
                        : 'bg-rose-600 hover:bg-rose-500 text-white'
                    }`}
                  >
                    {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                  </button>
                </div>
              </div>

              {/* Link Box */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Shareable Invite Link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={
                      referralData?.referralLink ||
                      (typeof window !== 'undefined'
                        ? `${window.location.origin}/?ref=${referralData?.referralCode || user?.referralCode || user?.username.toUpperCase() || ''}`
                        : '')
                    }
                    className="flex-1 px-3.5 py-3 rounded-xl bg-[#0A0D14] border border-slate-700 text-xs font-mono-tabular text-slate-300 truncate focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={copyReferralLink}
                    className={`flex items-center gap-1.5 px-4 py-3 rounded-xl text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
                      copiedLink
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                  >
                    {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                  </button>
                </div>
              </div>

              {/* Referral Guidelines */}
              <div className="p-4 rounded-xl bg-[#0A0D14] border border-slate-800 text-xs text-slate-400 space-y-2">
                <div className="font-semibold text-slate-200">How Refer & Earn Works:</div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                  <span>Share your referral code or link with friends, groups, or social channels.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                  <span>Your friend creates an account with your code automatically pre-filled.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                  <span>You receive ₹{Number(config.referralBonus ?? 50).toFixed(2)} instantly in your wallet to play or withdraw.</span>
                </div>
              </div>
            </div>

            {/* Referral Invite History */}
            <div className="lg:col-span-5 bg-[#121723] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h3 className="text-base font-display font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span>Invited Friends History</span>
                  </h3>
                  <span className="text-xs text-slate-400 font-mono-tabular">
                    {referralData?.history?.length ?? 0} Recorded
                  </span>
                </div>

                {!referralData?.history || referralData.history.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500">
                    No friends have joined via your referral link yet. Share your code to earn your first reward!
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                    {referralData.history.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-[#0A0D14] border border-slate-800/90 flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-white">@{item.referredUsername}</div>
                          <div className="text-[11px] text-slate-500">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono-tabular font-bold text-emerald-400">
                            +₹{item.rewardAmount.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-emerald-500/80 font-medium">Credited</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-800 text-xs text-slate-400">
                Referral bonuses are automatically tracked in your transaction ledger.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DEPOSIT / WITHDRAWAL REQUESTS & TRANSACTION HISTORY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Deposit & Withdrawal Requests */}
        <div className="lg:col-span-5 bg-[#121723] border border-slate-800 rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
            <h2 className="text-base font-display font-bold text-white">
              Deposit & Withdrawal Requests
            </h2>
            <span className="text-xs text-slate-400 font-mono-tabular">
              {requests.length} Total
            </span>
          </div>

          {requests.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              No deposit or withdrawal requests submitted yet.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="p-3.5 rounded-xl bg-[#0A0D14] border border-slate-800/90 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono-tabular font-semibold text-slate-200">
                      {req.id}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-semibold">
                      {req.status === 'PENDING' && (
                        <>
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-amber-400">Pending</span>
                        </>
                      )}
                      {req.status === 'APPROVED' && (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Approved</span>
                        </>
                      )}
                      {req.status === 'REJECTED' && (
                        <>
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span className="text-rose-400">Rejected</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      {req.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'}
                    </span>
                    <span className="font-mono-tabular font-bold text-white">
                      ₹{req.amount.toFixed(2)}
                    </span>
                  </div>

                  {/* Deposit Bonus and Total Credited Breakdown */}
                  {req.type === 'DEPOSIT' && req.bonusAmount !== undefined && req.bonusAmount > 0 && (
                    <div className="flex items-center justify-between text-[11px] font-mono-tabular text-emerald-400 pt-0.5">
                      <span>+{req.bonusPercent ?? 9}% Deposit Bonus:</span>
                      <span>+₹{req.bonusAmount.toFixed(2)} (Total: ₹{(req.creditedAmount ?? (req.amount + req.bonusAmount)).toFixed(2)})</span>
                    </div>
                  )}

                  {/* Bank & Payment Details with Masking */}
                  {(req.accountHolderName || req.maskedAccountNumber || req.ifscCode || req.mobileNumber || req.upiId) && (
                    <div className="text-xs text-slate-300 font-mono-tabular space-y-0.5 pt-1 border-t border-slate-800/60">
                      {req.accountHolderName && (
                        <div>Holder: <span className="text-white font-medium">{req.accountHolderName}</span></div>
                      )}
                      {req.maskedAccountNumber && (
                        <div>Bank A/C: <span className="text-slate-200 font-bold">{req.maskedAccountNumber}</span></div>
                      )}
                      {req.ifscCode && (
                        <div>IFSC: <span className="text-rose-400 font-bold">{req.ifscCode}</span></div>
                      )}
                      <div className="text-slate-400 flex flex-wrap gap-2">
                        {req.mobileNumber && <span>Mobile: {req.mobileNumber}</span>}
                        {req.upiId && <span>UPI: {req.upiId}</span>}
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
                    <span>{new Date(req.createdAt).toLocaleString()}</span>
                    {req.adminNote && (
                      <>
                        <span>·</span>
                        <span className="text-slate-300">{req.adminNote}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transaction History */}
        <div className="lg:col-span-7 bg-[#121723] border border-slate-800 rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
            <h2 className="text-base font-display font-bold text-white">
              Transaction History
            </h2>
            <span className="text-xs text-slate-400 font-mono-tabular">
              {transactions.length} Records
            </span>
          </div>

          {transactions.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              No transactions recorded yet.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {transactions.map((tx) => {
                const isPositive = tx.amount >= 0;
                return (
                  <div
                    key={tx.id}
                    className="p-3.5 rounded-xl bg-[#0A0D14] border border-slate-800/90 flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs font-semibold text-white">
                        {isPositive ? (
                          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <ArrowUpRight className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        )}
                        <span className="truncate">{tx.description}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-mono-tabular">
                        <span>ID: {tx.id}</span>
                        <span>·</span>
                        <span>Ref: {tx.referenceId}</span>
                        <span>·</span>
                        <span>{new Date(tx.createdAt).toLocaleString()}</span>
                        <span>·</span>
                        <span className="text-emerald-400/90">Completed</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono-tabular">
                      <div
                        className={`text-sm font-bold ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isPositive ? '+' : '-'}₹{Math.abs(tx.amount).toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-500">
                        Balance: ₹{tx.balanceAfter.toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
