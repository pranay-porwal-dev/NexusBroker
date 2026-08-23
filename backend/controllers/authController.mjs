import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/db.mjs";
import { wrapAsync } from "../middleware/wrapAsync.mjs";

const SALT_ROUNDS            = Number(process.env.SALT_ROUNDS) || 12;
const ACCESS_TOKEN_SECRET    = process.env.ACCESS_TOKEN_SECRET;
const ACCESS_TOKEN_EXPIRY    = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY_MS = Number(process.env.REFRESH_TOKEN_EXPIRY_MS) || 7 * 24 * 60 * 60 * 1000;

const generateRandomString = () => crypto.randomBytes(64).toString('hex');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const accessCookieOptions = {
  httpOnly: true,                                       
  secure:   process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', 
  path:     '/',
  maxAge:   2 * 60 * 60 * 1000,        
};

const refreshCookieOptions = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path:     '/',                                      
  maxAge:   REFRESH_TOKEN_EXPIRY_MS,
};

export const registerUser = wrapAsync(async (req, res, next) => {
  const { name, email, dob, phone_no, tax_id, tax_id_type, country_code, password } = req.body;

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const userId       = crypto.randomUUID();
  const walletId     = crypto.randomUUID();

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO user_profiles (id, name, email, dob, phone_no, tax_id, tax_id_type, country_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, name, email, dob, phone_no, tax_id, tax_id_type, country_code || 'IN']
    );
    await connection.execute(
      `INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)`,
      [userId, passwordHash]
    );
    await connection.execute(
      `INSERT INTO wallets (id, user_id) VALUES (?, ?)`,
      [walletId, userId]
    );

    await connection.commit();
    return res.status(201).json({ message: 'Account created successfully.', userId });

  } catch (err) {
    await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      err.customClientMessage = 'Email, phone, or tax ID already registered.';
    }
    return next(err);
  } finally {
    connection.release();
  }
});

export const loginUser = wrapAsync(async (req, res, next) => {
  const { email, password } = req.body;

  const [rows] = await pool.execute(
    `SELECT p.id AS user_id, c.password_hash, c.failed_attempts, c.locked_until
     FROM user_profiles p JOIN user_credentials c ON p.id = c.user_id
     WHERE p.email = ?`,
    [email]
  );
  const user = rows[0];

  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    return res.status(423).json({ error: 'Account temporarily locked. Try again later.' });
  }

  const DUMMY_HASH = '$2b$12$wt5Qw6K99Uop3acOQ7H9tuXTwkskb7.M6H1Hz3dca8FZ6f22dhVQ6';
  const isMatch = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);

  if (!user || !isMatch) {
    if (user) {
      const failedAttempts = user.failed_attempts + 1;
      const shouldLock     = failedAttempts >= 5;
      await pool.execute(
        `UPDATE user_credentials SET failed_attempts = ?, locked_until = ? WHERE user_id = ?`,
        [failedAttempts, shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : null, user.user_id]
      );
    }
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  await pool.execute(
    `UPDATE user_credentials SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE user_id = ?`,
    [user.user_id]
  );

  const jti         = crypto.randomUUID();
  const accessToken = jwt.sign({ sub: user.user_id, jti }, ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  const refreshToken = generateRandomString();
  const tokenHash    = hashToken(refreshToken);
  const expiresAt    = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  await pool.execute(
    `INSERT INTO user_session (id, user_id, token_hash, jti, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), user.user_id, tokenHash, jti, expiresAt, req.get('User-Agent') || null]
  );

  res.cookie('ACCESS_TOKEN',  accessToken,  accessCookieOptions);
  res.cookie('REFRESH_TOKEN', refreshToken, refreshCookieOptions);

  return res.status(200).json({ message: 'Login successful.' });
});

export const refreshSession = wrapAsync(async (req, res, next) => {
  const refreshToken = req.cookies?.REFRESH_TOKEN;
  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token provided.' });
  }

  const tokenHash = hashToken(refreshToken);
  const [rows] = await pool.execute(
    `SELECT id, user_id FROM user_session
     WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()`,
    [tokenHash]
  );
  const session = rows[0];

  if (!session) {
    res.clearCookie('ACCESS_TOKEN',  { path: '/' });
    res.clearCookie('REFRESH_TOKEN', { path: '/' });
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

  await pool.execute(
    `UPDATE user_session SET revoked_at = NOW() WHERE id = ?`,
    [session.id]
  );

  const newJti          = crypto.randomUUID();
  const newAccessToken  = jwt.sign({ sub: session.user_id, jti: newJti }, ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
  const newRefreshToken = generateRandomString();
  const newTokenHash    = hashToken(newRefreshToken);
  const newExpiresAt    = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  await pool.execute(
    `INSERT INTO user_session (id, user_id, token_hash, jti, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), session.user_id, newTokenHash, newJti, newExpiresAt, req.get('User-Agent') || null]
  );

  res.cookie('ACCESS_TOKEN',  newAccessToken,  accessCookieOptions);
  res.cookie('REFRESH_TOKEN', newRefreshToken, refreshCookieOptions);

  return res.status(200).json({ message: 'Session refreshed.' });
});

export const logoutUser = wrapAsync(async (req, res, next) => {
  const refreshToken = req.cookies?.REFRESH_TOKEN;
  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await pool.execute(
      `UPDATE user_session SET revoked_at = NOW() WHERE token_hash = ?`,
      [tokenHash]
    );
  }
  res.clearCookie('ACCESS_TOKEN',  { path: '/' });
  res.clearCookie('REFRESH_TOKEN', { path: '/' });
  return res.status(200).json({ message: 'Logged out successfully.' });
});