import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { UPLOADED_QR_DATA_URI } from './src/utils/qrImage.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface UserRecord {
  id: string;
  username: string;
  usernameLower: string;
  passwordHash: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  balance: number;
  welcomeBonusAwarded: boolean;
  referralCode: string;
  referredBy?: string | null;
  referralCount: number;
  referralEarnings: number;
  createdAt: string;
}

export interface ReferralRecord {
  id: string;
  referrerId: string;
  referrerUsername: string;
  referredUserId: string;
  referredUsername: string;
  rewardAmount: number;
  status: 'COMPLETED';
  createdAt: string;
}

export interface TransactionRecord {
  id: string;
  userId: string;
  username: string;
  type:
    | 'WELCOME_BONUS'
    | 'GAME_BET'
    | 'GAME_WIN'
    | 'QUEUED_BET'
    | 'QUEUED_BET_REFUND'
    | 'DEPOSIT_APPROVED'
    | 'DEPOSIT_BONUS'
    | 'WITHDRAWAL_RESERVE'
    | 'WITHDRAWAL_REFUND'
    | 'ADMIN_ADJUSTMENT'
    | 'REFERRAL_REWARD';
  amount: number; // positive for credit, negative for debit
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
  bonusAmount?: number;
  bonusPercent?: number;
  creditedAmount?: number;
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
  logoUrl?: string;
  loadingLogoUrl?: string;
  depositBonusEnabled?: boolean;
  depositBonusPercent?: number;
  minWithdrawalAmount?: number;
  referralBonus?: number;
  houseEdgePercent?: number;
  maxMultiplier?: number;
  bettingDurationMs?: number;
  crashedHoldMs?: number;
  updatedAt: string;
  updatedBy: string;
}

export interface SessionRecord {
  token: string;
  userId: string;
  role: 'user' | 'admin';
  expiresAt: number;
}

interface DatabaseSchema {
  users: UserRecord[];
  transactions: TransactionRecord[];
  requests: TransferRequestRecord[];
  auditLogs: AuditLogRecord[];
  referrals: ReferralRecord[];
  config: AppConfigRecord;
  sessions: SessionRecord[];
}

// ============================================================================
// DEFAULT DEMO PLACEHOLDER QR SVG (100% SIMULATED / DEMO ONLY)
// ============================================================================

const DEFAULT_QR_IMAGE = UPLOADED_QR_DATA_URI;

// ============================================================================
// CRYPTOGRAPHIC HELPERS (PASSWORD HASHING & TOKENS)
// ============================================================================

const SESSION_SECRET = process.env.SESSION_SECRET || 'aviator_demo_default_session_secret_2026';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  if (keyBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
}

function generateSignedToken(): string {
  const raw = crypto.randomBytes(32).toString('hex');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(raw).digest('hex');
  return `${raw}.${sig}`;
}

function roundCoins(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ============================================================================
// MONGOOSE SCHEMAS (USED WHEN MONGODB_URI IS CONFIGURED)
// ============================================================================

const UserSchema = new mongoose.Schema<UserRecord>({
  id: { type: String, required: true, unique: true, index: true },
  username: { type: String, required: true },
  usernameLower: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], required: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  balance: { type: Number, required: true, default: 0 },
  welcomeBonusAwarded: { type: Boolean, default: false },
  referralCode: { type: String, default: '' },
  referredBy: { type: String, default: null },
  referralCount: { type: Number, default: 0 },
  referralEarnings: { type: Number, default: 0 },
  createdAt: { type: String, required: true },
});

const TransactionSchema = new mongoose.Schema<TransactionRecord>({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  username: { type: String, required: true },
  type: { type: String, required: true },
  amount: { type: Number, required: true },
  balanceBefore: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  referenceId: { type: String, required: true },
  description: { type: String, required: true },
  createdAt: { type: String, required: true },
});

const TransferRequestSchema = new mongoose.Schema<TransferRequestRecord>({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  username: { type: String, required: true },
  type: { type: String, enum: ['DEPOSIT', 'WITHDRAWAL'], required: true },
  amount: { type: Number, required: true },
  bonusAmount: { type: Number, default: 0 },
  bonusPercent: { type: Number, default: 9 },
  creditedAmount: { type: Number, default: 0 },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  mobileNumber: { type: String, default: '' },
  accountHolderName: { type: String, default: '' },
  bankAccountNumber: { type: String, default: '' },
  maskedAccountNumber: { type: String, default: '' },
  ifscCode: { type: String, default: '' },
  upiId: { type: String, default: '' },
  userNote: { type: String, default: '' },
  adminNote: { type: String, default: '' },
  processedBy: { type: String, default: null },
  processedAt: { type: String, default: null },
  createdAt: { type: String, required: true },
});

const AuditLogSchema = new mongoose.Schema<AuditLogRecord>({
  id: { type: String, required: true, unique: true },
  adminId: { type: String, required: true },
  adminUsername: { type: String, required: true },
  action: { type: String, required: true },
  targetUserId: { type: String, default: null },
  targetUsername: { type: String, default: null },
  amount: { type: Number, default: null },
  reason: { type: String, default: null },
  details: { type: String, required: true },
  createdAt: { type: String, required: true },
});

const ReferralSchema = new mongoose.Schema<ReferralRecord>({
  id: { type: String, required: true, unique: true },
  referrerId: { type: String, required: true, index: true },
  referrerUsername: { type: String, required: true },
  referredUserId: { type: String, required: true, index: true },
  referredUsername: { type: String, required: true },
  rewardAmount: { type: Number, required: true },
  status: { type: String, default: 'COMPLETED' },
  createdAt: { type: String, required: true },
});

const ConfigSchema = new mongoose.Schema<AppConfigRecord>({
  welcomeBonus: { type: Number, required: true },
  placeholderQrUrl: { type: String, required: true },
  logoUrl: { type: String, default: '' },
  loadingLogoUrl: { type: String, default: '' },
  depositBonusEnabled: { type: Boolean, default: true },
  depositBonusPercent: { type: Number, default: 9 },
  minWithdrawalAmount: { type: Number, default: 500 },
  referralBonus: { type: Number, default: 50 },
  houseEdgePercent: { type: Number, default: 3 },
  maxMultiplier: { type: Number, default: 250 },
  bettingDurationMs: { type: Number, default: 5000 },
  crashedHoldMs: { type: Number, default: 3500 },
  updatedAt: { type: String, required: true },
  updatedBy: { type: String, required: true },
});

const SessionSchema = new mongoose.Schema<SessionRecord>({
  token: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], required: true },
  expiresAt: { type: Number, required: true },
});

const UserModel = mongoose.models.User || mongoose.model<UserRecord>('User', UserSchema);
const TransactionModel = mongoose.models.Transaction || mongoose.model<TransactionRecord>('Transaction', TransactionSchema);
const TransferRequestModel = mongoose.models.TransferRequest || mongoose.model<TransferRequestRecord>('TransferRequest', TransferRequestSchema);
const AuditLogModel = mongoose.models.AuditLog || mongoose.model<AuditLogRecord>('AuditLog', AuditLogSchema);
const ReferralModel = mongoose.models.Referral || mongoose.model<ReferralRecord>('Referral', ReferralSchema);
const ConfigModel = mongoose.models.Config || mongoose.model<AppConfigRecord>('Config', ConfigSchema);
const SessionModel = mongoose.models.Session || mongoose.model<SessionRecord>('Session', SessionSchema);

// ============================================================================
// PERSISTENT STORAGE ENGINE (HYBRID MONGODB ATLAS + ATOMIC DISK STORAGE)
// ============================================================================

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE_PATH = path.join(DATA_DIR, 'aviator-db.json');

let useMongo = false;
let dbState: DatabaseSchema = {
  users: [],
  transactions: [],
  requests: [],
  auditLogs: [],
  referrals: [],
  config: {
    welcomeBonus: Number(process.env.DEFAULT_WELCOME_BONUS) || 500,
    placeholderQrUrl: DEFAULT_QR_IMAGE,
    logoUrl: '',
    loadingLogoUrl: '',
    depositBonusEnabled: true,
    depositBonusPercent: 9,
    minWithdrawalAmount: 500,
    referralBonus: 50,
    houseEdgePercent: 3,
    maxMultiplier: 250,
    bettingDurationMs: 5000,
    crashedHoldMs: 3500,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  },
  sessions: [],
};

// Mutex lock to prevent race conditions or concurrent balance corruption
let operationQueue: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const next = operationQueue.then(() => fn());
  operationQueue = next.catch(() => {});
  return next;
}

function normalizeUserRecord(u: Partial<UserRecord>): UserRecord {
  const cleanUsername = (u.username || 'user').trim();
  const refCode = (u.referralCode || cleanUsername.toUpperCase()).trim();
  return {
    id: u.id || `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    username: cleanUsername,
    usernameLower: (u.usernameLower || cleanUsername).toLowerCase(),
    passwordHash: u.passwordHash || '',
    role: u.role === 'admin' ? 'admin' : 'user',
    status: u.status === 'suspended' ? 'suspended' : 'active',
    balance: roundCoins(Number(u.balance) || 0),
    welcomeBonusAwarded: Boolean(u.welcomeBonusAwarded),
    referralCode: refCode,
    referredBy: u.referredBy || null,
    referralCount: Number(u.referralCount) || 0,
    referralEarnings: roundCoins(Number(u.referralEarnings) || 0),
    createdAt: u.createdAt || new Date().toISOString(),
  };
}

function saveLocalDiskDb(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tempFile = `${DB_FILE_PATH}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(dbState, null, 2), 'utf8');
  fs.renameSync(tempFile, DB_FILE_PATH);
}

async function initDatabase(): Promise<void> {
  mongoose.set('bufferCommands', false);
  const mongoUri = process.env.MONGODB_URI?.trim();
  if (mongoUri && (mongoUri.startsWith('mongodb://') || mongoUri.startsWith('mongodb+srv://'))) {
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
      useMongo = true;
      console.log('Connected to MongoDB Atlas database.');
    } catch (err) {
      console.warn('MongoDB connection failed, falling back to persistent local disk database:', err);
      useMongo = false;
    }
  }

  if (useMongo) {
    // Load existing Mongo documents into memory state and keep them synced
    const [users, transactions, requests, auditLogs, referrals, configDoc, sessions] = await Promise.all([
      UserModel.find().lean(),
      TransactionModel.find().sort({ createdAt: -1 }).limit(1000).lean(),
      TransferRequestModel.find().sort({ createdAt: -1 }).lean(),
      AuditLogModel.find().sort({ createdAt: -1 }).limit(500).lean(),
      ReferralModel.find().sort({ createdAt: -1 }).lean(),
      ConfigModel.findOne().lean(),
      SessionModel.find().lean(),
    ]);

    dbState.users = (users as Partial<UserRecord>[]).map(normalizeUserRecord);
    dbState.transactions = transactions as TransactionRecord[];
    dbState.requests = requests as TransferRequestRecord[];
    dbState.auditLogs = auditLogs as AuditLogRecord[];
    dbState.referrals = (referrals as ReferralRecord[]) || [];
    dbState.sessions = sessions as SessionRecord[];

    if (configDoc) {
      dbState.config = {
        welcomeBonus: configDoc.welcomeBonus,
        placeholderQrUrl: configDoc.placeholderQrUrl,
        logoUrl: configDoc.logoUrl || '',
        loadingLogoUrl: configDoc.loadingLogoUrl || '',
        depositBonusEnabled: configDoc.depositBonusEnabled !== false,
        depositBonusPercent: configDoc.depositBonusPercent ?? 9,
        minWithdrawalAmount: configDoc.minWithdrawalAmount ?? 500,
        referralBonus: configDoc.referralBonus ?? 50,
        houseEdgePercent: configDoc.houseEdgePercent ?? 3,
        maxMultiplier: configDoc.maxMultiplier ?? 250,
        bettingDurationMs: configDoc.bettingDurationMs ?? 5000,
        crashedHoldMs: configDoc.crashedHoldMs ?? 3500,
        updatedAt: configDoc.updatedAt,
        updatedBy: configDoc.updatedBy,
      };
    } else {
      await ConfigModel.create(dbState.config);
    }
  } else {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE_PATH)) {
      try {
        const raw = fs.readFileSync(DB_FILE_PATH, 'utf8');
        const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
        if (parsed.users) dbState.users = parsed.users.map(normalizeUserRecord);
        if (parsed.transactions) dbState.transactions = parsed.transactions;
        if (parsed.requests) dbState.requests = parsed.requests;
        if (parsed.auditLogs) dbState.auditLogs = parsed.auditLogs;
        if (parsed.referrals) dbState.referrals = parsed.referrals;
        if (parsed.config) {
          dbState.config = {
            ...dbState.config,
            ...parsed.config,
            loadingLogoUrl: parsed.config.loadingLogoUrl || '',
            depositBonusEnabled: parsed.config.depositBonusEnabled !== false,
            depositBonusPercent: parsed.config.depositBonusPercent ?? 9,
            minWithdrawalAmount: parsed.config.minWithdrawalAmount ?? 500,
            referralBonus: parsed.config.referralBonus ?? 50,
            houseEdgePercent: parsed.config.houseEdgePercent ?? 3,
            maxMultiplier: parsed.config.maxMultiplier ?? 250,
            bettingDurationMs: parsed.config.bettingDurationMs ?? 5000,
            crashedHoldMs: parsed.config.crashedHoldMs ?? 3500,
          };
          // Upgrade any legacy placeholder SVG to the latest 45x45 uploaded slice QR code
          if (
            !dbState.config.placeholderQrUrl ||
            dbState.config.placeholderQrUrl.includes('DEMO ONLY') ||
            dbState.config.placeholderQrUrl.includes('viewBox%3D%220%200%20440%20600%22')
          ) {
            dbState.config.placeholderQrUrl = DEFAULT_QR_IMAGE;
          }
        }
        if (parsed.sessions) dbState.sessions = parsed.sessions;
      } catch (err) {
        console.error('Error reading aviator-db.json, initializing clean state:', err);
      }
    }
  }

  // Ensure initial administrator account exists
  const adminUsername = (process.env.ADMIN_USERNAME || 'admin').trim();
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminDemoPassword123!';
  const existingAdmin = dbState.users.find((u) => u.role === 'admin');

  if (!existingAdmin) {
    const newAdmin: UserRecord = {
      id: `usr_admin_${crypto.randomBytes(4).toString('hex')}`,
      username: adminUsername,
      usernameLower: adminUsername.toLowerCase(),
      passwordHash: hashPassword(adminPassword),
      role: 'admin',
      status: 'active',
      balance: 0,
      welcomeBonusAwarded: false,
      referralCode: 'ADMIN',
      referralCount: 0,
      referralEarnings: 0,
      createdAt: new Date().toISOString(),
    };
    dbState.users.push(newAdmin);
    if (useMongo) {
      await UserModel.create(newAdmin);
    }
  }

  if (!useMongo) {
    saveLocalDiskDb();
  }
}

async function persistChange(options?: {
  user?: UserRecord;
  transaction?: TransactionRecord;
  request?: TransferRequestRecord;
  auditLog?: AuditLogRecord;
  referral?: ReferralRecord;
  config?: AppConfigRecord;
  session?: SessionRecord;
  deleteSessionToken?: string;
}): Promise<void> {
  if (!useMongo) {
    saveLocalDiskDb();
    return;
  }
  const tasks: Promise<unknown>[] = [];
  if (options?.user) {
    tasks.push(UserModel.findOneAndUpdate({ id: options.user.id }, options.user, { upsert: true }).exec());
  }
  if (options?.transaction) {
    tasks.push(TransactionModel.create(options.transaction));
  }
  if (options?.request) {
    tasks.push(
      TransferRequestModel.findOneAndUpdate({ id: options.request.id }, options.request, { upsert: true }).exec()
    );
  }
  if (options?.auditLog) {
    tasks.push(AuditLogModel.create(options.auditLog));
  }
  if (options?.referral) {
    tasks.push(ReferralModel.create(options.referral));
  }
  if (options?.config) {
    tasks.push(ConfigModel.findOneAndUpdate({}, options.config, { upsert: true }).exec());
  }
  if (options?.session) {
    tasks.push(
      SessionModel.findOneAndUpdate({ token: options.session.token }, options.session, { upsert: true }).exec()
    );
  }
  if (options?.deleteSessionToken) {
    tasks.push(SessionModel.deleteOne({ token: options.deleteSessionToken }).exec());
  }
  await Promise.all(tasks);
}

// ============================================================================
// SERVER-VALIDATED AVIATOR CRASH GAME ENGINE
// ============================================================================

interface ActiveRoundBet {
  betId: string;
  userId: string;
  username: string;
  slotId: string;
  amount: number;
  autoCashout: number | null;
  cashedOut: boolean;
  cashoutMultiplier: number | null;
  payout: number | null;
}

interface CrashRoundHistoryItem {
  roundId: string;
  crashPoint: number;
  serverSeedHash: string;
  serverSeed: string;
  completedAt: string;
}

export interface QueuedRoundBet {
  queueId: string;
  userId: string;
  username: string;
  slotId: string;
  amount: number;
  autoCashout: number | null;
  targetRoundId: string;
  status: 'QUEUED' | 'CANCELLED' | 'COMMITTED' | 'REJECTED' | 'SETTLED';
  createdAt: string;
  committedBetId?: string;
  idempotencyKey?: string;
}

interface LiveGameEngineState {
  roundId: string;
  phase: 'BETTING' | 'FLYING' | 'CRASHED';
  multiplier: number;
  crashPoint: number;
  serverSeed: string;
  serverSeedHash: string;
  phaseStartTime: number;
  bettingDurationMs: number;
  crashedHoldMs: number;
  bets: ActiveRoundBet[];
  queuedBets: QueuedRoundBet[];
  recentHistory: CrashRoundHistoryItem[];
  nextRound: {
    roundId: string;
    serverSeed: string;
    serverSeedHash: string;
    crashPoint: number;
  };
}

function generateProvablyFairCrashPoint(): {
  roundId: string;
  serverSeed: string;
  serverSeedHash: string;
  crashPoint: number;
} {
  const roundId = `FLT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const serverSeedHash = crypto.createHash('sha256').update(`${roundId}:${serverSeed}`).digest('hex');

  // Use first 52 bits of hash for provably fair crash multiplier distribution
  const hexSlice = serverSeedHash.slice(0, 13);
  const intVal = parseInt(hexSlice, 16);
  const maxVal = Math.pow(2, 52);
  const r = intVal / maxVal;

  // Transparent, auditable crash curve calculated for future rounds
  const houseEdgePercent = Math.max(1, Math.min(15, Number(dbState.config.houseEdgePercent) || 3));
  const houseEdgeRatio = houseEdgePercent / 100;
  if (r < houseEdgeRatio) {
    return { roundId, serverSeed, serverSeedHash, crashPoint: 1.0 };
  }
  const factor = 1 - houseEdgeRatio;
  const rawMultiplier = factor / (1 - r);
  const maxCap = Math.max(10, Math.min(1000, Number(dbState.config.maxMultiplier) || 250.0));
  const clamped = Math.max(1.01, Math.min(maxCap, Math.floor(rawMultiplier * 100) / 100));
  return { roundId, serverSeed, serverSeedHash, crashPoint: clamped };
}

const initialSeed = generateProvablyFairCrashPoint();
const initialNextSeed = generateProvablyFairCrashPoint();

// Pre-populate 10 realistic historical rounds so the history ribbon looks complete immediately
const initialHistory: CrashRoundHistoryItem[] = [];
for (let i = 10; i >= 1; i--) {
  const sample = generateProvablyFairCrashPoint();
  initialHistory.push({
    roundId: sample.roundId,
    crashPoint: sample.crashPoint,
    serverSeedHash: sample.serverSeedHash,
    serverSeed: sample.serverSeed,
    completedAt: new Date(Date.now() - i * 15000).toISOString(),
  });
}

const gameEngine: LiveGameEngineState = {
  roundId: initialSeed.roundId,
  phase: 'BETTING',
  multiplier: 1.0,
  crashPoint: initialSeed.crashPoint,
  serverSeed: initialSeed.serverSeed,
  serverSeedHash: initialSeed.serverSeedHash,
  phaseStartTime: Date.now(),
  bettingDurationMs: 5000,
  crashedHoldMs: 3500,
  bets: [],
  queuedBets: [],
  recentHistory: initialHistory,
  nextRound: initialNextSeed,
};

async function processSingleCashout(bet: ActiveRoundBet, cashoutMult: number): Promise<void> {
  if (bet.cashedOut) return;
  bet.cashedOut = true;
  bet.cashoutMultiplier = cashoutMult;
  const payout = roundCoins(bet.amount * cashoutMult);
  bet.payout = payout;

  const user = dbState.users.find((u) => u.id === bet.userId);
  if (!user) return;

  const balanceBefore = user.balance;
  user.balance = roundCoins(user.balance + payout);
  const tx: TransactionRecord = {
    id: `tx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    userId: user.id,
    username: user.username,
    type: 'GAME_WIN',
    amount: payout,
    balanceBefore,
    balanceAfter: user.balance,
    referenceId: gameEngine.roundId,
    description: `Cashed out at ${cashoutMult.toFixed(2)}x on round ${gameEngine.roundId}`,
    createdAt: new Date().toISOString(),
  };
  dbState.transactions.unshift(tx);
  await persistChange({ user, transaction: tx });
}

function syncGameClock(): void {
  const now = Date.now();
  const elapsed = now - gameEngine.phaseStartTime;

  if (gameEngine.phase === 'BETTING') {
    if (elapsed >= gameEngine.bettingDurationMs) {
      gameEngine.phase = 'FLYING';
      gameEngine.phaseStartTime = now;
      gameEngine.multiplier = 1.0;
    }
  } else if (gameEngine.phase === 'FLYING') {
    const tSeconds = elapsed / 1000;
    // Smooth exponential climb: 1.00x -> ~1.91x in 10s -> ~3.66x in 20s -> etc.
    const nextMult = Math.floor(Math.exp(0.068 * tSeconds) * 100) / 100;

    // Check auto-cashouts that triggered before or at crashPoint
    for (const bet of gameEngine.bets) {
      if (
        !bet.cashedOut &&
        bet.autoCashout !== null &&
        bet.autoCashout <= gameEngine.crashPoint &&
        nextMult >= bet.autoCashout
      ) {
        const targetMult = bet.autoCashout;
        withLock(() => processSingleCashout(bet, targetMult)).catch((e) =>
          console.error('Auto-cashout error:', e)
        );
      }
    }

    if (nextMult >= gameEngine.crashPoint) {
      gameEngine.multiplier = gameEngine.crashPoint;
      gameEngine.phase = 'CRASHED';
      gameEngine.phaseStartTime = now;
      gameEngine.recentHistory.unshift({
        roundId: gameEngine.roundId,
        crashPoint: gameEngine.crashPoint,
        serverSeedHash: gameEngine.serverSeedHash,
        serverSeed: gameEngine.serverSeed,
        completedAt: new Date().toISOString(),
      });
      if (gameEngine.recentHistory.length > 20) {
        gameEngine.recentHistory.pop();
      }
    } else {
      gameEngine.multiplier = nextMult;
    }
  } else if (gameEngine.phase === 'CRASHED') {
    if (elapsed >= gameEngine.crashedHoldMs) {
      const nextRoundInfo = gameEngine.nextRound;
      gameEngine.roundId = nextRoundInfo.roundId;
      gameEngine.crashPoint = nextRoundInfo.crashPoint;
      gameEngine.serverSeed = nextRoundInfo.serverSeed;
      gameEngine.serverSeedHash = nextRoundInfo.serverSeedHash;
      gameEngine.nextRound = generateProvablyFairCrashPoint();
      gameEngine.phase = 'BETTING';
      gameEngine.multiplier = 1.0;
      gameEngine.phaseStartTime = now;
      gameEngine.bettingDurationMs = Math.max(2000, Number(dbState.config.bettingDurationMs) || 5000);
      gameEngine.crashedHoldMs = Math.max(1500, Number(dbState.config.crashedHoldMs) || 3500);
      // Commit queued bets into active bets for this new round
      const activeFromQueued: ActiveRoundBet[] = [];
      for (const q of gameEngine.queuedBets) {
        if (q.status === 'QUEUED') {
          activeFromQueued.push({
            betId: q.committedBetId || `bet_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
            userId: q.userId,
            username: q.username,
            slotId: q.slotId || 'slot-1',
            amount: q.amount,
            autoCashout: q.autoCashout,
            cashedOut: false,
            cashoutMultiplier: null,
            payout: null,
          });
        }
      }
      gameEngine.bets = activeFromQueued;
      gameEngine.queuedBets = [];
    }
  }
}

function startGameLoop(): void {
  setInterval(() => {
    syncGameClock();
  }, 80);
}

// ============================================================================
// AUTHENTICATION & SESSION HELPERS
// ============================================================================

function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const k = pair.slice(0, idx).trim();
      const v = decodeURIComponent(pair.slice(idx + 1).trim());
      result[k] = v;
    }
  }
  return result;
}

function getSessionFromRequest(req: Request): { session: SessionRecord; user: UserRecord } | null {
  const cookies = parseCookies(req.headers.cookie);
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const token = bearerToken || cookies['aviator_session'];
  if (!token) return null;

  const session = dbState.sessions.find((s) => s.token === token);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    dbState.sessions = dbState.sessions.filter((s) => s.token !== token);
    persistChange({ deleteSessionToken: token }).catch(() => {});
    return null;
  }

  const user = dbState.users.find((u) => u.id === session.userId);
  if (!user) return null;

  return { session, user };
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const maxAgeSec = 24 * 60 * 60;
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const sameSiteAndSecure = isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax';
  res.setHeader(
    'Set-Cookie',
    `aviator_session=${encodeURIComponent(token)}; Path=/; HttpOnly; ${sameSiteAndSecure}; Max-Age=${maxAgeSec}`
  );
}

function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const sameSiteAndSecure = isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax';
  res.setHeader('Set-Cookie', `aviator_session=; Path=/; HttpOnly; ${sameSiteAndSecure}; Max-Age=0`);
}

function requireUser(req: Request, res: Response, next: NextFunction): void {
  const auth = getSessionFromRequest(req);
  if (!auth) {
    res.status(401).json({ error: 'Your session has expired or you are not logged in. Please sign in.' });
    return;
  }
  if (auth.user.status === 'suspended') {
    res.status(403).json({ error: 'This account has been suspended by an administrator.' });
    return;
  }
  (req as Request & { currentUser?: UserRecord; currentSession?: SessionRecord }).currentUser = auth.user;
  (req as Request & { currentUser?: UserRecord; currentSession?: SessionRecord }).currentSession = auth.session;
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = getSessionFromRequest(req);
  if (!auth) {
    res.status(401).json({ error: 'Administrator authentication required.' });
    return;
  }
  if (auth.user.role !== 'admin') {
    res.status(403).json({ error: 'Access denied. Administrator privileges are required for this action.' });
    return;
  }
  if (auth.user.status === 'suspended') {
    res.status(403).json({ error: 'Administrator account is suspended.' });
    return;
  }
  (req as Request & { currentUser?: UserRecord; currentSession?: SessionRecord }).currentUser = auth.user;
  (req as Request & { currentUser?: UserRecord; currentSession?: SessionRecord }).currentSession = auth.session;
  next();
}

// ============================================================================
// EXPRESS SERVER & API ROUTES
// ============================================================================

async function startServer() {
  await initDatabase();
  startGameLoop();

  const app = express();
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // --------------------------------------------------------------------------
  // SYSTEM & SETUP STATUS ENDPOINT (NO ADMIN CREDENTIALS EXPOSED)
  // --------------------------------------------------------------------------
  app.get('/api/system/status', (_req: Request, res: Response) => {
    res.json({
      storageMode: useMongo ? 'MongoDB Atlas Cloud' : 'Persistent Local Database (./data/aviator-db.json)',
      mongoConfigured: useMongo,
      welcomeBonus: dbState.config.welcomeBonus,
      placeholderQrUrl: dbState.config.placeholderQrUrl || DEFAULT_QR_IMAGE,
      logoUrl: dbState.config.logoUrl || '',
      loadingLogoUrl: dbState.config.loadingLogoUrl || '',
      depositBonusEnabled: dbState.config.depositBonusEnabled !== false,
      depositBonusPercent: dbState.config.depositBonusPercent ?? 9,
      minWithdrawalAmount: dbState.config.minWithdrawalAmount ?? 500,
      referralBonus: dbState.config.referralBonus ?? 50,
      totalUsers: dbState.users.filter((u) => u.role === 'user').length,
    });
  });

  // --------------------------------------------------------------------------
  // AUTHENTICATION ENDPOINTS (USER & ADMIN)
  // --------------------------------------------------------------------------
  app.get('/api/auth/me', (req: Request, res: Response) => {
    const auth = getSessionFromRequest(req);
    if (!auth) {
      res.json({ user: null });
      return;
    }
    const u = auth.user;
    res.json({
      user: {
        id: u.id,
        username: u.username,
        role: u.role,
        status: u.status,
        balance: u.balance,
        welcomeBonusAwarded: u.welcomeBonusAwarded,
        referralCode: u.referralCode || u.username.toUpperCase(),
        referredBy: u.referredBy || null,
        referralCount: u.referralCount || 0,
        referralEarnings: u.referralEarnings || 0,
        createdAt: u.createdAt,
      },
      config: {
        welcomeBonus: dbState.config.welcomeBonus,
        placeholderQrUrl: dbState.config.placeholderQrUrl,
        logoUrl: dbState.config.logoUrl || '',
        loadingLogoUrl: dbState.config.loadingLogoUrl || '',
        depositBonusEnabled: dbState.config.depositBonusEnabled !== false,
        depositBonusPercent: dbState.config.depositBonusPercent ?? 9,
        minWithdrawalAmount: dbState.config.minWithdrawalAmount ?? 500,
        referralBonus: dbState.config.referralBonus ?? 50,
      },
    });
  });

  app.post('/api/auth/signup', async (req: Request, res: Response) => {
    try {
      const { username, password, confirmPassword, referralCode } = req.body as {
        username?: string;
        password?: string;
        confirmPassword?: string;
        referralCode?: string;
      };

      const cleanUsername = (username || '').trim();
      if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 24) {
        res.status(400).json({ error: 'Username must be between 3 and 24 characters.' });
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
        res.status(400).json({ error: 'Username may only contain letters, numbers, and underscores.' });
        return;
      }
      if (!password || password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        return;
      }
      if (password !== confirmPassword) {
        res.status(400).json({ error: 'Password and Confirm Password do not match.' });
        return;
      }

      await withLock(async () => {
        const lower = cleanUsername.toLowerCase();
        const exists = dbState.users.some((u) => u.usernameLower === lower);
        if (exists) {
          res.status(409).json({ error: 'That username is already taken. Please choose another username.' });
          return;
        }

        let referrer: UserRecord | undefined;
        const cleanRef = (referralCode || '').trim().toUpperCase();
        if (cleanRef) {
          referrer = dbState.users.find(
            (u) => (u.referralCode && u.referralCode.toUpperCase() === cleanRef) || u.usernameLower === cleanRef.toLowerCase()
          );
          if (!referrer) {
            res.status(400).json({ error: 'Invalid referral code. Please verify the code or leave it blank.' });
            return;
          }
          if (referrer.status === 'suspended') {
            res.status(400).json({ error: 'This referral code belongs to a suspended account.' });
            return;
          }
          if (referrer.usernameLower === lower) {
            res.status(400).json({ error: 'You cannot refer your own account.' });
            return;
          }
        }

        const bonusAmount = roundCoins(Math.max(0, dbState.config.welcomeBonus));
        const nowIso = new Date().toISOString();
        const userRefCode = cleanUsername.toUpperCase();

        const newUser: UserRecord = {
          id: `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          username: cleanUsername,
          usernameLower: lower,
          passwordHash: hashPassword(password),
          role: 'user',
          status: 'active',
          balance: bonusAmount,
          welcomeBonusAwarded: true,
          referralCode: userRefCode,
          referredBy: referrer ? referrer.id : null,
          referralCount: 0,
          referralEarnings: 0,
          createdAt: nowIso,
        };

        dbState.users.push(newUser);

        let welcomeTx: TransactionRecord | undefined;
        if (bonusAmount > 0) {
          welcomeTx = {
            id: `tx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
            userId: newUser.id,
            username: newUser.username,
            type: 'WELCOME_BONUS',
            amount: bonusAmount,
            balanceBefore: 0,
            balanceAfter: bonusAmount,
            referenceId: `WELCOME-${newUser.id}`,
            description: `Welcome bonus (+₹${bonusAmount.toFixed(2)})`,
            createdAt: nowIso,
          };
          dbState.transactions.unshift(welcomeTx);
        }

        // If referred, award referral reward to referrer
        let refTx: TransactionRecord | undefined;
        let refRecord: ReferralRecord | undefined;
        const refBonus = roundCoins(Math.max(0, dbState.config.referralBonus ?? 50));
        if (referrer && refBonus > 0) {
          const refBalBefore = referrer.balance;
          referrer.balance = roundCoins(referrer.balance + refBonus);
          referrer.referralCount = (referrer.referralCount || 0) + 1;
          referrer.referralEarnings = roundCoins((referrer.referralEarnings || 0) + refBonus);

          refTx = {
            id: `tx_${Date.now() + 1}_${crypto.randomBytes(3).toString('hex')}`,
            userId: referrer.id,
            username: referrer.username,
            type: 'REFERRAL_REWARD',
            amount: refBonus,
            balanceBefore: refBalBefore,
            balanceAfter: referrer.balance,
            referenceId: `REF-${newUser.id}`,
            description: `Referral reward for inviting @${newUser.username} (+₹${refBonus.toFixed(2)})`,
            createdAt: nowIso,
          };
          dbState.transactions.unshift(refTx);

          refRecord = {
            id: `ref_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
            referrerId: referrer.id,
            referrerUsername: referrer.username,
            referredUserId: newUser.id,
            referredUsername: newUser.username,
            rewardAmount: refBonus,
            status: 'COMPLETED',
            createdAt: nowIso,
          };
          dbState.referrals.unshift(refRecord);

          await persistChange({ user: referrer, transaction: refTx, referral: refRecord });
        }

        const token = generateSignedToken();
        const session: SessionRecord = {
          token,
          userId: newUser.id,
          role: 'user',
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        };
        dbState.sessions.push(session);

        await persistChange({ user: newUser, transaction: welcomeTx, session });

        setSessionCookie(req, res, token);
        res.status(201).json({
          token,
          user: {
            id: newUser.id,
            username: newUser.username,
            role: newUser.role,
            status: newUser.status,
            balance: newUser.balance,
            welcomeBonusAwarded: newUser.welcomeBonusAwarded,
            referralCode: newUser.referralCode,
            referredBy: newUser.referredBy,
            referralCount: newUser.referralCount,
            referralEarnings: newUser.referralEarnings,
            createdAt: newUser.createdAt,
          },
        });
      });
    } catch (err) {
      console.error('Signup error:', err);
      res.status(500).json({ error: 'Internal server error during signup.' });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body as { username?: string; password?: string };
      const cleanUsername = (username || '').trim().toLowerCase();
      if (!cleanUsername || !password) {
        res.status(400).json({ error: 'Please enter both your username and password.' });
        return;
      }

      const user = dbState.users.find((u) => u.usernameLower === cleanUsername);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: 'Invalid username or password.' });
        return;
      }
      if (user.status === 'suspended') {
        res.status(403).json({ error: 'Your account has been suspended. Please contact the administrator.' });
        return;
      }

      const token = generateSignedToken();
      const session: SessionRecord = {
        token,
        userId: user.id,
        role: user.role,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      dbState.sessions.push(session);
      await persistChange({ session });

      setSessionCookie(req, res, token);
      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          status: user.status,
          balance: user.balance,
          welcomeBonusAwarded: user.welcomeBonusAwarded,
          referralCode: user.referralCode || user.username.toUpperCase(),
          referredBy: user.referredBy || null,
          referralCount: user.referralCount || 0,
          referralEarnings: user.referralEarnings || 0,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Internal server error during login.' });
    }
  });

  app.post('/api/admin/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body as { username?: string; password?: string };
      const cleanUsername = (username || '').trim().toLowerCase();
      if (!cleanUsername || !password) {
        res.status(400).json({ error: 'Please enter administrator username and password.' });
        return;
      }

      const admin = dbState.users.find((u) => u.usernameLower === cleanUsername && u.role === 'admin');
      if (!admin || !verifyPassword(password, admin.passwordHash)) {
        res.status(401).json({ error: 'Invalid administrator credentials.' });
        return;
      }

      const token = generateSignedToken();
      const session: SessionRecord = {
        token,
        userId: admin.id,
        role: 'admin',
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      };
      dbState.sessions.push(session);
      await persistChange({ session });

      setSessionCookie(req, res, token);
      res.json({
        token,
        user: {
          id: admin.id,
          username: admin.username,
          role: admin.role,
          status: admin.status,
          balance: admin.balance,
          welcomeBonusAwarded: admin.welcomeBonusAwarded,
          createdAt: admin.createdAt,
        },
      });
    } catch (err) {
      console.error('Admin login error:', err);
      res.status(500).json({ error: 'Internal server error during administrator login.' });
    }
  });

  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    const auth = getSessionFromRequest(req);
    if (auth) {
      dbState.sessions = dbState.sessions.filter((s) => s.token !== auth.session.token);
      await persistChange({ deleteSessionToken: auth.session.token });
    }
    clearSessionCookie(req, res);
    res.json({ success: true });
  });

  // --------------------------------------------------------------------------
  // LIVE CRASH GAME ENDPOINTS (SERVER-VALIDATED ROUNDS & BALANCES)
  // --------------------------------------------------------------------------
  app.get('/api/game/state', (req: Request, res: Response) => {
    const auth = getSessionFromRequest(req);
    const now = Date.now();
    const elapsed = now - gameEngine.phaseStartTime;
    const countdownMs =
      gameEngine.phase === 'BETTING' ? Math.max(0, gameEngine.bettingDurationMs - elapsed) : 0;

    const userBets = auth ? gameEngine.bets.filter((b) => b.userId === auth.user.id) : [];
    const myBets = userBets.map((b) => ({
      betId: b.betId,
      userId: b.userId,
      username: b.username,
      slotId: b.slotId || 'slot-1',
      amount: b.amount,
      autoCashout: b.autoCashout,
      cashedOut: b.cashedOut,
      cashoutMultiplier: b.cashoutMultiplier,
      payout: b.payout,
    }));
    const myBet = myBets[0] || null;

    const userQueued = auth
      ? gameEngine.queuedBets.filter((q) => q.userId === auth.user.id && q.status === 'QUEUED')
      : [];
    const myQueuedBets: QueuedRoundBet[] = userQueued.map((q) => ({
      queueId: q.queueId,
      userId: q.userId,
      username: q.username,
      slotId: q.slotId || 'slot-1',
      amount: q.amount,
      autoCashout: q.autoCashout,
      targetRoundId: q.targetRoundId,
      status: q.status,
      createdAt: q.createdAt,
      committedBetId: q.committedBetId,
    }));

    res.json({
      roundId: gameEngine.roundId,
      phase: gameEngine.phase,
      multiplier: gameEngine.multiplier,
      countdownMs,
      phaseStartTime: gameEngine.phaseStartTime,
      serverTime: now,
      bettingDurationMs: gameEngine.bettingDurationMs,
      crashedHoldMs: gameEngine.crashedHoldMs,
      serverSeedHash: gameEngine.serverSeedHash,
      // Only reveal serverSeed and crashPoint AFTER the round has crashed
      crashPoint: gameEngine.phase === 'CRASHED' ? gameEngine.crashPoint : null,
      serverSeed: gameEngine.phase === 'CRASHED' ? gameEngine.serverSeed : null,
      nextRound: {
        roundId: gameEngine.nextRound.roundId,
        serverSeedHash: gameEngine.nextRound.serverSeedHash,
      },
      activeBets: gameEngine.bets.map((b) => ({
        username: b.username,
        slotId: b.slotId || 'slot-1',
        amount: b.amount,
        cashedOut: b.cashedOut,
        cashoutMultiplier: b.cashoutMultiplier,
        payout: b.payout,
      })),
      myBet,
      myBets,
      myQueuedBets,
      queuedBetsCount: gameEngine.queuedBets.filter((q) => q.status === 'QUEUED').length,
      recentHistory: gameEngine.recentHistory.slice(0, 12),
      userBalance: auth ? auth.user.balance : null,
    });
  });

  app.post('/api/game/bet', requireUser, async (req: Request, res: Response) => {
    const currentUser = (req as Request & { currentUser: UserRecord }).currentUser;
    if (currentUser.role !== 'user') {
      res.status(403).json({ error: 'Administrator accounts cannot place bets. Please sign in with a player account.' });
      return;
    }

    const { amount, autoCashout, slotId } = req.body as {
      amount?: number;
      autoCashout?: number | null;
      slotId?: string;
    };
    const betAmount = roundCoins(Number(amount));
    const normalizedSlotId = slotId ? String(slotId).trim() : 'slot-1';

    if (!Number.isFinite(betAmount) || betAmount < 1) {
      res.status(400).json({ error: 'Minimum bet amount is ₹1.00.' });
      return;
    }
    if (betAmount > 10000) {
      res.status(400).json({ error: 'Maximum bet per round is ₹10,000.00.' });
      return;
    }

    let parsedAutoCashout: number | null = null;
    if (autoCashout !== undefined && autoCashout !== null && Number(autoCashout) > 0) {
      parsedAutoCashout = roundCoins(Number(autoCashout));
      if (parsedAutoCashout < 1.1 || parsedAutoCashout > 200) {
        res.status(400).json({ error: 'Auto cashout multiplier must be between 1.10x and 200.00x.' });
        return;
      }
    }

    await withLock(async () => {
      if (gameEngine.phase !== 'BETTING') {
        // When outside BETTING countdown, queue the bet for next round
        const existingIndex = gameEngine.queuedBets.findIndex(
          (q) => q.userId === currentUser.id && (q.slotId || 'slot-1') === normalizedSlotId && q.status === 'QUEUED'
        );

        let balanceBefore = currentUser.balance;
        if (existingIndex !== -1) {
          const prevQ = gameEngine.queuedBets[existingIndex];
          currentUser.balance = roundCoins(currentUser.balance + prevQ.amount);
          gameEngine.queuedBets.splice(existingIndex, 1);
          balanceBefore = currentUser.balance;
        }

        if (currentUser.balance < betAmount) {
          res.status(400).json({ error: `Insufficient balance (Available: ₹${currentUser.balance.toFixed(2)}).` });
          return;
        }

        currentUser.balance = roundCoins(currentUser.balance - betAmount);
        const targetRoundId = gameEngine.nextRound.roundId;
        const queuedBet: QueuedRoundBet = {
          queueId: `queue_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          userId: currentUser.id,
          username: currentUser.username,
          slotId: normalizedSlotId,
          amount: betAmount,
          autoCashout: parsedAutoCashout,
          targetRoundId,
          status: 'QUEUED',
          createdAt: new Date().toISOString(),
          committedBetId: `bet_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        };
        gameEngine.queuedBets.push(queuedBet);

        const tx: TransactionRecord = {
          id: `tx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          userId: currentUser.id,
          username: currentUser.username,
          type: 'QUEUED_BET',
          amount: -betAmount,
          balanceBefore,
          balanceAfter: currentUser.balance,
          referenceId: targetRoundId,
          description: `Queued next-round bet for round ${targetRoundId} (${normalizedSlotId})`,
          createdAt: new Date().toISOString(),
        };
        dbState.transactions.unshift(tx);
        await persistChange({ user: currentUser, transaction: tx });

        res.json({
          success: true,
          queued: true,
          balance: currentUser.balance,
          queuedBet,
        });
        return;
      }

      const alreadyBet = gameEngine.bets.some(
        (b) => b.userId === currentUser.id && (b.slotId || 'slot-1') === normalizedSlotId
      );
      if (alreadyBet) {
        res.status(409).json({ error: `You already have an active bet in ${normalizedSlotId} for this flight round.` });
        return;
      }

      if (currentUser.balance < betAmount) {
        res.status(400).json({ error: 'Insufficient balance for this bet.' });
        return;
      }

      const balanceBefore = currentUser.balance;
      currentUser.balance = roundCoins(currentUser.balance - betAmount);

      const newBet: ActiveRoundBet = {
        betId: `bet_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: currentUser.id,
        username: currentUser.username,
        slotId: normalizedSlotId,
        amount: betAmount,
        autoCashout: parsedAutoCashout,
        cashedOut: false,
        cashoutMultiplier: null,
        payout: null,
      };
      gameEngine.bets.push(newBet);

      const tx: TransactionRecord = {
        id: `tx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: currentUser.id,
        username: currentUser.username,
        type: 'GAME_BET',
        amount: -betAmount,
        balanceBefore,
        balanceAfter: currentUser.balance,
        referenceId: gameEngine.roundId,
        description: `Placed bet on round ${gameEngine.roundId} (${normalizedSlotId})`,
        createdAt: new Date().toISOString(),
      };
      dbState.transactions.unshift(tx);

      await persistChange({ user: currentUser, transaction: tx });

      res.json({
        success: true,
        balance: currentUser.balance,
        bet: newBet,
      });
    });
  });

  app.post('/api/game/queue-bet', requireUser, async (req: Request, res: Response) => {
    const currentUser = (req as Request & { currentUser: UserRecord }).currentUser;
    if (currentUser.role !== 'user') {
      res.status(403).json({ error: 'Administrator accounts cannot place bets. Please sign in with a player account.' });
      return;
    }

    const { amount, autoCashout, slotId } = req.body as {
      amount?: number;
      autoCashout?: number | null;
      slotId?: string;
    };
    const betAmount = roundCoins(Number(amount));
    const normalizedSlotId = slotId ? String(slotId).trim() : 'slot-1';

    if (!Number.isFinite(betAmount) || betAmount < 1) {
      res.status(400).json({ error: 'Minimum bet amount is ₹1.00.' });
      return;
    }
    if (betAmount > 10000) {
      res.status(400).json({ error: 'Maximum bet per slot is ₹10,000.00.' });
      return;
    }

    let parsedAutoCashout: number | null = null;
    if (autoCashout !== undefined && autoCashout !== null && Number(autoCashout) > 0) {
      parsedAutoCashout = roundCoins(Number(autoCashout));
      if (parsedAutoCashout < 1.1 || parsedAutoCashout > 200) {
        res.status(400).json({ error: 'Auto cashout multiplier must be between 1.10x and 200.00x.' });
        return;
      }
    }

    await withLock(async () => {
      const existingIndex = gameEngine.queuedBets.findIndex(
        (q) => q.userId === currentUser.id && (q.slotId || 'slot-1') === normalizedSlotId && q.status === 'QUEUED'
      );

      let balanceBefore = currentUser.balance;
      if (existingIndex !== -1) {
        const prevQ = gameEngine.queuedBets[existingIndex];
        currentUser.balance = roundCoins(currentUser.balance + prevQ.amount);
        gameEngine.queuedBets.splice(existingIndex, 1);
        balanceBefore = currentUser.balance;
      }

      if (currentUser.balance < betAmount) {
        res.status(400).json({ error: `Insufficient balance (Available: ₹${currentUser.balance.toFixed(2)}).` });
        return;
      }

      currentUser.balance = roundCoins(currentUser.balance - betAmount);
      const targetRoundId = gameEngine.nextRound.roundId;
      const queuedBet: QueuedRoundBet = {
        queueId: `queue_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: currentUser.id,
        username: currentUser.username,
        slotId: normalizedSlotId,
        amount: betAmount,
        autoCashout: parsedAutoCashout,
        targetRoundId,
        status: 'QUEUED',
        createdAt: new Date().toISOString(),
        committedBetId: `bet_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      };
      gameEngine.queuedBets.push(queuedBet);

      const tx: TransactionRecord = {
        id: `tx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: currentUser.id,
        username: currentUser.username,
        type: 'QUEUED_BET',
        amount: -betAmount,
        balanceBefore,
        balanceAfter: currentUser.balance,
        referenceId: targetRoundId,
        description: `Queued next-round bet for round ${targetRoundId} (${normalizedSlotId})`,
        createdAt: new Date().toISOString(),
      };
      dbState.transactions.unshift(tx);
      await persistChange({ user: currentUser, transaction: tx });

      res.json({
        success: true,
        queued: true,
        balance: currentUser.balance,
        queuedBet,
      });
    });
  });

  app.post('/api/game/cancel-queued-bet', requireUser, async (req: Request, res: Response) => {
    const currentUser = (req as Request & { currentUser: UserRecord }).currentUser;
    const { slotId } = req.body as { slotId?: string };
    const normalizedSlotId = slotId ? String(slotId).trim() : 'slot-1';

    await withLock(async () => {
      const existingIndex = gameEngine.queuedBets.findIndex(
        (q) => q.userId === currentUser.id && (q.slotId || 'slot-1') === normalizedSlotId && q.status === 'QUEUED'
      );

      if (existingIndex === -1) {
        res.status(404).json({ error: `No active queued bet found for ${normalizedSlotId}.` });
        return;
      }

      const queuedBet = gameEngine.queuedBets[existingIndex];
      gameEngine.queuedBets.splice(existingIndex, 1);

      const balanceBefore = currentUser.balance;
      currentUser.balance = roundCoins(currentUser.balance + queuedBet.amount);

      const tx: TransactionRecord = {
        id: `tx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: currentUser.id,
        username: currentUser.username,
        type: 'QUEUED_BET_REFUND',
        amount: queuedBet.amount,
        balanceBefore,
        balanceAfter: currentUser.balance,
        referenceId: queuedBet.targetRoundId,
        description: `Refunded cancelled queued bet for round ${queuedBet.targetRoundId} (${normalizedSlotId})`,
        createdAt: new Date().toISOString(),
      };
      dbState.transactions.unshift(tx);
      await persistChange({ user: currentUser, transaction: tx });

      res.json({
        success: true,
        cancelled: true,
        balance: currentUser.balance,
        slotId: normalizedSlotId,
      });
    });
  });

  app.post('/api/game/cashout', requireUser, async (req: Request, res: Response) => {
    const currentUser = (req as Request & { currentUser: UserRecord }).currentUser;
    const { slotId } = (req.body || {}) as { slotId?: string };
    const targetSlotId = slotId ? String(slotId).trim() : undefined;

    await withLock(async () => {
      if (gameEngine.phase !== 'FLYING') {
        res.status(400).json({ error: 'Flight is not active or has already flown away.' });
        return;
      }

      let activeBet: ActiveRoundBet | undefined;
      if (targetSlotId) {
        activeBet = gameEngine.bets.find(
          (b) => b.userId === currentUser.id && (b.slotId || 'slot-1') === targetSlotId
        );
      } else {
        activeBet = gameEngine.bets.find((b) => b.userId === currentUser.id && !b.cashedOut);
      }

      if (!activeBet) {
        res.status(404).json({ error: 'No active bet found for your account in this round.' });
        return;
      }
      if (activeBet.cashedOut) {
        res.status(409).json({ error: 'You have already cashed out this flight.' });
        return;
      }

      const cashoutMult = Math.min(gameEngine.multiplier, gameEngine.crashPoint);
      await processSingleCashout(activeBet, cashoutMult);

      res.json({
        success: true,
        slotId: activeBet.slotId,
        cashoutMultiplier: activeBet.cashoutMultiplier,
        payout: activeBet.payout,
        balance: currentUser.balance,
      });
    });
  });

  // --------------------------------------------------------------------------
  // USER WALLET, SIMULATED DEPOSIT & SIMULATED WITHDRAWAL ENDPOINTS
  // --------------------------------------------------------------------------
  app.get('/api/wallet/summary', requireUser, (req: Request, res: Response) => {
    const currentUser = (req as Request & { currentUser: UserRecord }).currentUser;
    const myTransactions = dbState.transactions
      .filter((t) => t.userId === currentUser.id)
      .slice(0, 100);
    const myRequests = dbState.requests
      .filter((r) => r.userId === currentUser.id)
      .slice(0, 100)
      .map((r) => {
        // Strip unmasked bank account number for privacy
        const { bankAccountNumber: _omit, ...rest } = r;
        return rest;
      });

    res.json({
      balance: currentUser.balance,
      welcomeBonusAwarded: currentUser.welcomeBonusAwarded,
      config: {
        welcomeBonus: dbState.config.welcomeBonus,
        placeholderQrUrl: dbState.config.placeholderQrUrl,
        logoUrl: dbState.config.logoUrl || '',
        loadingLogoUrl: dbState.config.loadingLogoUrl || '',
        depositBonusEnabled: dbState.config.depositBonusEnabled !== false,
        depositBonusPercent: dbState.config.depositBonusPercent ?? 9,
        minWithdrawalAmount: dbState.config.minWithdrawalAmount ?? 500,
        referralBonus: dbState.config.referralBonus ?? 50,
      },
      transactions: myTransactions,
      requests: myRequests,
    });
  });

  app.get('/api/wallet/referrals', requireUser, (req: Request, res: Response) => {
    const currentUser = (req as Request & { currentUser: UserRecord }).currentUser;
    const myReferrals = dbState.referrals
      .filter((r) => r.referrerId === currentUser.id)
      .slice(0, 100);
    const host = req.get('host') || 'localhost:3000';
    const proto = req.get('x-forwarded-proto') || 'https';
    const referralCode = currentUser.referralCode || currentUser.username.toUpperCase();
    const referralLink = `${proto}://${host}/?ref=${encodeURIComponent(referralCode)}`;

    res.json({
      referralCode,
      referralLink,
      referralBonus: Number(dbState.config.referralBonus) || 50,
      totalReferred: currentUser.referralCount || myReferrals.length,
      totalEarnings: currentUser.referralEarnings || roundCoins(myReferrals.reduce((sum, r) => sum + r.rewardAmount, 0)),
      history: myReferrals,
    });
  });

  app.post('/api/wallet/deposit', requireUser, async (req: Request, res: Response) => {
    const currentUser = (req as Request & { currentUser: UserRecord }).currentUser;
    if (currentUser.role !== 'user') {
      res.status(403).json({ error: 'Only player accounts can submit deposit requests.' });
      return;
    }

    const { amount, userNote } = req.body as { amount?: number; userNote?: string };
    const cleanAmount = roundCoins(Number(amount));

    if (!Number.isFinite(cleanAmount) || cleanAmount < 1 || cleanAmount > 50000) {
      res.status(400).json({ error: 'Deposit amount must be between ₹1 and ₹50,000.' });
      return;
    }

    await withLock(async () => {
      const pendingCount = dbState.requests.filter(
        (r) => r.userId === currentUser.id && r.type === 'DEPOSIT' && r.status === 'PENDING'
      ).length;
      if (pendingCount >= 3) {
        res.status(429).json({
          error: 'You already have 3 pending deposit requests awaiting review.',
        });
        return;
      }

      const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const uniqueSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();

      // Server-side deposit bonus calculation (e.g. 9% bonus configured by admin)
      const bonusEnabled = dbState.config.depositBonusEnabled !== false;
      const bonusPercent = bonusEnabled ? Math.max(0, Number(dbState.config.depositBonusPercent) || 9) : 0;
      const bonusAmount = bonusEnabled && bonusPercent > 0 ? roundCoins(cleanAmount * (bonusPercent / 100)) : 0;
      const creditedAmount = roundCoins(cleanAmount + bonusAmount);

      const requestRecord: TransferRequestRecord = {
        id: `DEP-${dateCode}-${uniqueSuffix}`,
        userId: currentUser.id,
        username: currentUser.username,
        type: 'DEPOSIT',
        amount: cleanAmount,
        bonusAmount,
        bonusPercent,
        creditedAmount,
        status: 'PENDING',
        userNote: (userNote || 'Deposit request').trim().slice(0, 140),
        adminNote: '',
        processedBy: null,
        processedAt: null,
        createdAt: new Date().toISOString(),
      };

      dbState.requests.unshift(requestRecord);
      await persistChange({ request: requestRecord });

      const bonusMsg = bonusAmount > 0
        ? ` Includes ${bonusPercent}% deposit bonus (+₹${bonusAmount.toFixed(2)}). Total credited upon approval: ₹${creditedAmount.toFixed(2)}.`
        : '';

      res.status(201).json({
        request: requestRecord,
        bonusAmount,
        bonusPercent,
        creditedAmount,
        message: `Deposit request submitted (Status: Pending).${bonusMsg} Balance will be credited after administrator review.`,
      });
    });
  });

  app.post('/api/wallet/withdraw', requireUser, async (req: Request, res: Response) => {
    const currentUser = (req as Request & { currentUser: UserRecord }).currentUser;
    if (currentUser.role !== 'user') {
      res.status(403).json({ error: 'Only player accounts can submit withdrawal requests.' });
      return;
    }

    const {
      amount,
      mobileNumber,
      accountHolderName,
      bankAccountNumber,
      confirmBankAccountNumber,
      ifscCode,
      upiId,
      userNote,
    } = req.body as {
      amount?: number;
      mobileNumber?: string;
      accountHolderName?: string;
      bankAccountNumber?: string;
      confirmBankAccountNumber?: string;
      ifscCode?: string;
      upiId?: string;
      userNote?: string;
    };

    const cleanAmount = roundCoins(Number(amount));
    const cleanMobile = (mobileNumber || '').trim().replace(/[\s\-+]/g, '');
    const cleanHolderName = (accountHolderName || '').trim();
    const cleanAccount = (bankAccountNumber || '').trim().replace(/\s+/g, '');
    const cleanConfirm = (confirmBankAccountNumber || '').trim().replace(/\s+/g, '');
    const cleanIfsc = (ifscCode || '').trim().toUpperCase();
    const cleanUpi = (upiId || '').trim();

    // 1. Minimum withdrawal amount configured by administrator (Server validated)
    const minWithdrawal = Math.max(1, Number(dbState.config.minWithdrawalAmount) || 500);
    if (!Number.isFinite(cleanAmount) || cleanAmount < minWithdrawal) {
      res.status(400).json({ error: `Minimum withdrawal amount is ₹${minWithdrawal.toFixed(2)}.` });
      return;
    }

    // 2. Validate Mobile Number (10 digits)
    if (!cleanMobile || !/^\d{10}$/.test(cleanMobile)) {
      res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
      return;
    }

    // 3. Validate Account Holder Name
    if (!cleanHolderName || cleanHolderName.length < 2 || cleanHolderName.length > 70) {
      res.status(400).json({ error: 'Please enter a valid Bank Account Holder Name (2 to 70 characters).' });
      return;
    }

    // 4. Validate Bank Account Number (9 to 18 digits)
    if (!cleanAccount || !/^\d{9,18}$/.test(cleanAccount)) {
      res.status(400).json({ error: 'Bank Account Number must be between 9 and 18 digits.' });
      return;
    }

    // 5. Validate Confirm Bank Account Number
    if (cleanConfirm !== cleanAccount) {
      res.status(400).json({ error: 'Bank Account Number and Confirm Account Number do not match.' });
      return;
    }

    // 6. Validate IFSC Code format (11 alphanumeric characters)
    if (!cleanIfsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      res.status(400).json({
        error: 'Please enter a valid 11-character IFSC code (format: 4 letters, 0, then 6 alphanumeric characters, e.g. SBIN0001234).',
      });
      return;
    }

    await withLock(async () => {
      if (currentUser.balance < cleanAmount) {
        res.status(400).json({
          error: `Insufficient available balance. Available: ₹${currentUser.balance.toFixed(2)}.`,
        });
        return;
      }

      const pendingWithdrawals = dbState.requests.filter(
        (r) => r.userId === currentUser.id && r.type === 'WITHDRAWAL' && r.status === 'PENDING'
      ).length;
      if (pendingWithdrawals >= 3) {
        res.status(429).json({
          error: 'You already have 3 pending withdrawal requests awaiting review.',
        });
        return;
      }

      const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const uniqueSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      const requestId = `WDR-${dateCode}-${uniqueSuffix}`;
      const nowIso = new Date().toISOString();

      // Mask bank account number (only reveal last 4 digits)
      const maskedAccount =
        cleanAccount.length > 4
          ? `•••• •••• ${cleanAccount.slice(-4)}`
          : cleanAccount;

      // Reserve amount immediately so it cannot be double-spent
      const balanceBefore = currentUser.balance;
      currentUser.balance = roundCoins(currentUser.balance - cleanAmount);

      const combinedNote = [
        `Holder: ${cleanHolderName}`,
        `A/C: ${maskedAccount}`,
        `IFSC: ${cleanIfsc}`,
        `Mobile: ${cleanMobile}`,
        cleanUpi ? `UPI: ${cleanUpi}` : '',
        userNote ? userNote.trim() : '',
      ]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 240);

      const requestRecord: TransferRequestRecord = {
        id: requestId,
        userId: currentUser.id,
        username: currentUser.username,
        type: 'WITHDRAWAL',
        amount: cleanAmount,
        status: 'PENDING',
        mobileNumber: cleanMobile,
        accountHolderName: cleanHolderName,
        bankAccountNumber: cleanAccount,
        maskedAccountNumber: maskedAccount,
        ifscCode: cleanIfsc,
        upiId: cleanUpi,
        userNote: combinedNote,
        adminNote: '',
        processedBy: null,
        processedAt: null,
        createdAt: nowIso,
      };

      const reserveTx: TransactionRecord = {
        id: `tx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: currentUser.id,
        username: currentUser.username,
        type: 'WITHDRAWAL_RESERVE',
        amount: -cleanAmount,
        balanceBefore,
        balanceAfter: currentUser.balance,
        referenceId: requestId,
        description: `Reserved ₹${cleanAmount.toFixed(2)} for withdrawal ${requestId} (${cleanHolderName} · ${maskedAccount})`,
        createdAt: nowIso,
      };

      dbState.requests.unshift(requestRecord);
      dbState.transactions.unshift(reserveTx);

      await persistChange({ user: currentUser, request: requestRecord, transaction: reserveTx });

      const { bankAccountNumber: _omitAcc, ...sanitizedRecord } = requestRecord;

      res.status(201).json({
        request: sanitizedRecord,
        balance: currentUser.balance,
        message: 'Withdrawal request submitted and amount reserved awaiting administrator review.',
      });
    });
  });

  // --------------------------------------------------------------------------
  // SECURE ADMINISTRATOR PANEL ENDPOINTS
  // --------------------------------------------------------------------------
  app.get('/api/admin/users', requireAdmin, (req: Request, res: Response) => {
    const searchQuery = ((req.query.search as string) || '').trim().toLowerCase();
    const playerUsers = dbState.users
      .filter((u) => u.role !== 'admin')
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const filteredUsers = searchQuery
      ? playerUsers.filter(
          (u) => u.usernameLower.includes(searchQuery) || u.id.toLowerCase().includes(searchQuery)
        )
      : playerUsers;

    res.json({
      total: playerUsers.length,
      users: filteredUsers.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        status: u.status,
        balance: u.balance,
        welcomeBonusAwarded: u.welcomeBonusAwarded,
        createdAt: u.createdAt,
      })),
    });
  });

  app.get('/api/admin/overview', requireAdmin, (req: Request, res: Response) => {
    const searchQuery = ((req.query.search as string) || '').trim().toLowerCase();
    const playerUsers = dbState.users
      .filter((u) => u.role !== 'admin')
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const filteredUsers = searchQuery
      ? playerUsers.filter(
          (u) => u.usernameLower.includes(searchQuery) || u.id.toLowerCase().includes(searchQuery)
        )
      : playerUsers;

    res.json({
      metrics: {
        totalRegisteredUsers: playerUsers.length,
        activeUsers: playerUsers.filter((u) => u.status === 'active').length,
        suspendedUsers: playerUsers.filter((u) => u.status === 'suspended').length,
        pendingDeposits: dbState.requests.filter((r) => r.type === 'DEPOSIT' && r.status === 'PENDING').length,
        pendingWithdrawals: dbState.requests.filter((r) => r.type === 'WITHDRAWAL' && r.status === 'PENDING').length,
      },
      config: dbState.config,
      users: filteredUsers.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        status: u.status,
        balance: u.balance,
        welcomeBonusAwarded: u.welcomeBonusAwarded,
        createdAt: u.createdAt,
      })),
      requests: dbState.requests.slice(0, 200),
      transactions: dbState.transactions.slice(0, 200),
      auditLogs: dbState.auditLogs.slice(0, 200),
    });
  });

  app.get('/api/admin/requests', requireAdmin, (req: Request, res: Response) => {
    res.json({ requests: dbState.requests.slice(0, 200) });
  });

  app.post('/api/admin/users/:userId/balance', requireAdmin, async (req: Request, res: Response) => {
    const adminUser = (req as Request & { currentUser: UserRecord }).currentUser;
    const { userId } = req.params;
    const { operation, amount, reason } = req.body as {
      operation?: 'ADD' | 'SUBTRACT';
      amount?: number;
      reason?: string;
    };

    const cleanReason = (reason || '').trim();
    if (!cleanReason || cleanReason.length < 3) {
      res.status(400).json({ error: 'A clear reason (at least 3 characters) is required for every balance adjustment.' });
      return;
    }

    const cleanAmount = roundCoins(Number(amount));
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0 || cleanAmount > 1000000) {
      res.status(400).json({ error: 'Adjustment amount must be between ₹0.01 and ₹1,000,000.' });
      return;
    }
    if (operation !== 'ADD' && operation !== 'SUBTRACT') {
      res.status(400).json({ error: 'Operation must be ADD or SUBTRACT.' });
      return;
    }

    await withLock(async () => {
      const targetUser = dbState.users.find((u) => u.id === userId && u.role !== 'admin');
      if (!targetUser) {
        res.status(404).json({ error: 'Target player account not found.' });
        return;
      }

      const signedDelta = operation === 'ADD' ? cleanAmount : -cleanAmount;
      if (targetUser.balance + signedDelta < 0) {
        res.status(400).json({
          error: `Cannot subtract ₹${cleanAmount.toFixed(2)}; user only has ₹${targetUser.balance.toFixed(2)}.`,
        });
        return;
      }

      const nowIso = new Date().toISOString();
      const balanceBefore = targetUser.balance;
      targetUser.balance = roundCoins(targetUser.balance + signedDelta);

      const tx: TransactionRecord = {
        id: `tx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        userId: targetUser.id,
        username: targetUser.username,
        type: 'ADMIN_ADJUSTMENT',
        amount: signedDelta,
        balanceBefore,
        balanceAfter: targetUser.balance,
        referenceId: `ADJ-${Date.now()}`,
        description: `Balance ${operation === 'ADD' ? 'credit' : 'debit'} (₹${cleanAmount.toFixed(2)}): ${cleanReason}`,
        createdAt: nowIso,
      };

      const audit: AuditLogRecord = {
        id: `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        adminId: adminUser.id,
        adminUsername: adminUser.username,
        action: operation === 'ADD' ? 'BALANCE_ADD' : 'BALANCE_SUBTRACT',
        targetUserId: targetUser.id,
        targetUsername: targetUser.username,
        amount: signedDelta,
        reason: cleanReason,
        details: `${operation === 'ADD' ? '+' : '-'}₹${cleanAmount.toFixed(2)} (₹${balanceBefore.toFixed(2)} -> ₹${targetUser.balance.toFixed(2)}). Reason: ${cleanReason}`,
        createdAt: nowIso,
      };

      dbState.transactions.unshift(tx);
      dbState.auditLogs.unshift(audit);

      await persistChange({ user: targetUser, transaction: tx, auditLog: audit });

      res.json({
        success: true,
        user: {
          id: targetUser.id,
          username: targetUser.username,
          status: targetUser.status,
          balance: targetUser.balance,
        },
      });
    });
  });

  app.post('/api/admin/users/:userId/status', requireAdmin, async (req: Request, res: Response) => {
    const adminUser = (req as Request & { currentUser: UserRecord }).currentUser;
    const { userId } = req.params;
    const { status, reason } = req.body as { status?: 'active' | 'suspended'; reason?: string };

    if (status !== 'active' && status !== 'suspended') {
      res.status(400).json({ error: 'Account status must be active or suspended.' });
      return;
    }

    await withLock(async () => {
      const targetUser = dbState.users.find((u) => u.id === userId && u.role !== 'admin');
      if (!targetUser) {
        res.status(404).json({ error: 'Target player account not found.' });
        return;
      }

      const previousStatus = targetUser.status;
      targetUser.status = status;

      // If suspended, revoke active user sessions immediately
      if (status === 'suspended') {
        dbState.sessions = dbState.sessions.filter((s) => s.userId !== targetUser.id);
      }

      const audit: AuditLogRecord = {
        id: `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        adminId: adminUser.id,
        adminUsername: adminUser.username,
        action: status === 'suspended' ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
        targetUsername: targetUser.username,
        details: `Changed status from ${previousStatus} to ${status}. Note: ${(reason || 'Administrative status update').trim()}`,
        createdAt: new Date().toISOString(),
      };

      dbState.auditLogs.unshift(audit);
      await persistChange({ user: targetUser, auditLog: audit });

      res.json({
        success: true,
        user: {
          id: targetUser.id,
          username: targetUser.username,
          status: targetUser.status,
          balance: targetUser.balance,
        },
      });
    });
  });

  app.post('/api/admin/requests/:requestId/review', requireAdmin, async (req: Request, res: Response) => {
    const adminUser = (req as Request & { currentUser: UserRecord }).currentUser;
    const { requestId } = req.params;
    const { decision, adminNote } = req.body as {
      decision?: 'APPROVED' | 'REJECTED';
      adminNote?: string;
    };

    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      res.status(400).json({ error: 'Decision must be APPROVED or REJECTED.' });
      return;
    }

    await withLock(async () => {
      const reqRecord = dbState.requests.find((r) => r.id === requestId);
      if (!reqRecord) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      // Duplicate processing protection: strictly ensure status is still PENDING
      if (reqRecord.status !== 'PENDING') {
        res.status(409).json({
          error: `This request (${reqRecord.id}) has already been ${reqRecord.status.toLowerCase()} and cannot be processed again.`,
        });
        return;
      }

      const targetUser = dbState.users.find((u) => u.id === reqRecord.userId);
      if (!targetUser) {
        res.status(404).json({ error: 'Associated player account not found.' });
        return;
      }

      const nowIso = new Date().toISOString();
      reqRecord.status = decision;
      reqRecord.adminNote = (adminNote || `Reviewed by ${adminUser.username}`).trim().slice(0, 160);
      reqRecord.processedBy = adminUser.username;
      reqRecord.processedAt = nowIso;

      let createdTx: TransactionRecord | undefined;

      if (reqRecord.type === 'DEPOSIT' && decision === 'APPROVED') {
        // Credit balance exactly once upon admin approval (base deposit + calculated deposit bonus)
        const baseAmount = reqRecord.amount;
        const bonusPercent = reqRecord.bonusPercent ?? (dbState.config.depositBonusEnabled !== false ? (Number(dbState.config.depositBonusPercent) || 9) : 0);
        const bonusAmount = reqRecord.bonusAmount ?? (bonusPercent > 0 ? roundCoins(baseAmount * (bonusPercent / 100)) : 0);
        const totalCredit = roundCoins(baseAmount + bonusAmount);
        const balanceBefore = targetUser.balance;
        targetUser.balance = roundCoins(targetUser.balance + totalCredit);

        // Transaction 1: Base Deposit Approved
        const depositTx: TransactionRecord = {
          id: `tx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          userId: targetUser.id,
          username: targetUser.username,
          type: 'DEPOSIT_APPROVED',
          amount: baseAmount,
          balanceBefore,
          balanceAfter: roundCoins(balanceBefore + baseAmount),
          referenceId: reqRecord.id,
          description: `Approved deposit request ${reqRecord.id}`,
          createdAt: nowIso,
        };
        dbState.transactions.unshift(depositTx);
        createdTx = depositTx;

        // Transaction 2: Deposit Bonus (if configured and > 0)
        if (bonusAmount > 0) {
          const bonusTx: TransactionRecord = {
            id: `tx_${Date.now() + 1}_${crypto.randomBytes(3).toString('hex')}`,
            userId: targetUser.id,
            username: targetUser.username,
            type: 'DEPOSIT_BONUS',
            amount: bonusAmount,
            balanceBefore: roundCoins(balanceBefore + baseAmount),
            balanceAfter: targetUser.balance,
            referenceId: reqRecord.id,
            description: `${bonusPercent}% deposit bonus for request ${reqRecord.id} (+₹${bonusAmount.toFixed(2)})`,
            createdAt: nowIso,
          };
          dbState.transactions.unshift(bonusTx);
          persistChange({ transaction: bonusTx }).catch(() => {});
        }
      } else if (reqRecord.type === 'WITHDRAWAL' && decision === 'REJECTED') {
        // Release reserved balance back to user account exactly once if rejected
        const balanceBefore = targetUser.balance;
        targetUser.balance = roundCoins(targetUser.balance + reqRecord.amount);
        createdTx = {
          id: `tx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          userId: targetUser.id,
          username: targetUser.username,
          type: 'WITHDRAWAL_REFUND',
          amount: reqRecord.amount,
          balanceBefore,
          balanceAfter: targetUser.balance,
          referenceId: reqRecord.id,
          description: `Refunded reserved balance for rejected withdrawal ${reqRecord.id}`,
          createdAt: nowIso,
        };
        dbState.transactions.unshift(createdTx);
      }

      const audit: AuditLogRecord = {
        id: `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        adminId: adminUser.id,
        adminUsername: adminUser.username,
        action: `${reqRecord.type}_${decision}`,
        targetUsername: targetUser.username,
        details: `${reqRecord.type} request ${reqRecord.id} for ₹${reqRecord.amount.toFixed(2)} ${decision.toLowerCase()}. Note: ${reqRecord.adminNote}`,
        createdAt: nowIso,
      };
      dbState.auditLogs.unshift(audit);

      await persistChange({
        user: targetUser,
        request: reqRecord,
        transaction: createdTx,
        auditLog: audit,
      });

      res.json({
        success: true,
        request: reqRecord,
        updatedBalance: targetUser.balance,
      });
    });
  });

  app.post('/api/admin/config', requireAdmin, async (req: Request, res: Response) => {
    const adminUser = (req as Request & { currentUser: UserRecord }).currentUser;
    const {
      welcomeBonus,
      placeholderQrUrl,
      resetDefaultQr,
      logoUrl,
      resetDefaultLogo,
      loadingLogoUrl,
      resetDefaultLoadingLogo,
      depositBonusEnabled,
      depositBonusPercent,
      minWithdrawalAmount,
      referralBonus,
      houseEdgePercent,
      maxMultiplier,
      bettingDurationMs,
      crashedHoldMs,
    } = req.body as {
      welcomeBonus?: number;
      placeholderQrUrl?: string;
      resetDefaultQr?: boolean;
      logoUrl?: string;
      resetDefaultLogo?: boolean;
      loadingLogoUrl?: string;
      resetDefaultLoadingLogo?: boolean;
      depositBonusEnabled?: boolean;
      depositBonusPercent?: number;
      minWithdrawalAmount?: number;
      referralBonus?: number;
      houseEdgePercent?: number;
      maxMultiplier?: number;
      bettingDurationMs?: number;
      crashedHoldMs?: number;
    };

    await withLock(async () => {
      const changes: string[] = [];

      if (welcomeBonus !== undefined) {
        const cleanBonus = roundCoins(Number(welcomeBonus));
        if (!Number.isFinite(cleanBonus) || cleanBonus < 0 || cleanBonus > 100000) {
          res.status(400).json({ error: 'Welcome bonus must be between ₹0 and ₹100,000.' });
          return;
        }
        changes.push(`welcomeBonus: ₹${dbState.config.welcomeBonus} -> ₹${cleanBonus}`);
        dbState.config.welcomeBonus = cleanBonus;
      }

      if (resetDefaultQr) {
        dbState.config.placeholderQrUrl = DEFAULT_QR_IMAGE;
        changes.push('QR code reset to default image');
      } else if (placeholderQrUrl !== undefined && placeholderQrUrl.trim().length > 0) {
        dbState.config.placeholderQrUrl = placeholderQrUrl.trim();
        changes.push('QR code updated');
      }

      // Admin Game Logo configuration
      if (resetDefaultLogo) {
        dbState.config.logoUrl = '';
        changes.push('Custom game logo reset to default');
      } else if (logoUrl !== undefined) {
        const cleanLogo = logoUrl.trim();
        if (cleanLogo.length > 0 && !cleanLogo.startsWith('data:image/') && !cleanLogo.startsWith('http://') && !cleanLogo.startsWith('https://') && !cleanLogo.startsWith('/')) {
          res.status(400).json({ error: 'Invalid game logo format. Please provide a valid image data URI or URL.' });
          return;
        }
        dbState.config.logoUrl = cleanLogo;
        changes.push(cleanLogo ? 'Game logo updated' : 'Game logo cleared');
      }

      // Admin Loading Screen Logo configuration
      if (resetDefaultLoadingLogo) {
        dbState.config.loadingLogoUrl = '';
        changes.push('Loading screen logo reset to default');
      } else if (loadingLogoUrl !== undefined) {
        const cleanLoadingLogo = loadingLogoUrl.trim();
        if (cleanLoadingLogo.length > 0 && !cleanLoadingLogo.startsWith('data:image/') && !cleanLoadingLogo.startsWith('http://') && !cleanLoadingLogo.startsWith('https://') && !cleanLoadingLogo.startsWith('/')) {
          res.status(400).json({ error: 'Invalid loading logo format. Please provide a valid image data URI or URL.' });
          return;
        }
        dbState.config.loadingLogoUrl = cleanLoadingLogo;
        changes.push(cleanLoadingLogo ? 'Loading screen logo updated' : 'Loading screen logo cleared');
      }

      // Deposit bonus configuration
      if (depositBonusEnabled !== undefined) {
        const val = Boolean(depositBonusEnabled);
        changes.push(`depositBonusEnabled: ${dbState.config.depositBonusEnabled} -> ${val}`);
        dbState.config.depositBonusEnabled = val;
      }

      if (depositBonusPercent !== undefined) {
        const cleanPercent = Math.max(0, Math.min(100, Number(depositBonusPercent)));
        changes.push(`depositBonusPercent: ${dbState.config.depositBonusPercent}% -> ${cleanPercent}%`);
        dbState.config.depositBonusPercent = cleanPercent;
      }

      // Minimum withdrawal configuration
      if (minWithdrawalAmount !== undefined) {
        const cleanMin = roundCoins(Math.max(1, Math.min(100000, Number(minWithdrawalAmount))));
        changes.push(`minWithdrawalAmount: ₹${dbState.config.minWithdrawalAmount} -> ₹${cleanMin}`);
        dbState.config.minWithdrawalAmount = cleanMin;
      }

      // Referral bonus configuration
      if (referralBonus !== undefined) {
        const cleanRefBonus = roundCoins(Math.max(0, Math.min(50000, Number(referralBonus))));
        changes.push(`referralBonus: ₹${dbState.config.referralBonus ?? 50} -> ₹${cleanRefBonus}`);
        dbState.config.referralBonus = cleanRefBonus;
      }

      // Fair game engine future parameters
      if (houseEdgePercent !== undefined) {
        const cleanEdge = Math.max(1, Math.min(15, Number(houseEdgePercent)));
        changes.push(`houseEdgePercent: ${dbState.config.houseEdgePercent}% -> ${cleanEdge}%`);
        dbState.config.houseEdgePercent = cleanEdge;
      }

      if (maxMultiplier !== undefined) {
        const cleanCap = Math.max(10, Math.min(1000, Number(maxMultiplier)));
        changes.push(`maxMultiplier: ${dbState.config.maxMultiplier}x -> ${cleanCap}x`);
        dbState.config.maxMultiplier = cleanCap;
      }

      if (bettingDurationMs !== undefined) {
        const cleanDuration = Math.max(2000, Math.min(15000, Number(bettingDurationMs)));
        changes.push(`bettingDurationMs: ${dbState.config.bettingDurationMs}ms -> ${cleanDuration}ms`);
        dbState.config.bettingDurationMs = cleanDuration;
      }

      if (crashedHoldMs !== undefined) {
        const cleanHold = Math.max(1500, Math.min(10000, Number(crashedHoldMs)));
        changes.push(`crashedHoldMs: ${dbState.config.crashedHoldMs}ms -> ${cleanHold}ms`);
        dbState.config.crashedHoldMs = cleanHold;
      }

      const nowIso = new Date().toISOString();
      dbState.config.updatedAt = nowIso;
      dbState.config.updatedBy = adminUser.username;

      const audit: AuditLogRecord = {
        id: `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        adminId: adminUser.id,
        adminUsername: adminUser.username,
        action: 'CONFIG_UPDATED',
        targetUsername: null,
        details: changes.join('; ') || 'Configuration saved',
        createdAt: nowIso,
      };
      dbState.auditLogs.unshift(audit);

      await persistChange({ config: dbState.config, auditLog: audit });

      res.json({
        success: true,
        config: dbState.config,
      });
    });
  });

  // --------------------------------------------------------------------------
  // ADMIN LIVE FAIR GAME ENGINE & FLIGHT CONTROLS
  // --------------------------------------------------------------------------
  app.get('/api/admin/game-status', requireAdmin, (_req: Request, res: Response) => {
    syncGameClock();
    const now = Date.now();
    const elapsed = now - gameEngine.phaseStartTime;
    const countdownMs =
      gameEngine.phase === 'BETTING' ? Math.max(0, gameEngine.bettingDurationMs - elapsed) : 0;

    res.json({
      roundId: gameEngine.roundId,
      phase: gameEngine.phase,
      statusLabel:
        gameEngine.phase === 'BETTING' ? 'Waiting' : gameEngine.phase === 'FLYING' ? 'Flying' : 'Crashed',
      multiplier: gameEngine.multiplier,
      crashPoint: gameEngine.crashPoint,
      countdownMs,
      phaseStartTime: gameEngine.phaseStartTime,
      serverTime: now,
      activeBetsCount: gameEngine.bets.length,
      totalBetPool: roundCoins(gameEngine.bets.reduce((acc, b) => acc + b.amount, 0)),
      serverSeedHash: gameEngine.serverSeedHash,
      serverSeed: gameEngine.phase === 'CRASHED' ? gameEngine.serverSeed : undefined,
      nextRound: {
        roundId: gameEngine.nextRound.roundId,
        crashPoint: gameEngine.nextRound.crashPoint,
        serverSeedHash: gameEngine.nextRound.serverSeedHash,
      },
      config: {
        houseEdgePercent: Number(dbState.config.houseEdgePercent) || 3,
        maxMultiplier: Number(dbState.config.maxMultiplier) || 250,
        bettingDurationMs: Number(dbState.config.bettingDurationMs) || 5000,
        crashedHoldMs: Number(dbState.config.crashedHoldMs) || 3500,
      },
      recentHistory: gameEngine.recentHistory.slice(0, 15),
    });
  });

  app.post('/api/admin/flight/crash', requireAdmin, async (req: Request, res: Response) => {
    const adminUser = (req as Request & { currentUser: UserRecord }).currentUser;
    await withLock(async () => {
      syncGameClock();
      // Synchronized protection: only allow crashing when flight is actively in progress
      if (gameEngine.phase !== 'FLYING') {
        res.status(400).json({
          error: `Cannot end flight: round is currently ${gameEngine.phase.toLowerCase()} (only active FLYING rounds can be ended).`,
          phase: gameEngine.phase,
        });
        return;
      }

      const crashMult = Math.max(1.0, gameEngine.multiplier);
      gameEngine.crashPoint = crashMult;
      gameEngine.multiplier = crashMult;
      gameEngine.phase = 'CRASHED';
      gameEngine.phaseStartTime = Date.now();

      const completedAt = new Date().toISOString();
      gameEngine.recentHistory.unshift({
        roundId: gameEngine.roundId,
        crashPoint: crashMult,
        serverSeedHash: gameEngine.serverSeedHash,
        serverSeed: gameEngine.serverSeed,
        completedAt,
      });
      if (gameEngine.recentHistory.length > 20) {
        gameEngine.recentHistory.pop();
      }

      const audit: AuditLogRecord = {
        id: `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        adminId: adminUser.id,
        adminUsername: adminUser.username,
        action: 'ADMIN_END_FLIGHT',
        targetUsername: null,
        details: `Administrator manually ended flight for round ${gameEngine.roundId} at ${crashMult.toFixed(2)}x.`,
        createdAt: completedAt,
      };
      dbState.auditLogs.unshift(audit);
      await persistChange({ auditLog: audit });

      res.json({
        success: true,
        roundId: gameEngine.roundId,
        crashedAtMultiplier: crashMult,
        phase: gameEngine.phase,
      });
    });
  });

  // Database offline error middleware fallback
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    const errorObj = err as { name?: string; message?: string };
    if (
      errorObj?.name === 'MongooseError' ||
      errorObj?.name === 'MongoNetworkError' ||
      (typeof errorObj?.message === 'string' && errorObj.message.includes('buffering timed out'))
    ) {
      console.warn('[AI Studio] Database offline — returning mock/fallback response');
      if (req.method === 'GET') {
        return res.json(req.path.endsWith('s') || req.path.endsWith('s/') ? [] : {});
      }
      return res.status(503).json({ error: 'Service temporarily unavailable (database offline)' });
    }
    next(err);
  });

  // --------------------------------------------------------------------------
  // STATIC ASSETS & VITE DEV MIDDLEWARE
  // --------------------------------------------------------------------------
  const publicPath = path.join(__dirname, 'public');
  app.use(express.static(publicPath));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Aviator Demo Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
