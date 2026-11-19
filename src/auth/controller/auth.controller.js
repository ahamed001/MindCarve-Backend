import { env } from '../../config/env.js';
import { AUTH_COOKIE } from '../../utils/constants.js';
import { sendSuccess } from '../../utils/response.js';
import * as authService from '../service/auth.service.js';
import { recordAudit } from '../../audit/service/audit.service.js';

// HttpOnly: JavaScript can never read the token. "none" (cross-site) is only valid together with Secure (HTTPS).
const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProduction || env.cookieSameSite === 'none',
  sameSite: env.cookieSameSite,
  path: '/',
  maxAge: 8 * 60 * 60 * 1000,
});

const setSessionCookie = (res, token) => res.cookie(AUTH_COOKIE, token, cookieOptions());

export const login = async (req, res) => {
  let session;
  try {
    session = await authService.login(req.body);
  } catch (error) {
    await recordAudit({ req, action: 'auth.login_failed', outcome: 'failure', actorEmail: String(req.body.email || '').toLowerCase(), details: `${req.body.portal} portal: ${error.message}` });
    throw error;
  }
  const { token, user } = session;
  await recordAudit({ req, actor: user, action: 'auth.login', patientId: user.patient || undefined, details: `${req.body.portal} portal` });
  setSessionCookie(res, token);
  sendSuccess(res, { user }, 'Signed in successfully');
};

export const logout = async (req, res) => {
  await authService.logout(req.user._id);
  await recordAudit({ req, action: 'auth.logout', patientId: req.user.patient || undefined });
  res.clearCookie(AUTH_COOKIE, { ...cookieOptions(), maxAge: undefined });
  sendSuccess(res, {}, 'Signed out successfully');
};

export const socketToken = async (req, res) => sendSuccess(res, { token: authService.signSocketToken(req.user) });

export const me = async (req, res) => {
  sendSuccess(res, { user: await authService.getCurrentUser(req.user) });
};

export const verifyInvitation = async (req, res) => {
  sendSuccess(res, await authService.verifyInvitation(req.query.token), 'Invitation is valid');
};

export const acceptInvitation = async (req, res) => {
  const { token, user } = await authService.acceptInvitation(req.body);
  await recordAudit({ req, actor: user, action: 'auth.invitation_accepted', patientId: user.patient });
  setSessionCookie(res, token);
  sendSuccess(res, { user }, 'Your account is ready');
};

export const register = async (req, res) => {
  const result = await authService.registerPatient(req.body);
  await recordAudit({ req, actorEmail: result.email, action: 'auth.self_registered', patientCode: result.patientCode, details: `Welcome email: ${result.emailStatus}` });
  sendSuccess(res, result, 'Registration successful. We have emailed your login details.', 201);
};

export const forgotPassword = async (req, res) => {
  const { devLink } = await authService.forgotPassword(req.body.email);
  await recordAudit({ req, actorEmail: String(req.body.email || '').toLowerCase(), action: 'auth.password_reset_requested' });
  sendSuccess(
    res,
    devLink ? { devLink, devNotice: 'Development only: link returned because SMTP is not used in this environment.' } : {},
    'If an account exists for this email, a reset link has been sent.',
  );
};

export const resetPassword = async (req, res) => {
  await authService.resetPassword(req.body);
  await recordAudit({ req, action: 'auth.password_reset' });
  sendSuccess(res, {}, 'Password updated. Please sign in.');
};
