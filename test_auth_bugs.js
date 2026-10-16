// test_auth_bugs.js
// Verification of the two authentication bug fixes
const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('=== AUTHENTICATION VERIFICATION TEST SUITE ===\n');
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

  // -------------------------------------------------------------
  // TEST 1: SIGNUP WITH VALID USERNAME `amit4578` (BUG 1 FIX)
  // -------------------------------------------------------------
  console.log('--- Test Group 1: Signup Validation (Bug 1) ---');

  const testPass = 'Secret123!';
  const amitSignup = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'amit4578',
      password: testPass,
      confirmPassword: testPass,
    }),
  });
  const amitData = await amitSignup.json();
  assert(
    (amitSignup.status === 200 || amitSignup.status === 201) && amitData.user?.username === 'amit4578',
    `Valid username "amit4578" successfully registered (HTTP ${amitSignup.status}, balance: ₹${amitData.user?.balance})`
  );

  // -------------------------------------------------------------
  // TEST 2: SIGNUP WITH INVALID SHORT USERNAME (< 3 chars)
  // -------------------------------------------------------------
  const shortSignup = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'am',
      password: testPass,
      confirmPassword: testPass,
    }),
  });
  const shortData = await shortSignup.json();
  assert(
    shortSignup.status === 400 && shortData.error === 'Username must be between 3 and 24 characters.',
    `Short username "am" correctly rejected with 400: "${shortData.error}"`
  );

  // -------------------------------------------------------------
  // TEST 3: SIGNUP WITH INVALID LONG USERNAME (> 24 chars)
  // -------------------------------------------------------------
  const longUsername = 'amit_very_long_username_that_exceeds_twenty_four_chars';
  const longSignup = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: longUsername,
      password: testPass,
      confirmPassword: testPass,
    }),
  });
  const longData = await longSignup.json();
  assert(
    longSignup.status === 400 && longData.error === 'Username must be between 3 and 24 characters.',
    `Long username (${longUsername.length} chars) correctly rejected with 400: "${longData.error}"`
  );

  // -------------------------------------------------------------
  // TEST 4: SIGNUP WITH ALREADY EXISTING USERNAME
  // -------------------------------------------------------------
  const duplicateSignup = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'amit4578',
      password: testPass,
      confirmPassword: testPass,
    }),
  });
  const duplicateData = await duplicateSignup.json();
  assert(
    duplicateSignup.status === 409 && duplicateData.error.includes('already taken'),
    `Duplicate username "amit4578" correctly rejected with 409: "${duplicateData.error}"`
  );

  // -------------------------------------------------------------
  // TEST 5: SIGNUP WITH UNTRIMMED VALID USERNAME "  rohit99  "
  // -------------------------------------------------------------
  const untrimmedSignup = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: '  rohit99  ',
      password: testPass,
      confirmPassword: testPass,
    }),
  });
  const untrimmedData = await untrimmedSignup.json();
  assert(
    (untrimmedSignup.status === 200 || untrimmedSignup.status === 201) && untrimmedData.user?.username === 'rohit99',
    `Untrimmed username "  rohit99  " trimmed and registered as "${untrimmedData.user?.username}"`
  );

  // -------------------------------------------------------------
  // TEST 6: ADMIN LOGIN WITH EMPTY FIELDS (BUG 2 FIX)
  // -------------------------------------------------------------
  console.log('\n--- Test Group 2: Admin Login Verification (Bug 2) ---');

  const emptyAdmin = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '', password: '' }),
  });
  const emptyAdminData = await emptyAdmin.json();
  assert(
    emptyAdmin.status === 400 && emptyAdminData.error === 'Please enter administrator username and password.',
    `Empty admin login rejected with 400: "${emptyAdminData.error}"`
  );

  // -------------------------------------------------------------
  // TEST 7: ADMIN LOGIN WITH INVALID CREDENTIALS
  // -------------------------------------------------------------
  const invalidAdmin = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'WrongPassword999!' }),
  });
  const invalidAdminData = await invalidAdmin.json();
  assert(
    invalidAdmin.status === 401 && invalidAdminData.error === 'Invalid administrator credentials.',
    `Invalid admin credentials correctly rejected with 401: "${invalidAdminData.error}" (NOT missing-fields message)`
  );

  // -------------------------------------------------------------
  // TEST 8: ADMIN LOGIN WITH VALID AUTHORIZED CREDENTIALS
  // -------------------------------------------------------------
  const adminPassword = process.env.ADMIN_PASSWORD || 'AdminDemoPassword123!';
  const validAdmin = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: adminPassword,
    }),
  });
  const validAdminData = await validAdmin.json();
  assert(
    validAdmin.status === 200 && validAdminData.user?.role === 'admin' && typeof validAdminData.token === 'string',
    `Valid authorized administrator login succeeded (HTTP 200, role: ${validAdminData.user?.role}, token received)`
  );

  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
