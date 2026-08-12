import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/db.mjs";
import {wrapAsync} from "../middleware/wrapAsync.mjs";



const SALT_ROUNDS = Number(process.env.SALT_ROUNDS) || 12;
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_EXPIRY_MS = 7*24*60*60*1000;
const ACCESS_TOKEN_EXPIRY = '15m';

export const registerUser = wrapAsync(async(req,res,next)=>{
    const {
        name, email, dob, phone_no, 
        tax_id, tax_id_type, country_code,
        password
    } = req.body;

    const passwordHash = await bcrypt.hash(password,SALT_ROUNDS);

    const userId = crypto.randomUUID();
    const walletId = crypto.randomUUID();

    const connection = await pool.getConnection();

    try{
        await connection.beginTransaction();

        await connection.execute(
            `INSERT INTO user_profiles
            (id, name, email, dob, phone_no, tax_id, tax_id_type, country_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ? )`,
            [userId, name, email, dob, phone_no, tax_id, tax_id_type, country_code || 'IN']
        );

        await connection.execute(
            `INSERT INTO user_credentials (user_id, password_hash)
            VALUES (?, ?)`,
            [userId, passwordHash]
        );

        await connection.execute(
            `INSERT INTO wallets (id, user_id)
            VALUES(?, ?)`,
            [walletId, userId]
        );

        await connection.commit();

        return res.status(201).json({
            message: 'Account created successfully.',
            userId: userId
        });
    } catch(err){
        await connection.rollback();
        console.error('[register] Transaction failed:', err.message);

        if(err.code==='ER_DUP_ENTRY'){
            err.customClientMessage = 'Email, phone, or tax ID already registered.';
        }
        return next(err);
    } finally{
        if(connection) connection.release();
    }

    });

const generateRandomString = ()=>{
    return crypto.randomBytes(64).toString('hex');
}

const hashToken = (token)=> crypto.createHash('sha256').update(token).digest('hex');

const cookieOptions = (maxAge)=>({
    httponly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge
});

export const loginUser= wrapAsync(async(req,res,next)=>{
    const {email,password}= req.body;
    let query = `SELECT p.id AS user_id, c.password_hash, c.failed_attempts, c.locked_until
     FROM user_profiles p 
     JOIN user_credentials c ON p.id=c.user_id
     where p.email=?`;
    const [rows]= await pool.execute(query,[email]);
    const user = rows[0];

    if(user && user.locked_until && new Date(user.locked_until) > new Date ()){
        return res.status(423).json({error: "Account temporarily locked. Try again later."});
    }

    const DUMMY_HASH = '$2b$12$wt5Qw6K99Uop3acOQ7H9tuXTwkskb7.M6H1Hz3dca8FZ6f22dhVQ6';
    const storedHash = user ? user.password_hash : DUMMY_HASH;
    const isMatch = await bcrypt.compare(password,storedHash);
    
    if(!user || !isMatch){
        if(user){
            const failedAttempts = user.failed_attempts+1;
            const shouldLock = failedAttempts >= 5;
            query = `UPDATE user_credentials
                     SET failed_attempts = ? , locked_until= ?
                     WHERE user_id = ?`;
            await pool.execute(query,[failedAttempts, shouldLock ? new Date(Date.now() + 15*60*1000) : null, user.user_id]);
        }
        return  res.status(401).json({
            "error" : "Invalid email or password"
        });
    }
    query = `UPDATE user_credentials
             SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW()
             WHERE user_id = ?`;
    await pool.execute(query,[user.user_id]);

    const jti = crypto.randomUUID();
    const payload = {
        "sub":user.user_id, jti
    };
    const accessToken = jwt.sign(payload,ACCESS_TOKEN_SECRET,{expiresIn: ACCESS_TOKEN_EXPIRY});

    const refreshToken = generateRandomString();
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
    query = "INSERT INTO user_session (id, user_id, token_hash, jti, expires_at, user_agent) values(?,?,?,?,?,?)";
    await pool.execute(query,[crypto.randomUUID(),user.user_id, tokenHash, jti, expiresAt, req.get('User-Agent') || null]);

    res.cookie('ACCESS_TOKEN', accessToken, cookieOptions(15*60*1000));
    res.cookie('REFRESH_TOKEN', refreshToken, cookieOptions(REFRESH_TOKEN_EXPIRY_MS));

    return res.status(200).json({
        message: 'Login successful.'
    });
});

export const refreshSession = wrapAsync(async(req,res,next)=>{
    const refreshToken = req.cookies?.REFRESH_TOKEN;
    if(!refreshToken) return res.status(401).json({
        error: "No token provided"
});

    const tokenHash = hashToken(refreshToken);
    let query = "Select id,user_id from user_session where token_hash=? AND revoked_at IS NULL AND expires_at > NOW()";
    const [rows] = await pool.execute(query, [tokenHash]);
    const session = rows[0];

    if(!session){
        return res.status(401).json({
            error: "Invalid or expired session.!Please Log in again."
        });
    }

    query = `UPDATE user_session SET revoked_at = NOW() WHERE id=?`;
    await pool.execute(query, [session.id]);

    const newJti = crypto.randomUUID();
    const newPayload={
        "sub": session.user_id,
        "jti": newJti
    }
    const newAccessToken = jwt.sign(newPayload, ACCESS_TOKEN_SECRET, {expiresIn: ACCESS_TOKEN_EXPIRY});

    const newRefreshToken = generateRandomString();
    const newTokenHash = hashToken(newRefreshToken);
    const newExpiryAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
    query = "INSERT INTO user_session (id, user_id, token_hash, jti, expires_at, user_agent) values(?,?,?,?,?,?)";
    await pool.execute(query, [crypto.randomUUID(), session.user_id, newTokenHash, newJti, newExpiryAt, req.get('User-Agent') || null]);

    res.cookie('ACCESS_TOKEN', newAccessToken, cookieOptions(15*60*1000));
    res.cookie('REFRESH_TOKEN', newRefreshToken, cookieOptions(REFRESH_TOKEN_EXPIRY_MS));

    return res.status(200).json({
        message: 'Session refreshed.'
    });
});

export const logoutUser = wrapAsync(async(req,res,next)=>{
    const refreshToken = req.cookies?.REFRESH_TOKEN;
    if(refreshToken){
        const tokenHash = hashToken(refreshToken);
        let query = "UPDATE user_session SET revoked_at = NOW() where token_hash = ?";
        await pool.execute(query, [tokenHash]);
    }
    res.clearCookie('ACCESS_TOKEN', {path: '/'});
    res.clearCookie('REFRESH_TOKEN', {path: '/'});
    return res.status(200).json({
        message: "Logged out successfully."
    });
});
