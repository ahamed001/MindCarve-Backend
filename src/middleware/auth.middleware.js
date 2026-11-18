import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AUTH_COOKIE } from '../utils/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../users/model/user.model.js';

const extractToken = (req) => {
  if (req.cookies?.[AUTH_COOKIE]) return req.cookies[AUTH_COOKIE];
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
};

export const authenticate = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) throw ApiError.unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      throw ApiError.unauthorized('Session expired or invalid. Please sign in again.');
    }

    const user = await User.findById(payload.sub).select('+tokenVersion');
    if (!user || user.status !== 'active' || user.tokenVersion !== payload.tv) {
      throw ApiError.unauthorized('Session expired or invalid. Please sign in again.');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
