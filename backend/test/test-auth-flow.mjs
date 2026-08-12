// test-auth-flow.js
// Run with: node test-auth-flow.js
//
// Exercises the full auth lifecycle end-to-end against your running server:
// register -> login (with wrong password to test lockout NOT triggering on 1 try)
// -> login (correct) -> refresh -> logout -> refresh again (should fail, proves revocation)
//
// Node 18+ has fetch built in. This script manually tracks cookies since
// fetch() in Node doesn't auto-persist a cookie jar like a browser does.

const BASE_URL = 'http://localhost:3000/api/auth';

// crude cookie jar: parses Set-Cookie headers and re-sends them on next request
let cookieJar = {};

const extractCookies = (res) => {
    const setCookieHeaders = res.headers.getSetCookie?.() || [];
    setCookieHeaders.forEach(cookieStr => {
        const [pair] = cookieStr.split(';');
        const [key, value] = pair.split('=');
        cookieJar[key.trim()] = value.trim();
    });
};

const cookieHeader = () =>
    Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');

const request = async (method, path, body) => {
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            Cookie: cookieHeader()
        },
        body: body ? JSON.stringify(body) : undefined
    });
    extractCookies(res);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
};

const log = (label, result) =>
    console.log(`\n--- ${label} ---\nStatus: ${result.status}\nBody:`, result.data);

const testUser = {
    name: "Test Runner",
    email: `testuser_${Date.now()}@nexusbroker.com`, // unique each run, avoids dup conflicts
    password: "SecurePass123",
    dob: "2000-01-01",
    phone_no: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    tax_id: "TESTX1234T",
    tax_id_type: "PAN",
    country_code: "IN"
};

(async () => {
    console.log('Testing against user:', testUser.email);

    // 1. Register
    log('1. REGISTER', await request('POST', '/register', testUser));

    // 2. Login with WRONG password — should 401, should NOT lock after just one try
    log('2. LOGIN (wrong password)', await request('POST', '/login', {
        email: testUser.email,
        password: 'WrongPassword999'
    }));

    // 3. Login with CORRECT password — should 200, should set cookies
    log('3. LOGIN (correct password)', await request('POST', '/login', {
        email: testUser.email,
        password: testUser.password
    }));
    console.log('Cookies captured:', Object.keys(cookieJar));

    // 4. Refresh — should 200, should rotate the refresh token (cookie value changes)
    const oldRefreshToken = cookieJar['REFRESH_TOKEN'];
    log('4. REFRESH', await request('POST', '/refresh'));
    const newRefreshToken = cookieJar['REFRESH_TOKEN'];
    console.log('Refresh token rotated:', oldRefreshToken !== newRefreshToken);

    // 5. Logout — should 200, should clear cookies
    log('5. LOGOUT', await request('POST', '/logout'));

    // 6. Refresh AFTER logout — should 401, proves the session row was revoked
    log('6. REFRESH AFTER LOGOUT (should fail)', await request('POST', '/refresh'));

    console.log('\n=== Test sequence complete ===');
})();