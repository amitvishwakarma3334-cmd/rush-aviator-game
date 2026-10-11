import React from 'react';
import { BookOpen, CheckCircle2, Cloud, Database, ShieldCheck, X } from 'lucide-react';
import type { SystemStatusResponse } from '../types';

interface SetupGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemStatus: SystemStatusResponse | null;
}

export const SetupGuideModal: React.FC<SetupGuideModalProps> = ({
  isOpen,
  onClose,
  systemStatus,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
      <div className="bg-[#121723] border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-rose-400" />
            <h2 className="text-lg font-display font-bold text-white">
              Project Architecture & Documentation
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-300 leading-relaxed">
          {/* Active Storage Status */}
          <div className="p-4 rounded-xl bg-[#0A0D14] border border-slate-800 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>SYSTEM ARCHITECTURE & ACADEMIC DISCLOSURE</span>
            </div>
            <div className="text-xs text-slate-300">
              Active Database Engine:{' '}
              <span className="font-mono-tabular font-semibold text-white">
                {systemStatus?.storageMode || 'Persistent Local Database (./data/aviator-db.json)'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              This full-stack web application is designed as a college engineering project demonstrating real-time state synchronization, cryptographic SHA-256 round verification, scrypt password hashing, and role-based access control. All wallet balances, deposits, and withdrawal workflows are simulated on the backend server and do not process real-world banking transactions.
            </p>
          </div>

          {/* Section 1: Core Modules */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-white font-display font-bold text-base">
              <ShieldCheck className="w-4 h-4 text-rose-400" />
              <span>01. Security & Backend Validation</span>
            </div>
            <div className="space-y-2 text-xs text-slate-300 pl-6">
              <p>
                <strong className="text-white">Password Hashing & Sessions:</strong> User and administrator passwords are salted and hashed on the server using <code className="text-slate-200 font-mono-tabular">crypto.scryptSync</code> and verified with timing-safe comparison. Sessions use signed <code className="text-slate-200 font-mono-tabular">HttpOnly</code> cookies.
              </p>
              <p>
                <strong className="text-white">Server-Authoritative Game Loop:</strong> Crash multipliers are generated on the server prior to each round using a 256-bit cryptographic seed. Only the SHA-256 hash is shared before the round finishes, and the seed is revealed after the crash so outcomes can be independently verified.
              </p>
              <p>
                <strong className="text-white">Atomic Wallet Operations:</strong> Balance changes, deposit approvals, and withdrawal reservations (<code className="text-slate-200 font-mono-tabular">≥ ₹10.00</code>) are serialized through a server-side transaction lock to prevent race conditions or duplicate processing.
              </p>
            </div>
          </div>

          {/* Section 2: Database Configuration */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-white font-display font-bold text-base">
              <Database className="w-4 h-4 text-rose-400" />
              <span>02. Database Persistence (MongoDB Atlas & Local Storage)</span>
            </div>
            <div className="space-y-2 text-xs text-slate-300 pl-6">
              <p>
                By default, the server persists all users, balances, requests, and audit logs to <code className="text-slate-200 font-mono-tabular">./data/aviator-db.json</code> using atomic file writes.
              </p>
              <p>
                To connect a cloud MongoDB Atlas cluster, set the <code className="text-rose-300 font-mono-tabular">MONGODB_URI</code> environment variable in your server environment. The server automatically detects <code className="text-rose-300 font-mono-tabular">MONGODB_URI</code> on startup and switches to Mongoose models.
              </p>
            </div>
          </div>

          {/* Section 3: Environment Variables & Deployment */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-white font-display font-bold text-base">
              <Cloud className="w-4 h-4 text-rose-400" />
              <span>03. Environment Configuration & Deployment</span>
            </div>
            <div className="space-y-2 text-xs text-slate-300 pl-6">
              <p>
                Configure the following environment variables on your hosting service (never commit <code className="font-mono-tabular">.env</code> to version control):
              </p>
              <div className="p-3 rounded-lg bg-[#0A0D14] border border-slate-800 font-mono-tabular text-xs text-slate-300 space-y-1">
                <div>NODE_ENV=production</div>
                <div>MONGODB_URI=mongodb+srv://...</div>
                <div>SESSION_SECRET=your_random_session_secret</div>
                <div>ADMIN_USERNAME=your_admin_username</div>
                <div>ADMIN_PASSWORD=your_admin_password</div>
                <div>DEFAULT_WELCOME_BONUS=500</div>
              </div>
              <p>
                <strong className="text-white">Build Command:</strong> <code className="text-emerald-300 font-mono-tabular">npm install && npm run build</code> · <strong className="text-white">Start Command:</strong> <code className="text-emerald-300 font-mono-tabular">npm run start</code>
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
