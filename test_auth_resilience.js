// Test script verifying authentication resilience, CORS, error handling, and login/signup flows
const BASE_URL = 'http://localhost:3000';

async function runAuthTests() {
  console.log('=== RUNNING AUTHENTICATION RESILIENCE TEST SUITE ===\n');
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

  // 1. Invalid Login (Wrong password)
  console.log('--- 1. Testing Invalid Credentials Error Handling ---');
  const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'nonexistent_user_999999',
      password: 'WrongPassword999!',
    }),
  });
  const badLoginData = await badLoginRes.json();
  assert(badLoginRes.status === 401, `Invalid login returns HTTP 401 (got ${badLoginRes.status})`);
  assert(
    badLoginData.error === 'Invalid username or password.',
    `Specific credential error message returned: "${badLoginData.error}"`
  );

  // 2. Missing Parameters Login
  console.log('\n--- 2. Testing Missing Parameters Validation ---');
  const emptyLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: '',
      password: '',
    }),
  });
  const emptyLoginData = await emptyLoginRes.json();
  assert(emptyLoginRes.status === 400, `Empty credentials returns HTTP 400 (got ${emptyLoginRes.status})`);
  assert(
    emptyLoginData.error && emptyLoginData.error.includes('username and password'),
    `Validation error returned: "${emptyLoginData.error}"`
  );

  // 3. User Signup
  console.log('\n--- 3. Testing Valid User Signup ---');
  const testUser = `pilot_${Date.now()}`;
  const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: testUser,
      password: 'SafePassword123!',
      confirmPassword: 'SafePassword123!',
    }),
  });
  const signupData = await signupRes.json();
  assert(signupRes.status === 201, `Signup returns HTTP 201 (got ${signupRes.status})`);
  assert(signupData.user && signupData.user.username === testUser, `Created pilot: ${signupData.user.username}`);
  assert(typeof signupData.token === 'string' && signupData.token.length > 20, 'Received signed session token');

  // 4. User Login with Created Account
  console.log('\n--- 4. Testing User Login with Created Account ---');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: testUser,
      password: 'SafePassword123!',
    }),
  });
  const loginData = await loginRes.json();
  assert(loginRes.status === 200, `Login returns HTTP 200 (got ${loginRes.status})`);
  assert(loginData.user && loginData.user.id === signupData.user.id, 'User ID matches between signup and login');
  assert(typeof loginData.token === 'string', 'Received authenticated token upon login');

  // 5. Test Current Session (/api/auth/me)
  console.log('\n--- 5. Testing Current Session Endpoint (/api/auth/me) ---');
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${loginData.token}` },
  });
  const meData = await meRes.json();
  assert(meRes.status === 200, 'GET /api/auth/me returns 200 OK');
  assert(meData.user && meData.user.username === testUser, `Session verified for @${testUser}`);

  // 6. Test Duplicate Username Prevention
  console.log('\n--- 6. Testing Duplicate Username Conflict ---');
  const dupSignupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: testUser,
      password: 'SafePassword123!',
      confirmPassword: 'SafePassword123!',
    }),
  });
  const dupData = await dupSignupRes.json();
  assert(dupSignupRes.status === 409, `Duplicate username returns HTTP 409 Conflict (got ${dupSignupRes.status})`);
  assert(dupData.error && dupData.error.includes('already taken'), `Clear conflict message: "${dupData.error}"`);

  // 7. Test CORS Header with Origin
  console.log('\n--- 7. Testing CORS Headers with Origin & Credentials ---');
  const corsRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Origin: 'https://rush-aviator-game.pages.dev' },
  });
  const allowOrigin = corsRes.headers.get('access-control-allow-origin');
  const allowCredentials = corsRes.headers.get('access-control-allow-credentials');
  assert(
    allowOrigin === 'https://rush-aviator-game.pages.dev',
    `Access-Control-Allow-Origin echoes request origin: ${allowOrigin}`
  );
  assert(
    allowCredentials === 'true',
    `Access-Control-Allow-Credentials is true for session cookies/tokens: ${allowCredentials}`
  );

  // 8. Admin Login with Valid Credentials
  console.log('\n--- 8. Testing Admin Login ---');
  const adminRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: process.env.ADMIN_PASSWORD || 'AdminDemoPassword123!',
    }),
  });
  const adminData = await adminRes.json();
  assert(adminRes.status === 200, `Admin login returns 200 (got ${adminRes.status})`);
  assert(adminData.user && adminData.user.role === 'admin', 'Admin user verified with admin role');

  console.log(`\n========================================`);
  console.log(`AUTH TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================`);
  if (failed > 0) process.exit(1);
}

runAuthTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
