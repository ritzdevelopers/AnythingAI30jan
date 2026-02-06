/**
 * Auth middleware: JWT protect and department access (4-digit code when crossing departments).
 */
import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import User from '../models/user/User';
import Department from '../models/department/Department';
import { verifyToken } from '../controllers/authController';
import { sendJsonError } from '../utils/errorHandler';

/**
 * protect: require valid JWT. Sets req.user = { userId, email, departmentId }.
 */
export async function protect(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    sendJsonError(res, 'UNAUTHORIZED', 'Authentication required. Please log in.', 401);
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    sendJsonError(res, 'UNAUTHORIZED', 'Invalid or expired token. Please log in again.', 401);
    return;
  }

  try {
    const user = await User.findById(payload.userId).select('email departmentId');
    if (!user) {
      sendJsonError(res, 'UNAUTHORIZED', 'User not found.', 401);
      return;
    }
    req.user = {
      userId: user._id.toString(),
      email: user.email,
      departmentId: user.departmentId as Types.ObjectId,
    };
    next();
  } catch (err) {
    console.error('[Auth] protect error:', err);
    sendJsonError(res, 'SERVER_ERROR', 'Authentication failed.', 500);
  }
}

/**
 * checkDepartmentAccess: allow only when user's department === requested departmentId.
 * For same department: if the department has an accessCode, require body/query accessCode
 * and validate it against Department.accessCode in DB; allow only if it matches.
 * Cross-department access is not allowed (even with a correct code).
 * Accepts departmentId (and accessCode for POST) from body or query.
 */
export async function checkDepartmentAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    sendJsonError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
    return;
  }

  const departmentId = req.body?.departmentId ?? req.query?.departmentId;
  if (!departmentId) {
    sendJsonError(res, 'BAD_REQUEST', 'departmentId is required.', 400);
    return;
  }
  const accessCodeRaw = req.body?.accessCode ?? req.query?.accessCode;

  const userDeptId = String(req.user.departmentId?.toString?.() ?? req.user.departmentId ?? '');
  const requestedDeptId = typeof departmentId === 'string' ? departmentId : String((departmentId as Types.ObjectId)?.toString?.() ?? '');

  // Only allow access when user's department and requested department are the same
  if (userDeptId !== requestedDeptId) {
    sendJsonError(res, 'FORBIDDEN', 'You can only access spaces in your own department.', 403);
    return;
  }

  // Same department: check DB for access code if this department has one
  try {
    const department = await Department.findById(requestedDeptId).select('accessCode').lean();
    if (!department) {
      sendJsonError(res, 'BAD_REQUEST', 'Department not found.', 400);
      return;
    }
    const rawStored = department.accessCode;
    const storedCode =
      rawStored != null && typeof rawStored === 'string'
        ? rawStored.trim()
        : '';

    // No access code in DB for this department → allow
    if (!storedCode) {
      next();
      return;
    }

    // Department has access code: require and validate input
    if (accessCodeRaw === undefined || accessCodeRaw === null || accessCodeRaw === '') {
      sendJsonError(res, 'FORBIDDEN', 'Access code required for this space.', 403);
      return;
    }
    const accessCode = Array.isArray(accessCodeRaw) ? accessCodeRaw[0] : accessCodeRaw;
    const codeStr = String(accessCode ?? '').trim();
    if (!/^\d{4}$/.test(codeStr)) {
      sendJsonError(res, 'BAD_REQUEST', 'Access code must be 4 digits.', 400);
      return;
    }
    if (storedCode !== codeStr) {
      sendJsonError(res, 'FORBIDDEN', 'Invalid access code.', 403);
      return;
    }
    next();
  } catch (err) {
    console.error('[Auth] checkDepartmentAccess error:', err);
    sendJsonError(res, 'SERVER_ERROR', 'Access check failed.', 500);
  }
}
