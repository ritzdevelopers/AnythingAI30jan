/**
 * Auth controller: register (with department name), login.
 * Returns JWT and user info (no password).
 */
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/user/User';
import Department from '../models/department/Department';
import { sendJsonError } from '../utils/errorHandler';
import { Types } from 'mongoose';

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface JwtPayload {
  userId: string;
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(
    payload as object,
    JWT_SECRET as jwt.Secret,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
  );
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * POST /api/auth/register
 * Body: { email, password, departmentName }
 * departmentName is used to find an existing department by name (case-insensitive).
 */
export async function register(req: Request, res: Response): Promise<void> {
  const { email, password, departmentName } = req.body as {
    email?: string;
    password?: string;
    departmentName?: string;
  };

  const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const trimmedPassword = typeof password === 'string' ? password : '';
  const trimmedDeptName = typeof departmentName === 'string' ? departmentName.trim() : '';

  if (!trimmedEmail || !trimmedPassword) {
    sendJsonError(res, 'BAD_REQUEST', 'Email and password are required.', 400);
    return;
  }
  if (!trimmedDeptName) {
    sendJsonError(res, 'BAD_REQUEST', 'Department name is required.', 400);
    return;
  }

  try {
    const existing = await User.findOne({ email: trimmedEmail });
    if (existing) {
      sendJsonError(res, 'CONFLICT', 'An account with this email already exists.', 409);
      return;
    }

    const department = await Department.findOne({
      name: { $regex: new RegExp(`^${trimmedDeptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (!department) {
      sendJsonError(res, 'BAD_REQUEST', 'Department not found. Please choose an existing department.', 400);
      return;
    }

    const hashedPassword = await bcrypt.hash(trimmedPassword, SALT_ROUNDS);
    const user = await User.create({
      email: trimmedEmail,
      password: hashedPassword,
      departmentId: department._id,
    });

    const token = signToken({ userId: user._id.toString(), email: user.email });
    res.status(201).json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        departmentId: (user.departmentId as Types.ObjectId).toString(),
        departmentName: department.name,
      },
    });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    sendJsonError(res, 'SERVER_ERROR', 'Registration failed.', 500);
  }
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email?: string; password?: string };

  const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const trimmedPassword = typeof password === 'string' ? password : '';

  if (!trimmedEmail || !trimmedPassword) {
    sendJsonError(res, 'BAD_REQUEST', 'Email and password are required.', 400);
    return;
  }

  try {
    const user = await User.findOne({ email: trimmedEmail }).populate('departmentId', 'name');
    if (!user) {
      sendJsonError(res, 'UNAUTHORIZED', 'Invalid email or password.', 401);
      return;
    }

    const match = await bcrypt.compare(trimmedPassword, user.password);
    if (!match) {
      sendJsonError(res, 'UNAUTHORIZED', 'Invalid email or password.', 401);
      return;
    }

    const token = signToken({ userId: user._id.toString(), email: user.email });
    const dept = user.departmentId as unknown as { _id: Types.ObjectId; name: string } | null;
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        departmentId: user.departmentId,
        departmentName: dept?.name ?? null,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    sendJsonError(res, 'SERVER_ERROR', 'Login failed.', 500);
  }
}
