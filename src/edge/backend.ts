import { UPLOADED_QR_DATA_URI } from '../utils/qrImage';

export interface UserRecord {
  id: string;
  username: string;
  usernameLower: string;
  passwordHash: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  balance: number;
  welcomeBonusAwarded: boolean;
  referralCode?: string;
  referredBy?: string | null;
  referralCount?: number;
  referralEarnings?: number;
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
    | 'DEPOSIT_APPROVED'
    | 'DEPOSIT_BONUS'
    | 'REFERRAL_REWARD'
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

export interface ReferralRecord {
  id: string;
  referrerId: string;
  referrerUsername: string;
  referredUserId: string;
  referredUsername: string;
  rewardAmount: number;
  createdAt: string;
}

export interface SessionRecord {
  token: string;
  userId: string;
  role: 'user' | 'admin';
  expiresAt: number;
}

export interface ActiveRoundBet {
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

export interface CrashRoundHistoryItem {
  roundId: string;
  crashPoint: number;
  serverSeedHash: string;
  serverSeed: string;
  completedAt: string;
}

export interface PersistedGameEngine {
  roundId: string;
  crashPoint: number;
  serverSeed: string;
  serverSeedHash: string;
  roundStartTime: number;
  bettingDurationMs: number;
  crashedHoldMs: number;
  bets: ActiveRoundBet[];
  recentHistory: CrashRoundHistoryItem[];
  nextRound?: {
    roundId: string;
    crashPoint: number;
    serverSeed: string;
    serverSeedHash: string;
  };
}

export interface EdgeDatabaseState {
  users: UserRecord[];
  transactions: TransactionRecord[];
  requests: TransferRequestRecord[];
  referrals: ReferralRecord[];
  auditLogs: AuditLogRecord[];
  config: AppConfigRecord;
  sessions: SessionRecord[];
  game: PersistedGameEngine;
}

export interface EdgeEnv {
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  DEFAULT_WELCOME_BONUS?: string;
  AVIATOR_STORE?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(req: Request): Promise<Response> };
  };
  AVIATOR_KV?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
  ASSETS?: {
    fetch(req: Request): Promise<Response>;
  };
}

export interface StorageAdapter {
  load(): Promise<EdgeDatabaseState | null>;
  save(state: EdgeDatabaseState): Promise<void>;
  storageLabel: string;
}

function roundCoins(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPasswordEdge(password: string): Promise<string> {
  const salt = randomHex(16);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(salt),
      iterations: 60000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const derivedHex = Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:${salt}:${derivedHex}`;
}

async function verifyPasswordEdge(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;
  if (storedHash.startsWith('pbkdf2:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode(salt),
        iterations: 60000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );
    const actualHex = Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
    return actualHex === expectedHex;
  }

  // Scrypt fallback for hashes stored as salt:derivedHex
  const parts = storedHash.split(':');
  if (parts.length === 2) {
    try {
      const nodeCrypto = await import('node:crypto');
      if (nodeCrypto && typeof nodeCrypto.scryptSync === 'function') {
        const [salt, keyHex] = parts;
        const keyBuffer = Buffer.from(keyHex, 'hex');
        const derivedBuffer = nodeCrypto.scryptSync(password, salt, 64);
        if (keyBuffer.length !== derivedBuffer.length) return false;
        return nodeCrypto.timingSafeEqual(keyBuffer, derivedBuffer);
      }
    } catch {
      // In pure web crypto environments without nodejs_compat, scrypt is unavailable
    }
  }

  return false;
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function generateSignedTokenEdge(
  secret: string,
  user: { id: string; username: string; role: 'user' | 'admin'; balance: number; createdAt: string }
): Promise<string> {
  const payload = toBase64Url(
    JSON.stringify({
      id: user.id,
      u: user.username,
      r: user.role,
      b: user.balance,
      c: user.createdAt,
      exp: Date.now() + 24 * 60 * 60 * 1000,
      n: randomHex(6),
    })
  );
  const sig = (await sha256Hex(`${payload}.${secret}`)).slice(0, 32);
  return `${payload}.${sig}`;
}

async function generateProvablyFairRound(): Promise<{
  roundId: string;
  serverSeed: string;
  serverSeedHash: string;
  crashPoint: number;
}> {
  const roundId = `FLT-${Date.now().toString(36).toUpperCase()}-${randomHex(2).toUpperCase()}`;
  const serverSeed = randomHex(32);
  const serverSeedHash = await sha256Hex(`${roundId}:${serverSeed}`);

  const hexSlice = serverSeedHash.slice(0, 13);
  const intVal = parseInt(hexSlice, 16);
  const maxVal = Math.pow(2, 52);
  const r = intVal / maxVal;

  if (r < 0.03) {
    return { roundId, serverSeed, serverSeedHash, crashPoint: 1.0 };
  }
  const rawMultiplier = 0.97 / (1 - r);
  const clamped = Math.max(1.01, Math.min(250.0, Math.floor(rawMultiplier * 100) / 100));
  return { roundId, serverSeed, serverSeedHash, crashPoint: clamped };
}

function getFlightDurationMs(crashPoint: number): number {
  if (crashPoint <= 1.0) return 0;
  return Math.max(150, Math.ceil((Math.log(crashPoint) / 0.068) * 1000));
}

async function createInitialState(env: EdgeEnv): Promise<EdgeDatabaseState> {
  const adminUsername = (env.ADMIN_USERNAME || 'admin').trim();
  const adminPassword = env.ADMIN_PASSWORD || 'AdminDemoPassword123!';
  const welcomeBonus = Number(env.DEFAULT_WELCOME_BONUS) || 500;

  const initialRound = await generateProvablyFairRound();
  const nextRound = await generateProvablyFairRound();
  const recentHistory: CrashRoundHistoryItem[] = [];
  for (let i = 10; i >= 1; i--) {
    const sample = await generateProvablyFairRound();
    recentHistory.push({
      roundId: sample.roundId,
      crashPoint: sample.crashPoint,
      serverSeedHash: sample.serverSeedHash,
      serverSeed: sample.serverSeed,
      completedAt: new Date(Date.now() - i * 15000).toISOString(),
    });
  }

  const adminUser: UserRecord = {
    id: `usr_admin_${randomHex(4)}`,
    username: adminUsername,
    usernameLower: adminUsername.toLowerCase(),
    passwordHash: await hashPasswordEdge(adminPassword),
    role: 'admin',
    status: 'active',
    balance: 0,
    welcomeBonusAwarded: false,
    referralCode: adminUsername.toUpperCase(),
    referralCount: 0,
    referralEarnings: 0,
    createdAt: new Date().toISOString(),
  };

  return {
    users: [adminUser],
    transactions: [],
    requests: [],
    referrals: [],
    auditLogs: [],
    config: {
      welcomeBonus,
      placeholderQrUrl: UPLOADED_QR_DATA_URI,
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
    game: {
      roundId: initialRound.roundId,
      crashPoint: initialRound.crashPoint,
      serverSeed: initialRound.serverSeed,
      serverSeedHash: initialRound.serverSeedHash,
      roundStartTime: Date.now(),
      bettingDurationMs: 5000,
      crashedHoldMs: 3500,
      bets: [],
      recentHistory,
      nextRound: {
        roundId: nextRound.roundId,
        crashPoint: nextRound.crashPoint,
        serverSeed: nextRound.serverSeed,
        serverSeedHash: nextRound.serverSeedHash,
      },
    },
  };
}

function creditBetCashout(
  dbState: EdgeDatabaseState,
  bet: ActiveRoundBet,
  cashoutMult: number,
  roundId: string
): boolean {
  if (bet.cashedOut) return false;
  bet.cashedOut = true;
  bet.cashoutMultiplier = cashoutMult;
  const payout = roundCoins(bet.amount * cashoutMult);
  bet.payout = payout;

  const user = dbState.users.find((u) => u.id === bet.userId);
  if (!user) return true;

  const balanceBefore = user.balance;
  user.balance = roundCoins(user.balance + payout);
  dbState.transactions.unshift({
    id: `tx_${Date.now()}_${randomHex(3)}`,
    userId: user.id,
    username: user.username,
    type: 'GAME_WIN',
    amount: payout,
    balanceBefore,
    balanceAfter: user.balance,
    referenceId: roundId,
    description: `Cashed out at ${cashoutMult.toFixed(2)}x on round ${roundId}`,
    createdAt: new Date().toISOString(),
  });
  return true;
}

async function syncGameClock(dbState: EdgeDatabaseState): Promise<{
  phase: 'BETTING' | 'FLYING' | 'CRASHED';
  multiplier: number;
  countdownMs: number;
  mutated: boolean;
}> {
  let mutated = false;
  const now = Date.now();
  const game = dbState.game;

  // Advance completed rounds if time has elapsed past BETTING + FLYING + CRASHED
  let elapsed = now - game.roundStartTime;
  let flightMs = getFlightDurationMs(game.crashPoint);
  let totalCycleMs = game.bettingDurationMs + flightMs + game.crashedHoldMs;

  if (elapsed >= totalCycleMs) {
    // Process any auto-cashouts from the finished round before archiving it
    for (const bet of game.bets) {
      if (!bet.cashedOut && bet.autoCashout !== null && bet.autoCashout <= game.crashPoint) {
        creditBetCashout(dbState, bet, bet.autoCashout, game.roundId);
      }
    }

    game.recentHistory.unshift({
      roundId: game.roundId,
      crashPoint: game.crashPoint,
      serverSeedHash: game.serverSeedHash,
      serverSeed: game.serverSeed,
      completedAt: new Date().toISOString(),
    });
    if (game.recentHistory.length > 20) {
      game.recentHistory = game.recentHistory.slice(0, 20);
    }

    const nextSeed = await generateProvablyFairRound();
    game.roundId = nextSeed.roundId;
    game.crashPoint = nextSeed.crashPoint;
    game.serverSeed = nextSeed.serverSeed;
    game.serverSeedHash = nextSeed.serverSeedHash;
    // Align roundStartTime cleanly so new visitors enter BETTING phase smoothly
    const overshoot = elapsed - totalCycleMs;
    game.roundStartTime = overshoot < game.bettingDurationMs ? now - overshoot : now;
    game.bets = [];
    mutated = true;

    elapsed = now - game.roundStartTime;
    flightMs = getFlightDurationMs(game.crashPoint);
    totalCycleMs = game.bettingDurationMs + flightMs + game.crashedHoldMs;
  }

  if (elapsed < game.bettingDurationMs) {
    return {
      phase: 'BETTING',
      multiplier: 1.0,
      countdownMs: Math.max(0, game.bettingDurationMs - elapsed),
      mutated,
    };
  }

  const flightElapsed = elapsed - game.bettingDurationMs;
  if (flightElapsed < flightMs) {
    const tSeconds = flightElapsed / 1000;
    const currentMult = Math.min(
      game.crashPoint,
      Math.max(1.0, Math.floor(Math.exp(0.068 * tSeconds) * 100) / 100)
    );

    for (const bet of game.bets) {
      if (
        !bet.cashedOut &&
        bet.autoCashout !== null &&
        bet.autoCashout <= game.crashPoint &&
        currentMult >= bet.autoCashout
      ) {
        if (creditBetCashout(dbState, bet, bet.autoCashout, game.roundId)) {
          mutated = true;
        }
      }
    }

    return {
      phase: 'FLYING',
      multiplier: currentMult,
      countdownMs: 0,
      mutated,
    };
  }

  // CRASHED phase
  for (const bet of game.bets) {
    if (!bet.cashedOut && bet.autoCashout !== null && bet.autoCashout <= game.crashPoint) {
      if (creditBetCashout(dbState, bet, bet.autoCashout, game.roundId)) {
        mutated = true;
      }
    }
  }

  return {
    phase: 'CRASHED',
    multiplier: game.crashPoint,
    countdownMs: 0,
    mutated,
  };
}

function parseCookies(cookieHeader?: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const k = pair.slice(0, idx).trim();
      const v = decodeURIComponent(pair.slice(idx + 1).trim());
      result[k] = v;
    }
  }
  return result;
}

async function getSessionFromReq(
  req: Request,
  dbState: EdgeDatabaseState,
  secret: string
): Promise<{ session: SessionRecord; user: UserRecord } | null> {
  const authHeader = req.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const cookies = parseCookies(req.headers.get('cookie'));
  const token = bearer || cookies['aviator_session'];
  if (!token) return null;

  const existingSession = dbState.sessions.find((s) => s.token === token);
  if (existingSession) {
    if (Date.now() > existingSession.expiresAt) {
      dbState.sessions = dbState.sessions.filter((s) => s.token !== token);
      return null;
    }
    const user = dbState.users.find((u) => u.id === existingSession.userId);
    if (user) {
      return { session: existingSession, user };
    }
  }

  // Self-healing fallback: verify HMAC signature on signed token payload
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx <= 0) return null;
  const payloadB64 = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = (await sha256Hex(`${payloadB64}.${secret}`)).slice(0, 32);
  if (sig !== expectedSig) return null;

  try {
    const parsed = JSON.parse(fromBase64Url(payloadB64)) as {
      id: string;
      u: string;
      r: 'user' | 'admin';
      b: number;
      c: string;
      exp: number;
    };
    if (!parsed.id || !parsed.u || Date.now() > parsed.exp) return null;

    let user = dbState.users.find((u) => u.id === parsed.id || u.usernameLower === parsed.u.toLowerCase());
    if (!user) {
      user = {
        id: parsed.id,
        username: parsed.u,
        usernameLower: parsed.u.toLowerCase(),
        passwordHash: '',
        role: parsed.r === 'admin' ? 'admin' : 'user',
        status: 'active',
        balance: roundCoins(Number(parsed.b) || 0),
        welcomeBonusAwarded: true,
        createdAt: parsed.c || new Date().toISOString(),
      };
      dbState.users.push(user);
    }
    const session: SessionRecord = {
      token,
      userId: user.id,
      role: user.role,
      expiresAt: parsed.exp,
    };
    dbState.sessions.push(session);
    return { session, user };
  } catch {
    return null;
  }
}

let currentRequestOrigin: string | null = null;

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    ...extraHeaders,
  };

  if (currentRequestOrigin) {
    headers['Access-Control-Allow-Origin'] = currentRequestOrigin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Vary'] = 'Origin';
  } else {
    headers['Access-Control-Allow-Origin'] = '*';
  }

  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function makeSessionCookieHeader(req: Request, token: string, maxAgeSec = 86400): string {
  const isHttps = req.url.startsWith('https://');
  const sameSite = isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax';
  return `aviator_session=${encodeURIComponent(token)}; Path=/; HttpOnly; ${sameSite}; Max-Age=${maxAgeSec}`;
}

export async function handleEdgeApiRequest(
  req: Request,
  env: EdgeEnv,
  storage: StorageAdapter
): Promise<Response> {
  currentRequestOrigin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return jsonResponse({ ok: true }, 200);
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const secret = env.SESSION_SECRET || 'aviator_demo_default_session_secret_2026';

  let dbState = await storage.load();
  if (!dbState) {
    dbState = await createInitialState(env);
    await storage.save(dbState);
  }

  // Ensure state structures are backward-compatible and fully populated
  if (!dbState.referrals) dbState.referrals = [];
  if (!dbState.transactions) dbState.transactions = [];
  if (!dbState.requests) dbState.requests = [];
  if (!dbState.auditLogs) dbState.auditLogs = [];
  if (!dbState.sessions) dbState.sessions = [];
  if (!dbState.users) dbState.users = [];
  if (!dbState.config) {
    dbState.config = {
      welcomeBonus: 500,
      placeholderQrUrl: UPLOADED_QR_DATA_URI,
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
    };
  } else {
    if (dbState.config.logoUrl === undefined) dbState.config.logoUrl = '';
    if (dbState.config.loadingLogoUrl === undefined) dbState.config.loadingLogoUrl = '';
    if (dbState.config.depositBonusEnabled === undefined) dbState.config.depositBonusEnabled = true;
    if (dbState.config.depositBonusPercent === undefined) dbState.config.depositBonusPercent = 9;
    if (dbState.config.minWithdrawalAmount === undefined) dbState.config.minWithdrawalAmount = 500;
    if (dbState.config.referralBonus === undefined) dbState.config.referralBonus = 50;
    if (dbState.config.houseEdgePercent === undefined) dbState.config.houseEdgePercent = 3;
    if (dbState.config.maxMultiplier === undefined) dbState.config.maxMultiplier = 250;
  }

  // Ensure next round is populated in game engine
  if (!dbState.game.nextRound) {
    const nr = await generateProvablyFairRound();
    dbState.game.nextRound = {
      roundId: nr.roundId,
      crashPoint: nr.crashPoint,
      serverSeed: nr.serverSeed,
      serverSeedHash: nr.serverSeedHash,
    };
  }

  // Ensure admin user always exists
  const adminUsername = (env.ADMIN_USERNAME || 'admin').trim();
  const adminPassword = env.ADMIN_PASSWORD || 'AdminDemoPassword123!';
  if (!dbState.users.some((u) => u.role === 'admin')) {
    dbState.users.push({
      id: `usr_admin_${randomHex(4)}`,
      username: adminUsername,
      usernameLower: adminUsername.toLowerCase(),
      passwordHash: await hashPasswordEdge(adminPassword),
      role: 'admin',
      status: 'active',
      balance: 0,
      welcomeBonusAwarded: false,
      referralCode: adminUsername.toUpperCase(),
      referralCount: 0,
      referralEarnings: 0,
      createdAt: new Date().toISOString(),
    });
    await storage.save(dbState);
  }

  // 1. GET /api/system/status
  if (pathname === '/api/system/status' && req.method === 'GET') {
    return jsonResponse({
      storageMode: storage.storageLabel,
      mongoConfigured: true,
      welcomeBonus: dbState.config.welcomeBonus,
      placeholderQrUrl: dbState.config.placeholderQrUrl || UPLOADED_QR_DATA_URI,
      logoUrl: dbState.config.logoUrl || '',
      loadingLogoUrl: dbState.config.loadingLogoUrl || '',
      depositBonusEnabled: dbState.config.depositBonusEnabled !== false,
      depositBonusPercent: dbState.config.depositBonusPercent ?? 9,
      minWithdrawalAmount: dbState.config.minWithdrawalAmount ?? 500,
      referralBonus: dbState.config.referralBonus ?? 50,
      totalUsers: dbState.users.filter((u) => u.role !== 'admin').length,
    });
  }

  // 2. GET /api/auth/me
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const auth = await getSessionFromReq(req, dbState, secret);
    if (!auth) {
      return jsonResponse({ user: null });
    }
    const u = auth.user;
    return jsonResponse({
      user: {
        id: u.id,
        username: u.username,
        role: u.role,
        status: u.status,
        balance: u.balance,
        welcomeBonusAwarded: u.welcomeBonusAwarded,
        referralCode: u.referralCode,
        referredBy: u.referredBy,
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
  }

  // 3. POST /api/auth/signup
  if (pathname === '/api/auth/signup' && req.method === 'POST') {
    const rawBody = ((await req.json().catch(() => ({}))) || {}) as Record<string, unknown>;
    const candidateUser =
      typeof rawBody.username === 'string'
        ? rawBody.username
        : typeof rawBody.username === 'number'
        ? String(rawBody.username)
        : typeof rawBody.userName === 'string'
        ? rawBody.userName
        : typeof rawBody.user_name === 'string'
        ? rawBody.user_name
        : typeof rawBody.name === 'string'
        ? rawBody.name
        : '';
    const cleanUsername = candidateUser.trim();

    const candidatePass =
      typeof rawBody.password === 'string'
        ? rawBody.password
        : typeof rawBody.pass === 'string'
        ? rawBody.pass
        : '';
    const candidateConfirm =
      typeof rawBody.confirmPassword === 'string'
        ? rawBody.confirmPassword
        : typeof rawBody.confirm_password === 'string'
        ? rawBody.confirm_password
        : candidatePass;
    const candidateRef =
      typeof rawBody.referralCode === 'string'
        ? rawBody.referralCode
        : typeof rawBody.referral_code === 'string'
        ? rawBody.referral_code
        : typeof rawBody.ref === 'string'
        ? rawBody.ref
        : '';

    if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 24) {
      return jsonResponse({ error: 'Username must be between 3 and 24 characters.' }, 400);
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      return jsonResponse(
        { error: 'Username may only contain letters, numbers, and underscores.' },
        400
      );
    }
    if (!candidatePass || candidatePass.length < 6) {
      return jsonResponse({ error: 'Password must be at least 6 characters long.' }, 400);
    }
    if (candidatePass !== candidateConfirm) {
      return jsonResponse({ error: 'Password and Confirm Password do not match.' }, 400);
    }

    const lower = cleanUsername.toLowerCase();
    if (dbState.users.some((u) => u.usernameLower === lower)) {
      return jsonResponse(
        { error: 'That username is already taken. Please choose another username.' },
        409
      );
    }

    // Validate referral code if provided
    let referrer: UserRecord | undefined;
    const rawReferralCode = candidateRef.trim().toUpperCase();
    if (rawReferralCode) {
      referrer = dbState.users.find(
        (u) => (u.referralCode && u.referralCode.toUpperCase() === rawReferralCode) ||
               u.username.toUpperCase() === rawReferralCode
      );
      if (!referrer) {
        return jsonResponse(
          { error: `The referral code "${rawReferralCode}" is invalid or does not exist.` },
          400
        );
      }
    }

    const bonusAmount = roundCoins(Math.max(0, dbState.config.welcomeBonus));
    const nowIso = new Date().toISOString();
    const generatedReferralCode = cleanUsername.toUpperCase().slice(0, 12);

    const newUser: UserRecord = {
      id: `usr_${Date.now()}_${randomHex(3)}`,
      username: cleanUsername,
      usernameLower: lower,
      passwordHash: await hashPasswordEdge(candidatePass),
      role: 'user',
      status: 'active',
      balance: bonusAmount,
      welcomeBonusAwarded: true,
      referralCode: generatedReferralCode,
      referredBy: referrer ? referrer.id : null,
      referralCount: 0,
      referralEarnings: 0,
      createdAt: nowIso,
    };
    dbState.users.push(newUser);

    if (bonusAmount > 0) {
      dbState.transactions.unshift({
        id: `tx_${Date.now()}_${randomHex(3)}`,
        userId: newUser.id,
        username: newUser.username,
        type: 'WELCOME_BONUS',
        amount: bonusAmount,
        balanceBefore: 0,
        balanceAfter: bonusAmount,
        referenceId: `WELCOME-${newUser.id}`,
        description: `Welcome bonus (+₹${bonusAmount.toFixed(2)})`,
        createdAt: nowIso,
      });
    }

    // Reward referrer if valid
    if (referrer) {
      const referralReward = Math.max(0, Number(dbState.config.referralBonus) || 50);
      referrer.referralCount = (referrer.referralCount || 0) + 1;
      if (referralReward > 0) {
        const refBalanceBefore = referrer.balance;
        referrer.balance = roundCoins(referrer.balance + referralReward);
        referrer.referralEarnings = roundCoins((referrer.referralEarnings || 0) + referralReward);

        const refTx: TransactionRecord = {
          id: `tx_${Date.now() + 1}_${randomHex(3)}`,
          userId: referrer.id,
          username: referrer.username,
          type: 'REFERRAL_REWARD',
          amount: referralReward,
          balanceBefore: refBalanceBefore,
          balanceAfter: referrer.balance,
          referenceId: newUser.id,
          description: `Referral reward for inviting ${newUser.username} (+₹${referralReward.toFixed(2)})`,
          createdAt: nowIso,
        };
        dbState.transactions.unshift(refTx);

        dbState.referrals.unshift({
          id: `ref_${Date.now()}_${randomHex(3)}`,
          referrerId: referrer.id,
          referrerUsername: referrer.username,
          referredUserId: newUser.id,
          referredUsername: newUser.username,
          rewardAmount: referralReward,
          createdAt: nowIso,
        });
      }
    }

    const token = await generateSignedTokenEdge(secret, newUser);
    dbState.sessions.push({
      token,
      userId: newUser.id,
      role: 'user',
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    await storage.save(dbState);

    return jsonResponse(
      {
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
          referralCount: newUser.referralCount || 0,
          referralEarnings: newUser.referralEarnings || 0,
          createdAt: newUser.createdAt,
        },
      },
      201,
      { 'Set-Cookie': makeSessionCookieHeader(req, token) }
    );
  }

  // 4. POST /api/auth/login
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const rawBody = ((await req.json().catch(() => ({}))) || {}) as Record<string, unknown>;
    const candidateUser =
      typeof rawBody.username === 'string'
        ? rawBody.username
        : typeof rawBody.username === 'number'
        ? String(rawBody.username)
        : typeof rawBody.userName === 'string'
        ? rawBody.userName
        : typeof rawBody.user_name === 'string'
        ? rawBody.user_name
        : '';
    const cleanUsername = candidateUser.trim().toLowerCase();

    const candidatePass =
      typeof rawBody.password === 'string'
        ? rawBody.password
        : typeof rawBody.pass === 'string'
        ? rawBody.pass
        : '';

    if (!cleanUsername || !candidatePass) {
      return jsonResponse({ error: 'Please enter both your username and password.' }, 400);
    }

    const user = dbState.users.find((u) => u.usernameLower === cleanUsername);
    if (!user || !(await verifyPasswordEdge(candidatePass, user.passwordHash))) {
      return jsonResponse({ error: 'Invalid username or password.' }, 401);
    }
    if (user.status === 'suspended') {
      return jsonResponse(
        { error: 'Your account has been suspended. Please contact the administrator.' },
        403
      );
    }

    const token = await generateSignedTokenEdge(secret, user);
    dbState.sessions.push({
      token,
      userId: user.id,
      role: user.role,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    await storage.save(dbState);

    return jsonResponse(
      {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          status: user.status,
          balance: user.balance,
          welcomeBonusAwarded: user.welcomeBonusAwarded,
          referralCode: user.referralCode,
          referredBy: user.referredBy,
          referralCount: user.referralCount || 0,
          referralEarnings: user.referralEarnings || 0,
          createdAt: user.createdAt,
        },
      },
      200,
      { 'Set-Cookie': makeSessionCookieHeader(req, token) }
    );
  }

  // 5. POST /api/admin/login
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    const rawBody = ((await req.json().catch(() => ({}))) || {}) as Record<string, unknown>;
    const candidateUser =
      typeof rawBody.username === 'string'
        ? rawBody.username
        : typeof rawBody.username === 'number'
        ? String(rawBody.username)
        : typeof rawBody.userName === 'string'
        ? rawBody.userName
        : typeof rawBody.user_name === 'string'
        ? rawBody.user_name
        : typeof rawBody.user === 'string'
        ? rawBody.user
        : '';
    const cleanUsername = candidateUser.trim().toLowerCase();

    const candidatePass =
      typeof rawBody.password === 'string'
        ? rawBody.password
        : typeof rawBody.pass === 'string'
        ? rawBody.pass
        : '';

    if (!cleanUsername || !candidatePass) {
      return jsonResponse({ error: 'Please enter administrator username and password.' }, 400);
    }

    const admin = dbState.users.find(
      (u) => u.usernameLower === cleanUsername && u.role === 'admin'
    );
    if (!admin || !(await verifyPasswordEdge(candidatePass, admin.passwordHash))) {
      return jsonResponse({ error: 'Invalid administrator credentials.' }, 401);
    }

    const token = await generateSignedTokenEdge(secret, admin);
    dbState.sessions.push({
      token,
      userId: admin.id,
      role: 'admin',
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    await storage.save(dbState);

    return jsonResponse(
      {
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
      },
      200,
      { 'Set-Cookie': makeSessionCookieHeader(req, token) }
    );
  }

  // 6. POST /api/auth/logout
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const auth = await getSessionFromReq(req, dbState, secret);
    if (auth) {
      dbState.sessions = dbState.sessions.filter((s) => s.token !== auth.session.token);
      await storage.save(dbState);
    }
    return jsonResponse({ success: true }, 200, {
      'Set-Cookie': makeSessionCookieHeader(req, '', 0),
    });
  }

  // 7. GET /api/game/state
  if (pathname === '/api/game/state' && req.method === 'GET') {
    const live = await syncGameClock(dbState);
    if (live.mutated) {
      await storage.save(dbState);
    }
    const auth = await getSessionFromReq(req, dbState, secret);
    const game = dbState.game;
    const userBets = auth ? game.bets.filter((b) => b.userId === auth.user.id) : [];
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

    return jsonResponse({
      roundId: game.roundId,
      phase: live.phase,
      multiplier: live.multiplier,
      countdownMs: live.countdownMs,
      serverSeedHash: game.serverSeedHash,
      crashPoint: live.phase === 'CRASHED' ? game.crashPoint : null,
      serverSeed: live.phase === 'CRASHED' ? game.serverSeed : null,
      activeBets: game.bets.map((b) => ({
        username: b.username,
        slotId: b.slotId || 'slot-1',
        amount: b.amount,
        cashedOut: b.cashedOut,
        cashoutMultiplier: b.cashoutMultiplier,
        payout: b.payout,
      })),
      myBet,
      myBets,
      recentHistory: game.recentHistory.slice(0, 15),
      userBalance: auth ? auth.user.balance : null,
      phaseStartTime: game.roundStartTime,
      serverTime: Date.now(),
      nextRound: game.nextRound
        ? {
            roundId: game.nextRound.roundId,
            crashPoint: game.nextRound.crashPoint,
            serverSeedHash: game.nextRound.serverSeedHash,
          }
        : undefined,
    });
  }

  // 8. POST /api/game/bet
  if (pathname === '/api/game/bet' && req.method === 'POST') {
    const auth = await getSessionFromReq(req, dbState, secret);
    if (!auth) {
      return jsonResponse(
        { error: 'Your session has expired or you are not logged in. Please sign in.' },
        401
      );
    }
    if (auth.user.status === 'suspended') {
      return jsonResponse({ error: 'This account has been suspended by an administrator.' }, 403);
    }
    if (auth.user.role !== 'user') {
      return jsonResponse(
        { error: 'Administrator accounts cannot place bets. Please sign in with a player account.' },
        403
      );
    }

    const live = await syncGameClock(dbState);
    if (live.phase !== 'BETTING') {
      if (live.mutated) await storage.save(dbState);
      return jsonResponse(
        { error: 'Bets can only be placed during the pre-flight countdown phase.' },
        400
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      amount?: number;
      autoCashout?: number | null;
      slotId?: string;
    };
    const betAmount = roundCoins(Number(body.amount));
    const normalizedSlotId = body.slotId ? String(body.slotId).trim() : 'slot-1';

    if (!Number.isFinite(betAmount) || betAmount < 1) {
      return jsonResponse({ error: 'Minimum bet amount is ₹1.00.' }, 400);
    }
    if (betAmount > 10000) {
      return jsonResponse({ error: 'Maximum bet per round is ₹10,000.00.' }, 400);
    }

    let parsedAutoCashout: number | null = null;
    if (body.autoCashout !== undefined && body.autoCashout !== null && Number(body.autoCashout) > 0) {
      parsedAutoCashout = roundCoins(Number(body.autoCashout));
      if (parsedAutoCashout < 1.1 || parsedAutoCashout > 200) {
        return jsonResponse(
          { error: 'Auto cashout multiplier must be between 1.10x and 200.00x.' },
          400
        );
      }
    }

    const currentUser = auth.user;
    if (dbState.game.bets.some((b) => b.userId === currentUser.id && (b.slotId || 'slot-1') === normalizedSlotId)) {
      return jsonResponse({ error: `You already have an active bet in ${normalizedSlotId} for this flight round.` }, 409);
    }
    if (currentUser.balance < betAmount) {
      return jsonResponse({ error: 'Insufficient balance for this bet.' }, 400);
    }

    const balanceBefore = currentUser.balance;
    currentUser.balance = roundCoins(currentUser.balance - betAmount);

    const newBet: ActiveRoundBet = {
      betId: `bet_${Date.now()}_${randomHex(3)}`,
      userId: currentUser.id,
      username: currentUser.username,
      slotId: normalizedSlotId,
      amount: betAmount,
      autoCashout: parsedAutoCashout,
      cashedOut: false,
      cashoutMultiplier: null,
      payout: null,
    };
    dbState.game.bets.push(newBet);

    dbState.transactions.unshift({
      id: `tx_${Date.now()}_${randomHex(3)}`,
      userId: currentUser.id,
      username: currentUser.username,
      type: 'GAME_BET',
      amount: -betAmount,
      balanceBefore,
      balanceAfter: currentUser.balance,
      referenceId: dbState.game.roundId,
      description: `Placed bet on round ${dbState.game.roundId} (${normalizedSlotId})`,
      createdAt: new Date().toISOString(),
    });

    await storage.save(dbState);
    return jsonResponse({
      success: true,
      balance: currentUser.balance,
      bet: newBet,
    });
  }

  // 9. POST /api/game/cashout
  if (pathname === '/api/game/cashout' && req.method === 'POST') {
    const auth = await getSessionFromReq(req, dbState, secret);
    if (!auth) {
      return jsonResponse({ error: 'Please sign in.' }, 401);
    }

    const live = await syncGameClock(dbState);
    if (live.phase !== 'FLYING') {
      if (live.mutated) await storage.save(dbState);
      return jsonResponse({ error: 'Flight is not active or has already flown away.' }, 400);
    }

    const body = (await req.json().catch(() => ({}))) as { slotId?: string };
    const targetSlotId = body.slotId ? String(body.slotId).trim() : undefined;

    let activeBet: ActiveRoundBet | undefined;
    if (targetSlotId) {
      activeBet = dbState.game.bets.find(
        (b) => b.userId === auth.user.id && (b.slotId || 'slot-1') === targetSlotId
      );
    } else {
      activeBet = dbState.game.bets.find((b) => b.userId === auth.user.id && !b.cashedOut);
    }

    if (!activeBet) {
      return jsonResponse({ error: 'No active bet found for your account in this round.' }, 404);
    }
    if (activeBet.cashedOut) {
      return jsonResponse({ error: 'You have already cashed out this flight.' }, 409);
    }

    const cashoutMult = Math.min(live.multiplier, dbState.game.crashPoint);
    creditBetCashout(dbState, activeBet, cashoutMult, dbState.game.roundId);
    await storage.save(dbState);

    return jsonResponse({
      success: true,
      slotId: activeBet.slotId,
      cashoutMultiplier: activeBet.cashoutMultiplier,
      payout: activeBet.payout,
      balance: auth.user.balance,
    });
  }

  // 10. GET /api/wallet/summary
  if (pathname === '/api/wallet/summary' && req.method === 'GET') {
    const auth = await getSessionFromReq(req, dbState, secret);
    if (!auth) {
      return jsonResponse({ error: 'Please sign in.' }, 401);
    }
    const currentUser = auth.user;
    return jsonResponse({
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
      transactions: dbState.transactions.filter((t) => t.userId === currentUser.id).slice(0, 100),
      requests: dbState.requests
        .filter((r) => r.userId === currentUser.id)
        .slice(0, 100)
        .map((r) => {
          const { bankAccountNumber: _omit, ...rest } = r;
          return rest;
        }),
    });
  }

  // 10b. GET /api/wallet/referrals
  if (pathname === '/api/wallet/referrals' && req.method === 'GET') {
    const auth = await getSessionFromReq(req, dbState, secret);
    if (!auth) {
      return jsonResponse({ error: 'Please sign in.' }, 401);
    }
    const currentUser = auth.user;
    const myReferrals = (dbState.referrals || [])
      .filter((r) => r.referrerId === currentUser.id)
      .slice(0, 100);
    const host = req.headers.get('host') || 'localhost:3000';
    const proto = req.url.startsWith('https') ? 'https' : 'http';
    const referralCode = currentUser.referralCode || currentUser.username.toUpperCase();
    const referralLink = `${proto}://${host}/?ref=${encodeURIComponent(referralCode)}`;

    return jsonResponse({
      referralCode,
      referralLink,
      referralBonus: Number(dbState.config.referralBonus) || 50,
      totalReferred: currentUser.referralCount || myReferrals.length,
      totalEarnings: currentUser.referralEarnings || roundCoins(myReferrals.reduce((sum, r) => sum + r.rewardAmount, 0)),
      history: myReferrals,
    });
  }

  // 11. POST /api/wallet/deposit
  if (pathname === '/api/wallet/deposit' && req.method === 'POST') {
    const auth = await getSessionFromReq(req, dbState, secret);
    if (!auth) return jsonResponse({ error: 'Please sign in.' }, 401);
    if (auth.user.role !== 'user') {
      return jsonResponse({ error: 'Only player accounts can submit deposit requests.' }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as { amount?: number; userNote?: string };
    const cleanAmount = roundCoins(Number(body.amount));
    if (!Number.isFinite(cleanAmount) || cleanAmount < 1 || cleanAmount > 50000) {
      return jsonResponse({ error: 'Deposit amount must be between ₹1 and ₹50,000.' }, 400);
    }

    const pendingCount = dbState.requests.filter(
      (r) => r.userId === auth.user.id && r.type === 'DEPOSIT' && r.status === 'PENDING'
    ).length;
    if (pendingCount >= 3) {
      return jsonResponse(
        { error: 'You already have 3 pending deposit requests awaiting review.' },
        429
      );
    }

    const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const bonusEnabled = dbState.config.depositBonusEnabled !== false;
    const bonusPercent = bonusEnabled ? Math.max(0, Number(dbState.config.depositBonusPercent) || 9) : 0;
    const bonusAmount = bonusEnabled && bonusPercent > 0 ? roundCoins(cleanAmount * (bonusPercent / 100)) : 0;
    const creditedAmount = roundCoins(cleanAmount + bonusAmount);

    const requestRecord: TransferRequestRecord = {
      id: `DEP-${dateCode}-${randomHex(3).toUpperCase()}`,
      userId: auth.user.id,
      username: auth.user.username,
      type: 'DEPOSIT',
      amount: cleanAmount,
      bonusAmount,
      bonusPercent,
      creditedAmount,
      status: 'PENDING',
      userNote: (body.userNote || 'Deposit request').trim().slice(0, 140),
      adminNote: '',
      processedBy: null,
      processedAt: null,
      createdAt: new Date().toISOString(),
    };
    dbState.requests.unshift(requestRecord);
    await storage.save(dbState);

    const bonusMsg = bonusAmount > 0
      ? ` Includes ${bonusPercent}% deposit bonus (+₹${bonusAmount.toFixed(2)}). Total credited upon approval: ₹${creditedAmount.toFixed(2)}.`
      : '';

    return jsonResponse(
      {
        request: requestRecord,
        bonusAmount,
        bonusPercent,
        creditedAmount,
        message: `Deposit request submitted (Status: Pending).${bonusMsg} Balance will be credited after administrator review.`,
      },
      201
    );
  }

  // 12. POST /api/wallet/withdraw
  if (pathname === '/api/wallet/withdraw' && req.method === 'POST') {
    const auth = await getSessionFromReq(req, dbState, secret);
    if (!auth) return jsonResponse({ error: 'Please sign in.' }, 401);
    if (auth.user.role !== 'user') {
      return jsonResponse({ error: 'Only player accounts can submit withdrawal requests.' }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as {
      amount?: number;
      mobileNumber?: string;
      accountHolderName?: string;
      bankAccountNumber?: string;
      confirmBankAccountNumber?: string;
      ifscCode?: string;
      upiId?: string;
      userNote?: string;
    };

    const cleanAmount = roundCoins(Number(body.amount));
    const cleanMobile = (body.mobileNumber || '').trim().replace(/[\s\-+]/g, '');
    const cleanHolderName = (body.accountHolderName || '').trim();
    const cleanAccount = (body.bankAccountNumber || '').trim().replace(/\s+/g, '');
    const cleanConfirm = (body.confirmBankAccountNumber || '').trim().replace(/\s+/g, '');
    const cleanIfsc = (body.ifscCode || '').trim().toUpperCase();
    const cleanUpi = (body.upiId || '').trim();

    // 1. Minimum withdrawal amount configured by administrator (Server validated)
    const minWithdrawal = Math.max(1, Number(dbState.config.minWithdrawalAmount) || 500);
    if (!Number.isFinite(cleanAmount) || cleanAmount < minWithdrawal) {
      return jsonResponse({ error: `Minimum withdrawal amount is ₹${minWithdrawal.toFixed(2)}.` }, 400);
    }

    // 2. Validate Mobile Number (10 digits)
    if (!cleanMobile || !/^\d{10}$/.test(cleanMobile)) {
      return jsonResponse({ error: 'Please enter a valid 10-digit mobile number.' }, 400);
    }

    // 3. Validate Account Holder Name
    if (!cleanHolderName || cleanHolderName.length < 2 || cleanHolderName.length > 70) {
      return jsonResponse({ error: 'Please enter a valid Bank Account Holder Name (2 to 70 characters).' }, 400);
    }

    // 4. Validate Bank Account Number (9 to 18 digits)
    if (!cleanAccount || !/^\d{9,18}$/.test(cleanAccount)) {
      return jsonResponse({ error: 'Bank Account Number must be between 9 and 18 digits.' }, 400);
    }

    // 5. Validate Confirm Bank Account Number
    if (cleanConfirm !== cleanAccount) {
      return jsonResponse({ error: 'Bank Account Number and Confirm Account Number do not match.' }, 400);
    }

    // 6. Validate IFSC Code format (11 alphanumeric characters)
    if (!cleanIfsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      return jsonResponse(
        {
          error:
            'Please enter a valid 11-character IFSC code (format: 4 letters, 0, then 6 alphanumeric characters, e.g. SBIN0001234).',
        },
        400
      );
    }

    const currentUser = auth.user;
    if (currentUser.balance < cleanAmount) {
      return jsonResponse(
        { error: `Insufficient available balance. Available: ₹${currentUser.balance.toFixed(2)}.` },
        400
      );
    }

    const pendingWithdrawals = dbState.requests.filter(
      (r) => r.userId === currentUser.id && r.type === 'WITHDRAWAL' && r.status === 'PENDING'
    ).length;
    if (pendingWithdrawals >= 3) {
      return jsonResponse(
        { error: 'You already have 3 pending withdrawal requests awaiting review.' },
        429
      );
    }

    const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const requestId = `WDR-${dateCode}-${randomHex(3).toUpperCase()}`;
    const nowIso = new Date().toISOString();

    // Mask bank account number (only reveal last 4 digits)
    const maskedAccount =
      cleanAccount.length > 4
        ? `•••• •••• ${cleanAccount.slice(-4)}`
        : cleanAccount;

    const balanceBefore = currentUser.balance;
    currentUser.balance = roundCoins(currentUser.balance - cleanAmount);

    const combinedNote = [
      `Holder: ${cleanHolderName}`,
      `A/C: ${maskedAccount}`,
      `IFSC: ${cleanIfsc}`,
      `Mobile: ${cleanMobile}`,
      cleanUpi ? `UPI: ${cleanUpi}` : '',
      body.userNote ? body.userNote.trim() : '',
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

    dbState.requests.unshift(requestRecord);
    dbState.transactions.unshift({
      id: `tx_${Date.now()}_${randomHex(3)}`,
      userId: currentUser.id,
      username: currentUser.username,
      type: 'WITHDRAWAL_RESERVE',
      amount: -cleanAmount,
      balanceBefore,
      balanceAfter: currentUser.balance,
      referenceId: requestId,
      description: `Reserved ₹${cleanAmount.toFixed(2)} for withdrawal ${requestId} (${cleanHolderName} · ${maskedAccount})`,
      createdAt: nowIso,
    });

    await storage.save(dbState);
    const { bankAccountNumber: _omitAcc, ...sanitizedRecord } = requestRecord;
    return jsonResponse(
      {
        request: sanitizedRecord,
        balance: currentUser.balance,
        message: 'Withdrawal request submitted and amount reserved awaiting administrator review.',
      },
      201
    );
  }

  // --------------------------------------------------------------------------
  // ADMIN ROUTES
  // --------------------------------------------------------------------------
  if (pathname.startsWith('/api/admin/')) {
    const auth = await getSessionFromReq(req, dbState, secret);
    if (!auth) {
      return jsonResponse({ error: 'Administrator authentication required.' }, 401);
    }
    if (auth.user.role !== 'admin') {
      return jsonResponse(
        { error: 'Access denied. Administrator privileges are required for this action.' },
        403
      );
    }
    const adminUser = auth.user;

    if ((pathname === '/api/admin/overview' || pathname === '/api/admin/users') && req.method === 'GET') {
      const searchQuery = (url.searchParams.get('search') || '').trim().toLowerCase();
      const playerUsers = dbState.users
        .filter((u) => u.role !== 'admin')
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const filteredUsers = searchQuery
        ? playerUsers.filter(
            (u) =>
              u.usernameLower.includes(searchQuery) || u.id.toLowerCase().includes(searchQuery)
          )
        : playerUsers;

      const sanitizedUsers = filteredUsers.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        status: u.status,
        balance: u.balance,
        welcomeBonusAwarded: u.welcomeBonusAwarded,
        createdAt: u.createdAt,
      }));

      if (pathname === '/api/admin/users') {
        return jsonResponse({ total: playerUsers.length, users: sanitizedUsers });
      }

      return jsonResponse({
        metrics: {
          totalRegisteredUsers: playerUsers.length,
          activeUsers: playerUsers.filter((u) => u.status === 'active').length,
          suspendedUsers: playerUsers.filter((u) => u.status === 'suspended').length,
          pendingDeposits: dbState.requests.filter(
            (r) => r.type === 'DEPOSIT' && r.status === 'PENDING'
          ).length,
          pendingWithdrawals: dbState.requests.filter(
            (r) => r.type === 'WITHDRAWAL' && r.status === 'PENDING'
          ).length,
        },
        config: dbState.config,
        users: sanitizedUsers,
        requests: dbState.requests.slice(0, 200),
        transactions: dbState.transactions.slice(0, 200),
        auditLogs: dbState.auditLogs.slice(0, 200),
      });
    }

    if (pathname === '/api/admin/requests' && req.method === 'GET') {
      return jsonResponse({ requests: dbState.requests.slice(0, 200) });
    }

    const balanceMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/balance$/);
    if (balanceMatch && req.method === 'POST') {
      const userId = decodeURIComponent(balanceMatch[1]);
      const body = (await req.json().catch(() => ({}))) as {
        operation?: 'ADD' | 'SUBTRACT';
        amount?: number;
        reason?: string;
      };
      const cleanReason = (body.reason || '').trim();
      if (!cleanReason || cleanReason.length < 3) {
        return jsonResponse(
          { error: 'A clear reason (at least 3 characters) is required for every balance adjustment.' },
          400
        );
      }
      const cleanAmount = roundCoins(Number(body.amount));
      if (!Number.isFinite(cleanAmount) || cleanAmount <= 0 || cleanAmount > 1000000) {
        return jsonResponse(
          { error: 'Adjustment amount must be between ₹0.01 and ₹1,000,000.' },
          400
        );
      }
      if (body.operation !== 'ADD' && body.operation !== 'SUBTRACT') {
        return jsonResponse({ error: 'Operation must be ADD or SUBTRACT.' }, 400);
      }

      const targetUser = dbState.users.find((u) => u.id === userId && u.role !== 'admin');
      if (!targetUser) {
        return jsonResponse({ error: 'Target player account not found.' }, 404);
      }

      const signedDelta = body.operation === 'ADD' ? cleanAmount : -cleanAmount;
      if (targetUser.balance + signedDelta < 0) {
        return jsonResponse(
          {
            error: `Cannot subtract ₹${cleanAmount.toFixed(2)}; user only has ₹${targetUser.balance.toFixed(2)}.`,
          },
          400
        );
      }

      const nowIso = new Date().toISOString();
      const balanceBefore = targetUser.balance;
      targetUser.balance = roundCoins(targetUser.balance + signedDelta);

      dbState.transactions.unshift({
        id: `tx_${Date.now()}_${randomHex(3)}`,
        userId: targetUser.id,
        username: targetUser.username,
        type: 'ADMIN_ADJUSTMENT',
        amount: signedDelta,
        balanceBefore,
        balanceAfter: targetUser.balance,
        referenceId: `ADJ-${Date.now()}`,
        description: `Balance ${body.operation === 'ADD' ? 'credit' : 'debit'} (₹${cleanAmount.toFixed(2)}): ${cleanReason}`,
        createdAt: nowIso,
      });

      dbState.auditLogs.unshift({
        id: `aud_${Date.now()}_${randomHex(3)}`,
        adminId: adminUser.id,
        adminUsername: adminUser.username,
        action: body.operation === 'ADD' ? 'BALANCE_ADD' : 'BALANCE_SUBTRACT',
        targetUserId: targetUser.id,
        targetUsername: targetUser.username,
        amount: signedDelta,
        reason: cleanReason,
        details: `${body.operation === 'ADD' ? '+' : '-'}₹${cleanAmount.toFixed(2)} (₹${balanceBefore.toFixed(2)} -> ₹${targetUser.balance.toFixed(2)}). Reason: ${cleanReason}`,
        createdAt: nowIso,
      });

      await storage.save(dbState);
      return jsonResponse({
        success: true,
        user: {
          id: targetUser.id,
          username: targetUser.username,
          status: targetUser.status,
          balance: targetUser.balance,
        },
      });
    }

    const statusMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
    if (statusMatch && req.method === 'POST') {
      const userId = decodeURIComponent(statusMatch[1]);
      const body = (await req.json().catch(() => ({}))) as {
        status?: 'active' | 'suspended';
        reason?: string;
      };
      if (body.status !== 'active' && body.status !== 'suspended') {
        return jsonResponse({ error: 'Account status must be active or suspended.' }, 400);
      }

      const targetUser = dbState.users.find((u) => u.id === userId && u.role !== 'admin');
      if (!targetUser) {
        return jsonResponse({ error: 'Target player account not found.' }, 404);
      }

      const previousStatus = targetUser.status;
      targetUser.status = body.status;
      if (body.status === 'suspended') {
        dbState.sessions = dbState.sessions.filter((s) => s.userId !== targetUser.id);
      }

      dbState.auditLogs.unshift({
        id: `aud_${Date.now()}_${randomHex(3)}`,
        adminId: adminUser.id,
        adminUsername: adminUser.username,
        action: body.status === 'suspended' ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
        targetUserId: targetUser.id,
        targetUsername: targetUser.username,
        details: `Changed status from ${previousStatus} to ${body.status}. Note: ${(body.reason || 'Administrative status update').trim()}`,
        createdAt: new Date().toISOString(),
      });

      await storage.save(dbState);
      return jsonResponse({
        success: true,
        user: {
          id: targetUser.id,
          username: targetUser.username,
          status: targetUser.status,
          balance: targetUser.balance,
        },
      });
    }

    const reviewMatch = pathname.match(/^\/api\/admin\/requests\/([^/]+)\/review$/);
    if (reviewMatch && req.method === 'POST') {
      const requestId = decodeURIComponent(reviewMatch[1]);
      const body = (await req.json().catch(() => ({}))) as {
        decision?: 'APPROVED' | 'REJECTED';
        adminNote?: string;
      };
      if (body.decision !== 'APPROVED' && body.decision !== 'REJECTED') {
        return jsonResponse({ error: 'Decision must be APPROVED or REJECTED.' }, 400);
      }

      const reqRecord = dbState.requests.find((r) => r.id === requestId);
      if (!reqRecord) {
        return jsonResponse({ error: 'Request not found.' }, 404);
      }
      if (reqRecord.status !== 'PENDING') {
        return jsonResponse(
          {
            error: `This request (${reqRecord.id}) has already been ${reqRecord.status.toLowerCase()} and cannot be processed again.`,
          },
          409
        );
      }

      const targetUser = dbState.users.find((u) => u.id === reqRecord.userId);
      if (!targetUser) {
        return jsonResponse({ error: 'Associated player account not found.' }, 404);
      }

      const nowIso = new Date().toISOString();
      reqRecord.status = body.decision;
      reqRecord.adminNote = (body.adminNote || `Reviewed by ${adminUser.username}`)
        .trim()
        .slice(0, 160);
      reqRecord.processedBy = adminUser.username;
      reqRecord.processedAt = nowIso;

      if (reqRecord.type === 'DEPOSIT' && body.decision === 'APPROVED') {
        const baseAmount = reqRecord.amount;
        const bonusPercent = reqRecord.bonusPercent ?? (dbState.config.depositBonusEnabled !== false ? (Number(dbState.config.depositBonusPercent) || 9) : 0);
        const bonusAmount = reqRecord.bonusAmount ?? (bonusPercent > 0 ? roundCoins(baseAmount * (bonusPercent / 100)) : 0);
        const totalCredit = roundCoins(baseAmount + bonusAmount);
        const balanceBefore = targetUser.balance;
        targetUser.balance = roundCoins(targetUser.balance + totalCredit);

        dbState.transactions.unshift({
          id: `tx_${Date.now()}_${randomHex(3)}`,
          userId: targetUser.id,
          username: targetUser.username,
          type: 'DEPOSIT_APPROVED',
          amount: baseAmount,
          balanceBefore,
          balanceAfter: roundCoins(balanceBefore + baseAmount),
          referenceId: reqRecord.id,
          description: `Approved deposit request ${reqRecord.id}`,
          createdAt: nowIso,
        });

        if (bonusAmount > 0) {
          dbState.transactions.unshift({
            id: `tx_${Date.now() + 1}_${randomHex(3)}`,
            userId: targetUser.id,
            username: targetUser.username,
            type: 'DEPOSIT_BONUS',
            amount: bonusAmount,
            balanceBefore: roundCoins(balanceBefore + baseAmount),
            balanceAfter: targetUser.balance,
            referenceId: reqRecord.id,
            description: `${bonusPercent}% deposit bonus for request ${reqRecord.id} (+₹${bonusAmount.toFixed(2)})`,
            createdAt: nowIso,
          });
        }
      } else if (reqRecord.type === 'WITHDRAWAL' && body.decision === 'REJECTED') {
        const balanceBefore = targetUser.balance;
        targetUser.balance = roundCoins(targetUser.balance + reqRecord.amount);
        dbState.transactions.unshift({
          id: `tx_${Date.now()}_${randomHex(3)}`,
          userId: targetUser.id,
          username: targetUser.username,
          type: 'WITHDRAWAL_REFUND',
          amount: reqRecord.amount,
          balanceBefore,
          balanceAfter: targetUser.balance,
          referenceId: reqRecord.id,
          description: `Refunded reserved balance for rejected withdrawal ${reqRecord.id}`,
          createdAt: nowIso,
        });
      }

      dbState.auditLogs.unshift({
        id: `aud_${Date.now()}_${randomHex(3)}`,
        adminId: adminUser.id,
        adminUsername: adminUser.username,
        action: `${reqRecord.type}_${body.decision}`,
        targetUserId: targetUser.id,
        targetUsername: targetUser.username,
        amount: reqRecord.amount,
        details: `${reqRecord.type} request ${reqRecord.id} for ₹${reqRecord.amount.toFixed(2)} ${body.decision.toLowerCase()}. Note: ${reqRecord.adminNote}`,
        createdAt: nowIso,
      });

      await storage.save(dbState);
      return jsonResponse({
        success: true,
        request: reqRecord,
        updatedBalance: targetUser.balance,
      });
    }

    if (pathname === '/api/admin/config' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as {
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
      const changes: string[] = [];

      if (body.welcomeBonus !== undefined) {
        const cleanBonus = roundCoins(Number(body.welcomeBonus));
        if (!Number.isFinite(cleanBonus) || cleanBonus < 0 || cleanBonus > 100000) {
          return jsonResponse({ error: 'Welcome bonus must be between ₹0 and ₹100,000.' }, 400);
        }
        changes.push(`welcomeBonus: ₹${dbState.config.welcomeBonus} -> ₹${cleanBonus}`);
        dbState.config.welcomeBonus = cleanBonus;
      }

      if (body.resetDefaultQr) {
        dbState.config.placeholderQrUrl = UPLOADED_QR_DATA_URI;
        changes.push('QR code reset to default image');
      } else if (body.placeholderQrUrl !== undefined && body.placeholderQrUrl.trim().length > 0) {
        dbState.config.placeholderQrUrl = body.placeholderQrUrl.trim();
        changes.push('QR code updated');
      }

      if (body.resetDefaultLogo) {
        dbState.config.logoUrl = '';
        changes.push('Game logo reset to default');
      } else if (body.logoUrl !== undefined) {
        const cleanLogo = body.logoUrl.trim();
        if (cleanLogo.length > 0 && !cleanLogo.startsWith('data:image/') && !cleanLogo.startsWith('http://') && !cleanLogo.startsWith('https://') && !cleanLogo.startsWith('/')) {
          return jsonResponse({ error: 'Invalid game logo format. Please provide a valid image data URI or URL.' }, 400);
        }
        dbState.config.logoUrl = cleanLogo;
        changes.push(cleanLogo ? 'Game logo updated' : 'Game logo cleared');
      }

      if (body.resetDefaultLoadingLogo) {
        dbState.config.loadingLogoUrl = '';
        changes.push('Loading screen logo reset to default');
      } else if (body.loadingLogoUrl !== undefined) {
        const cleanLoadingLogo = body.loadingLogoUrl.trim();
        if (cleanLoadingLogo.length > 0 && !cleanLoadingLogo.startsWith('data:image/') && !cleanLoadingLogo.startsWith('http://') && !cleanLoadingLogo.startsWith('https://') && !cleanLoadingLogo.startsWith('/')) {
          return jsonResponse({ error: 'Invalid loading logo format. Please provide a valid image data URI or URL.' }, 400);
        }
        dbState.config.loadingLogoUrl = cleanLoadingLogo;
        changes.push(cleanLoadingLogo ? 'Loading screen logo updated' : 'Loading screen logo cleared');
      }

      if (body.depositBonusEnabled !== undefined) {
        const val = Boolean(body.depositBonusEnabled);
        changes.push(`depositBonusEnabled: ${dbState.config.depositBonusEnabled} -> ${val}`);
        dbState.config.depositBonusEnabled = val;
      }

      if (body.depositBonusPercent !== undefined) {
        const cleanPercent = Math.max(0, Math.min(100, Number(body.depositBonusPercent)));
        changes.push(`depositBonusPercent: ${dbState.config.depositBonusPercent}% -> ${cleanPercent}%`);
        dbState.config.depositBonusPercent = cleanPercent;
      }

      if (body.minWithdrawalAmount !== undefined) {
        const cleanMin = roundCoins(Math.max(1, Math.min(100000, Number(body.minWithdrawalAmount))));
        changes.push(`minWithdrawalAmount: ₹${dbState.config.minWithdrawalAmount} -> ₹${cleanMin}`);
        dbState.config.minWithdrawalAmount = cleanMin;
      }

      if (body.referralBonus !== undefined) {
        const cleanRefBonus = roundCoins(Math.max(0, Math.min(50000, Number(body.referralBonus))));
        changes.push(`referralBonus: ₹${dbState.config.referralBonus ?? 50} -> ₹${cleanRefBonus}`);
        dbState.config.referralBonus = cleanRefBonus;
      }

      if (body.houseEdgePercent !== undefined) {
        const cleanEdge = Math.max(1, Math.min(15, Number(body.houseEdgePercent)));
        changes.push(`houseEdgePercent: ${dbState.config.houseEdgePercent}% -> ${cleanEdge}%`);
        dbState.config.houseEdgePercent = cleanEdge;
      }

      if (body.maxMultiplier !== undefined) {
        const cleanCap = Math.max(10, Math.min(1000, Number(body.maxMultiplier)));
        changes.push(`maxMultiplier: ${dbState.config.maxMultiplier}x -> ${cleanCap}x`);
        dbState.config.maxMultiplier = cleanCap;
      }

      if (body.bettingDurationMs !== undefined) {
        const cleanDuration = Math.max(2000, Math.min(15000, Number(body.bettingDurationMs)));
        changes.push(`bettingDurationMs: ${dbState.config.bettingDurationMs}ms -> ${cleanDuration}ms`);
        dbState.config.bettingDurationMs = cleanDuration;
      }

      if (body.crashedHoldMs !== undefined) {
        const cleanHold = Math.max(1500, Math.min(10000, Number(body.crashedHoldMs)));
        changes.push(`crashedHoldMs: ${dbState.config.crashedHoldMs}ms -> ${cleanHold}ms`);
        dbState.config.crashedHoldMs = cleanHold;
      }

      const nowIso = new Date().toISOString();
      dbState.config.updatedAt = nowIso;
      dbState.config.updatedBy = adminUser.username;

      dbState.auditLogs.unshift({
        id: `aud_${Date.now()}_${randomHex(3)}`,
        adminId: adminUser.id,
        adminUsername: adminUser.username,
        action: 'CONFIG_UPDATED',
        targetUsername: null,
        details: changes.join('; ') || 'Configuration saved',
        createdAt: nowIso,
      });

      await storage.save(dbState);
      return jsonResponse({
        success: true,
        config: dbState.config,
      });
    }

    if (pathname === '/api/admin/game-status' && req.method === 'GET') {
      const live = await syncGameClock(dbState);
      if (live.mutated) await storage.save(dbState);
      const game = dbState.game;
      const now = Date.now();

      return jsonResponse({
        roundId: game.roundId,
        phase: live.phase,
        statusLabel:
          live.phase === 'BETTING' ? 'Waiting' : live.phase === 'FLYING' ? 'Flying' : 'Crashed',
        multiplier: live.multiplier,
        crashPoint: game.crashPoint,
        countdownMs: live.countdownMs,
        phaseStartTime: game.roundStartTime,
        serverTime: now,
        activeBetsCount: game.bets.length,
        totalBetPool: roundCoins(game.bets.reduce((acc, b) => acc + b.amount, 0)),
        serverSeedHash: game.serverSeedHash,
        serverSeed: live.phase === 'CRASHED' ? game.serverSeed : undefined,
        nextRound: game.nextRound
          ? {
              roundId: game.nextRound.roundId,
              crashPoint: game.nextRound.crashPoint,
              serverSeedHash: game.nextRound.serverSeedHash,
            }
          : undefined,
        config: {
          houseEdgePercent: Number(dbState.config.houseEdgePercent) || 3,
          maxMultiplier: Number(dbState.config.maxMultiplier) || 250,
          bettingDurationMs: Number(dbState.config.bettingDurationMs) || 5000,
          crashedHoldMs: Number(dbState.config.crashedHoldMs) || 3500,
        },
        recentHistory: game.recentHistory.slice(0, 15),
      });
    }

    if (pathname === '/api/admin/flight/crash' && req.method === 'POST') {
      const live = await syncGameClock(dbState);
      if (live.phase !== 'FLYING') {
        if (live.mutated) await storage.save(dbState);
        return jsonResponse(
          {
            error: `Cannot end flight: round is currently ${live.phase.toLowerCase()} (only active FLYING rounds can be ended).`,
            phase: live.phase,
          },
          400
        );
      }

      const crashMult = Math.max(1.0, live.multiplier);
      dbState.game.crashPoint = crashMult;
      const nowIso = new Date().toISOString();

      dbState.game.recentHistory.unshift({
        roundId: dbState.game.roundId,
        crashPoint: crashMult,
        serverSeedHash: dbState.game.serverSeedHash,
        serverSeed: dbState.game.serverSeed,
        completedAt: nowIso,
      });
      if (dbState.game.recentHistory.length > 20) {
        dbState.game.recentHistory = dbState.game.recentHistory.slice(0, 20);
      }

      dbState.auditLogs.unshift({
        id: `aud_${Date.now()}_${randomHex(3)}`,
        adminId: adminUser.id,
        adminUsername: adminUser.username,
        action: 'ADMIN_END_FLIGHT',
        targetUsername: null,
        details: `Administrator manually ended flight for round ${dbState.game.roundId} at ${crashMult.toFixed(2)}x.`,
        createdAt: nowIso,
      });

      // Advance round start time so it sits in crashed phase for crashedHoldMs
      const flightDuration = getFlightDurationMs(crashMult);
      dbState.game.roundStartTime = Date.now() - (dbState.game.bettingDurationMs + flightDuration);

      await storage.save(dbState);
      return jsonResponse({
        success: true,
        roundId: dbState.game.roundId,
        crashedAtMultiplier: crashMult,
        phase: 'CRASHED',
      });
    }
  }

    return jsonResponse({ error: `API endpoint not found: ${req.method} ${pathname}` }, 404);
  } catch (err: any) {
    console.error('Unhandled Edge API exception:', err);
    return jsonResponse(
      {
        error:
          'Edge backend server error: ' + (err instanceof Error ? err.message : 'Internal Server Error'),
      },
      500
    );
  }
}
