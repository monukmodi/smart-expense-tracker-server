import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { isDisposableEmail } from '../utils/disposableEmail.js';
import { sendMail, buildVerificationEmail } from '../utils/mailer.js';
import { OAuth2Client } from 'google-auth-library';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body || {};


    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    // Block disposable email domains
    if (isDisposableEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Disposable/temporary email domains are not allowed.' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'Email is already registered.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const code = genCode();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      isVerified: false,
      verificationCode: code,
      verificationExpires: expires,
      provider: 'local',
    });

    // Send verification email (logs to console if SMTP is not configured)
    const { subject, html, text } = buildVerificationEmail({ name: user.name, code });
    await sendMail({ to: user.email, subject, html, text });

    return res.status(201).json({
      message: 'Registration successful. Verification code sent to email.',
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error during registration.', error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ message: 'Email not verified. Please verify your email to continue.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      token,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error during login.', error: error.message });
  }
};

export const verify = async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(400).json({ message: 'Invalid email or code.' });
    if (user.isVerified) return res.status(200).json({ message: 'Already verified.' });
    if (!user.verificationCode || !user.verificationExpires) {
      return res.status(400).json({ message: 'No verification in progress. Please register again or resend code.' });
    }
    const now = new Date();
    if (user.verificationCode !== String(code).trim() || user.verificationExpires < now) {
      return res.status(400).json({ message: 'Invalid or expired code.' });
    }
    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationExpires = undefined;
    await user.save();

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(200).json({
      user: { id: user._id, name: user.name, email: user.email },
      token,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error during verification.', error: error.message });
  }
};

export const resendCode = async (req, res) => {
  try {
    const { email } = req.body || {};
    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(400).json({ message: 'User not found.' });
    if (user.isVerified) return res.status(400).json({ message: 'User already verified.' });

    const code = genCode();
    const expires = new Date(Date.now() + 15 * 60 * 1000);
    user.verificationCode = code;
    user.verificationExpires = expires;
    await user.save();

    const { subject, html, text } = buildVerificationEmail({ name: user.name, code });
    await sendMail({ to: user.email, subject, html, text });

    return res.status(200).json({ message: 'Verification code resent.' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error during resend.', error: error.message });
  }
};

export const googleSignIn = async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ message: 'idToken is required' });
    if (!googleClient) return res.status(500).json({ message: 'GOOGLE_CLIENT_ID not configured on server' });

    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const sub = payload?.sub;
    const email = String(payload?.email || '').toLowerCase();
    const emailVerified = Boolean(payload?.email_verified);
    const name = payload?.name || 'Google User';

    if (!sub || !email) return res.status(400).json({ message: 'Invalid Google token' });
    if (!emailVerified) return res.status(403).json({ message: 'Google account email not verified' });

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name,
        email,
        passwordHash: '',
        isVerified: true,
        verificationCode: undefined,
        verificationExpires: undefined,
        provider: 'google',
        oauthId: sub,
      });
    } else {
      user.isVerified = true;
      user.provider = user.provider || 'google';
      user.oauthId = user.oauthId || sub;
      await user.save();
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
    return res.status(200).json({
      user: { id: user._id, name: user.name, email: user.email },
      token,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error during Google sign-in.', error: error.message });
  }
};
