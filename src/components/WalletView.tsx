import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  RefreshCw,
  Wallet,
  XCircle,
} from 'lucide-react';
import type { AppConfigRecord, TransactionRecord, TransferRequestRecord, User } from '../types';
import { UPLOADED_QR_DATA_URI } from '../utils/qrImage';
import { apiFetch } from '../utils/api';

interface WalletViewProps {
  user: User | null;
  onBalanceChange: (newBalance: number) => void;
  onRequireLogin: () => void;
  initialSubTab?: 'overview' | 'deposit' | 'withdraw';
}

export const WalletView: React.FC<WalletViewProps> = ({
  user,
  onBalanceChange,
  onRequireLogin,
  initialSubTab = 'deposit',
}) => {
  const [subTab, setSubTab] = useState<'overview' | 'deposit' | 'withdraw'>(initialSubTab);
  const [loading, setLoading] = useState<boolean>(true);
  const [balance, setBalance] = useState<number>(user?.balance ?? 0);
  const [config, setConfig] = useState<AppConfigRecord>({
    welcomeBonus: 500,
    placeholderQrUrl: UPLOADED_QR_DATA_URI,
  });
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [requests, setRequests] = useState<TransferRequestRecord[]>([]);

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
        setConfig({
          welcomeBonus: sysData.welcomeBonus ?? 500,
          placeholderQrUrl: sysData.placeholderQrUrl || UPLOADED_QR_DATA_URI,
        });
      }

      if (!user) {
        setLoading(false);
        return;
      }

      const res = await apiFetch('/api/wallet/summary');
      if (!res.ok) return;
      const data = await res.json();
      setBalance(data.balance);
      onBalanceChange(data.balance);
      if (data.config) {
        setConfig({
          welcomeBonus: data.config.welcomeBonus,
          placeholderQrUrl: data.config.placeholderQrUrl || UPLOADED_QR_DATA_URI,
        });
      }
      setTransactions(data.transactions || []);
      setRequests(data.requests || []);
    } catch (err) {
      console.error('Failed to fetch wallet summary:', err);
    } finally {
      setLoading(false);
    }
  }, [user, onBalanceChange]);

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
        setDepositFeedback({
          type: 'success',
          message: `Deposit request submitted. Reference ID: ${data.request.id} · Status: Pending`,
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
    if (!Number.isFinite(num) || num < 10) {
      setWithdrawFeedback({
        type: 'error',
        message: 'Minimum withdrawal amount is ₹10.00.',
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
                Enter your withdrawal amount (minimum ₹10.00), mobile number, and verified bank account details.
              </p>
            </div>

            <form onSubmit={handleWithdrawSubmit} className="space-y-4 pt-2">
              {/* Amount & Presets */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-slate-300">
                    Withdrawal Amount (Minimum ₹10) *
                  </span>
                  <span className="text-slate-400 font-mono-tabular">
                    Balance: ₹{balance.toFixed(2)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-2.5">
                  {[10, 50, 100, 250, 500].map((preset) => (
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
                  min="10"
                  step="0.01"
                  required
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0D14] border border-slate-700 text-white font-mono-tabular text-sm focus:outline-none focus:border-rose-500"
                  placeholder="Minimum ₹10.00"
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
                  <strong className="text-white">01. Minimum Limit:</strong> Withdrawal requests require a minimum amount of ₹10.00 and cannot exceed your available balance.
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
