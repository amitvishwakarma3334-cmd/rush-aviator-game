// Automated Test Suite for Aviator Crash Game audit
const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('=== STARTING COMPLETE AUDIT TEST SUITE ===');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // 1. System Status Check
  console.log('\n--- 1. Testing System Status ---');
  const sysRes = await fetch(`${BASE_URL}/api/system/status`);
  const sysData = await sysRes.json();
  assert(sysRes.status === 200, 'GET /api/system/status returns 200 OK');
  assert(typeof sysData.minWithdrawalAmount === 'number', `minWithdrawalAmount is configured: ₹${sysData.minWithdrawalAmount}`);
  assert(typeof sysData.depositBonusPercent === 'number', `depositBonusPercent is configured: ${sysData.depositBonusPercent}%`);

  // 2. Provably Fair Game State & Next Round
  console.log('\n--- 2. Testing Game State & Provably Fair Engine ---');
  const gameRes = await fetch(`${BASE_URL}/api/game/state`);
  const gameData = await gameRes.json();
  assert(gameRes.status === 200, 'GET /api/game/state returns 200 OK');
  assert(['BETTING', 'FLYING', 'CRASHED'].includes(gameData.phase), `Round phase valid: ${gameData.phase}`);
  assert(typeof gameData.serverSeedHash === 'string' && gameData.serverSeedHash.length === 64, `Provably fair SHA-256 hash valid: ${gameData.serverSeedHash.slice(0, 16)}...`);
  assert(gameData.nextRound && typeof gameData.nextRound.serverSeedHash === 'string', 'Next-round information is pre-generated for provable fairness');

  // 3. User 1 Signup (Referrer)
  console.log('\n--- 3. Testing User Signup & Welcome Bonus ---');
  const user1Name = `player_${Date.now()}`;
  const signup1Res = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: user1Name,
      password: 'Password123!',
      confirmPassword: 'Password123!',
    }),
  });
  const signup1Data = await signup1Res.json();
  assert(signup1Res.status === 200 || signup1Res.status === 201, `User 1 (${user1Name}) registered successfully (HTTP ${signup1Res.status})`);
  assert(signup1Data.user.balance >= 500, `User 1 received welcome bonus: ₹${signup1Data.user.balance}`);
  const user1Token = signup1Data.token;

  // 4. Refer & Earn Generation & History
  console.log('\n--- 4. Testing Refer & Earn System ---');
  const refRes = await fetch(`${BASE_URL}/api/wallet/referrals`, {
    headers: { Authorization: `Bearer ${user1Token}` },
  });
  const refData = await refRes.json();
  assert(refRes.status === 200, 'GET /api/wallet/referrals returns 200 OK');
  assert(typeof refData.referralCode === 'string' && refData.referralCode.length >= 3, `Generated referral code: ${refData.referralCode}`);
  assert(refData.referralLink.includes(refData.referralCode), `Referral link contains code: ${refData.referralLink}`);

  // 5. User 2 Signup using User 1's Referral Code
  console.log('\n--- 5. Testing Referral Qualification & Reward Crediting ---');
  const user2Name = `ref_${Date.now()}`;
  const signup2Res = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: user2Name,
      password: 'Password123!',
      confirmPassword: 'Password123!',
      referralCode: refData.referralCode,
    }),
  });
  const signup2Data = await signup2Res.json();
  assert(signup2Res.status === 200 || signup2Res.status === 201, `User 2 (${user2Name}) signed up with referral code (HTTP ${signup2Res.status})`);
  assert(signup2Data.user.referredBy === signup1Data.user.id, `User 2 correctly tracks referrer ID: ${signup2Data.user.referredBy}`);
  const user2Token = signup2Data.token;

  // Check User 1 received referral reward
  const refCheckRes = await fetch(`${BASE_URL}/api/wallet/referrals`, {
    headers: { Authorization: `Bearer ${user1Token}` },
  });
  const refCheckData = await refCheckRes.json();
  assert(refCheckData.totalReferred >= 1, `User 1 referral count updated to ${refCheckData.totalReferred}`);
  assert(refCheckData.totalEarnings > 0, `User 1 referral earnings recorded: ₹${refCheckData.totalEarnings}`);
  assert(refCheckData.history.some((h) => h.referredUsername === user2Name), `Referral history records @${user2Name}`);

  // 6. Deposit Request & Bonus Calculation
  console.log('\n--- 6. Testing Deposit & Bonus Verification ---');
  const depositRes = await fetch(`${BASE_URL}/api/wallet/deposit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user2Token}`,
    },
    body: JSON.stringify({
      amount: 500,
      utr: `UTR${Date.now()}`,
    }),
  });
  const depositData = await depositRes.json();
  assert(depositRes.status === 200 || depositRes.status === 201, `Deposit request submitted for ₹500 (HTTP ${depositRes.status})`);
  assert(depositData.request.bonusAmount !== undefined, `Calculated bonus amount attached: ₹${depositData.request.bonusAmount}`);
  const depositRequestId = depositData.request.id;

  // 7. Admin Login & Deposit Approval with Bonus Crediting
  console.log('\n--- 7. Testing Admin Review & Bonus Ledger Crediting ---');
  const adminLoginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: process.env.ADMIN_PASSWORD || 'AdminDemoPassword123!',
    }),
  });
  const adminLoginData = await adminLoginRes.json();
  assert(adminLoginRes.status === 200, 'Admin login succeeded');
  const adminToken = adminLoginData.token;

  // Approve deposit
  const balBefore = signup2Data.user.balance;
  const reviewRes = await fetch(`${BASE_URL}/api/admin/requests/${depositRequestId}/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      decision: 'APPROVED',
      adminNote: 'Automated verification test approval',
    }),
  });
  const reviewData = await reviewRes.json();
  assert(reviewRes.status === 200, 'Admin approved deposit');
  const expectedTotalCredit = 500 + depositData.request.bonusAmount;
  assert(
    Math.abs(reviewData.updatedBalance - (balBefore + expectedTotalCredit)) < 0.05,
    `User 2 balance credited with base ₹500 + bonus ₹${depositData.request.bonusAmount} = ₹${expectedTotalCredit.toFixed(2)} (New balance: ₹${reviewData.updatedBalance.toFixed(2)})`
  );

  // Check ledger in User 2 wallet
  const summaryRes = await fetch(`${BASE_URL}/api/wallet/summary`, {
    headers: { Authorization: `Bearer ${user2Token}` },
  });
  const summaryData = await summaryRes.json();
  const bonusTx = summaryData.transactions.find((t) => t.type === 'DEPOSIT_BONUS');
  assert(Boolean(bonusTx), 'Deposit bonus recorded as distinct DEPOSIT_BONUS transaction in ledger');

  // 8. Server-Enforced Withdrawal Minimum & Field Validation
  console.log('\n--- 8. Testing Withdrawal Minimum Enforcement ---');
  // First test below minimum
  const belowMinRes = await fetch(`${BASE_URL}/api/wallet/withdraw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user2Token}`,
    },
    body: JSON.stringify({
      amount: 10,
      mobileNumber: '9876543210',
      accountHolderName: 'Test Player',
      bankAccountNumber: '123456789012',
      confirmBankAccountNumber: '123456789012',
      ifscCode: 'SBIN0001234',
    }),
  });
  const belowMinData = await belowMinRes.json();
  assert(belowMinRes.status === 400, `Withdrawal below minimum rejected with 400: "${belowMinData.error}"`);

  // Test valid withdrawal meeting min threshold
  const minAmt = summaryData.config.minWithdrawalAmount || 500;
  const validWithdrawRes = await fetch(`${BASE_URL}/api/wallet/withdraw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user2Token}`,
    },
    body: JSON.stringify({
      amount: minAmt,
      mobileNumber: '9876543210',
      accountHolderName: 'Test Player',
      bankAccountNumber: '123456789012',
      confirmBankAccountNumber: '123456789012',
      ifscCode: 'SBIN0001234',
      upiId: 'test@upi',
    }),
  });
  const validWithdrawData = await validWithdrawRes.json();
  assert(
    validWithdrawRes.status === 200 || validWithdrawRes.status === 201,
    `Withdrawal of ₹${minAmt} accepted and reserved in wallet (HTTP ${validWithdrawRes.status})`
  );

  // 9. Admin Settings Persistent Source & Updates (Setting 9% deposit bonus & ₹500 min withdrawal)
  console.log('\n--- 9. Testing Admin Configuration Persistence ---');
  const updateConfigRes = await fetch(`${BASE_URL}/api/admin/config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      depositBonusPercent: 9,
      minWithdrawalAmount: 500,
      referralBonus: 50,
      logoUrl: 'https://example.com/custom-logo.png',
      loadingLogoUrl: 'https://example.com/custom-loading-logo.png',
    }),
  });
  const updateConfigData = await updateConfigRes.json();
  assert(updateConfigRes.status === 200, 'Admin config updated');
  assert(updateConfigData.config.depositBonusPercent === 9, 'Config depositBonusPercent persisted as 9%');
  assert(updateConfigData.config.minWithdrawalAmount === 500, 'Config minWithdrawalAmount persisted as ₹500');
  assert(updateConfigData.config.referralBonus === 50, 'Config referralBonus persisted as ₹50');
  assert(updateConfigData.config.logoUrl === 'https://example.com/custom-logo.png', 'Config logoUrl persisted');
  assert(updateConfigData.config.loadingLogoUrl === 'https://example.com/custom-loading-logo.png', 'Config loadingLogoUrl persisted');

  // Verify wallet summary returns updated config
  const summaryCheckRes = await fetch(`${BASE_URL}/api/wallet/summary`, {
    headers: { Authorization: `Bearer ${user2Token}` },
  });
  const summaryCheckData = await summaryCheckRes.json();
  assert(summaryCheckData.config.depositBonusPercent === 9, 'Wallet summary reflects 9% bonus');
  assert(summaryCheckData.config.minWithdrawalAmount === 500, 'Wallet summary reflects ₹500 min withdrawal');

  // 10. Admin Game-Status and Flight Crash Endpoint
  console.log('\n--- 10. Testing Admin Live Flight Controls ---');
  const adminGameStatusRes = await fetch(`${BASE_URL}/api/admin/game-status`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminGameStatusData = await adminGameStatusRes.json();
  assert(adminGameStatusRes.status === 200, 'GET /api/admin/game-status returns 200 OK');
  assert(['BETTING', 'FLYING', 'CRASHED'].includes(adminGameStatusData.phase), `Live phase: ${adminGameStatusData.phase}`);

  console.log(`\n========================================`);
  console.log(`AUDIT TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test run failed with unhandled error:', err);
  process.exit(1);
});
