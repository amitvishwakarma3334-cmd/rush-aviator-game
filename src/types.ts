export interface User {
  id: string;
  username: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  balance: number;
  welcomeBonusAwarded: boolean;
  createdAt: string;
}

export interface ActiveBetPublic {
  username: string;
  slotId?: string;
  amount: number;
  cashedOut: boolean;
  cashoutMultiplier: number | null;
  payout: number | null;
}

export interface MyActiveBet extends ActiveBetPublic {
  betId: string;
  userId: string;
  slotId: string;
  autoCashout: number | null;
}

export interface BettingSlotConfig {
  id: string;
  label: string;
  badge: string;
  defaultAmount: string;
  defaultAutoCashout: string;
}

export interface CrashRoundHistoryItem {
  roundId: string;
  crashPoint: number;
  serverSeedHash: string;
  serverSeed: string;
  completedAt: string;
}

export interface GameStateResponse {
  roundId: string;
  phase: 'BETTING' | 'FLYING' | 'CRASHED';
  multiplier: number;
  countdownMs: number;
  serverSeedHash: string;
  crashPoint: number | null;
  serverSeed: string | null;
  activeBets: ActiveBetPublic[];
  myBet: MyActiveBet | null;
  myBets: MyActiveBet[];
  recentHistory: CrashRoundHistoryItem[];
  userBalance: number | null;
}

export interface TransactionRecord {
  id: string;
  userId: string;
  username: string;
  type:
    | 'WELCOME_BONUS'
    | 'GAME_BET'
    | 'GAME_WIN'
    | 'DEPOSIT_APPROVED'
    | 'WITHDRAWAL_RESERVE'
    | 'WITHDRAWAL_REFUND'
    | 'ADMIN_ADJUSTMENT';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceId: string;
  description: string;
  createdAt: string;
}

export interface TransferRequestRecord {
  id: string;
  userId: string;
  username: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  mobileNumber?: string;
  accountHolderName?: string;
  bankAccountNumber?: string;
  maskedAccountNumber?: string;
  ifscCode?: string;
  upiId?: string;
  userNote: string;
  adminNote: string;
  processedBy: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  adminId: string;
  adminUsername: string;
  action: string;
  targetUserId?: string | null;
  targetUsername: string | null;
  amount?: number | null;
  reason?: string | null;
  details: string;
  createdAt: string;
}

export interface AppConfigRecord {
  welcomeBonus: number;
  placeholderQrUrl: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface SystemStatusResponse {
  storageMode: string;
  mongoConfigured: boolean;
  welcomeBonus: number;
  placeholderQrUrl?: string;
  totalUsers: number;
}
