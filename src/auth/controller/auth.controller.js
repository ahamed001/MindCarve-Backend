import { env } from '../../config/env.js';
import { AUTH_COOKIE } from '../../utils/constants.js';
import { sendSuccess } from '../../utils/response.js';
import * as authService from '../service/auth.service.js';

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: env.isProduction ? 'strict' : 'lax',
  path: '/',
  maxAge: 8 * 60 * 60 * 1000,
});

const setSessionCookie = (res, token) => res.cookie(AUTH_COOKIE, token, cookieOptions());

export const login = async (req, res) => {
  const { token, user } = await authService.login(req.body);
  setSessionCookie(res, token);
  sendSuccess(res, { user }, 'Signed in successfully');
};

export const logout = async (req, res) => {
  await authService.logout(req.user._id);
  res.clearCookie(AUTH_COOKIE, { ...cookieOptions(), maxAge: undefined });
  sendSuccess(res, {}, 'Signed out successfully');
};

export const me = async (req, res) => {
  sendSuccess(res, { user: await authService.getCurrentUser(req.user) });
};

export const verifyInvitation = async (req, res) => {
  sendSuccess(res, await authService.verifyInvitation(req.query.token), 'Invitation is valid');
};

export const acceptInvitation = async (req, res) => {
  const { token, user } = await authService.acceptInvitation(req.body);
  setSessionCookie(res, token);
  sendSuccess(res, { user }, 'Your account is ready');
};

export const register = async (req, res) => {
  const result = await authService.registerPatient(req.body);
  sendSuccess(res, result, 'Registration successful. We have emailed your login details.', 201);
};

export const forgotPassword = async (req, res) => {
  const { devLink } = await authService.forgotPassword(req.body.email);
  sendSuccess(
    res,
    devLink ? { devLink, devNotice: 'Development only: link returned because SMTP is not used in this environment.' } : {},
    'If an account exists for this email, a reset link has been sent.',
  );
};

export const resetPassword = async (req, res) => {
  await authService.resetPassword(req.body);
  sendSuccess(res, {}, 'Password updated. Please sign in.');
};
