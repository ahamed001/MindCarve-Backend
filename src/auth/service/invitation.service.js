import { Invitation } from '../model/invitation.model.js';
import { env } from '../../config/env.js';
import { generateRawToken, hashToken } from '../../utils/tokens.js';
import { sendEmailInBackground, willDeliver } from '../../emails/service/email.service.js';
import { invitationEmail, passwordResetEmail } from '../../emails/templates/index.js';
import { ApiError } from '../../utils/ApiError.js';

const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_INVITES_PER_DAY = 5;

const linkFor = (purpose, rawToken) =>
  `${env.clientUrl}/${purpose === 'invitation' ? 'setup-account' : 'reset-password'}?token=${rawToken}`;

/**
 * Creates a single-use token (revoking older unused ones of the same purpose) and emails the link.
 * In non-production environments the raw link is returned as `devLink` for demonstration only.
 */
export const issueToken = async ({ user, patient, purpose, createdBy, skipLimits = false }) => {
  // skipLimits: used when staff correct a wrong email, so the new invitation goes out even right after the first one.
  if (purpose === 'invitation' && !skipLimits) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await Invitation.find({ user: user._id, purpose, createdAt: { $gte: since } }).sort({ createdAt: -1 });
    if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new ApiError(429, 'An invitation was sent less than a minute ago. Please wait before resending.');
    }
    if (recent.length >= MAX_INVITES_PER_DAY) {
      throw new ApiError(429, `Invitation limit reached (${MAX_INVITES_PER_DAY} per 24 hours).`);
    }
  }

  await Invitation.updateMany({ user: user._id, purpose, usedAt: null, revokedAt: null }, { revokedAt: new Date() });

  const rawToken = generateRawToken();
  const ttlMs = purpose === 'invitation' ? env.invitationTtlHours * 3600 * 1000 : env.resetTtlMinutes * 60 * 1000;
  const invitation = await Invitation.create({
    user: user._id,
    patient: patient?._id,
    purpose,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + ttlMs),
    createdBy: createdBy?._id,
  });

  const link = linkFor(purpose, rawToken);
  const content =
    purpose === 'invitation'
      ? invitationEmail({ name: user.name, link, expiresHours: env.invitationTtlHours })
      : passwordResetEmail({ name: user.name, link, expiresMinutes: env.resetTtlMinutes });

  // Send in the background so the request returns immediately; the outcome is saved on the token record.
  const delivering = willDeliver(user.email);
  sendEmailInBackground({ to: user.email, ...content }, (status, error) =>
    Invitation.updateOne({ _id: invitation._id }, { emailStatus: status, sentAt: status === 'failed' ? undefined : new Date(), emailError: error?.message }).catch(() => {}),
  );

  return {
    invitation: {
      id: invitation._id,
      emailStatus: delivering ? 'pending' : 'logged_dev',
      expiresAt: invitation.expiresAt,
    },
    // Show the link on screen only in development AND only when no real email is being sent.
    devLink: env.isProduction || delivering ? undefined : link,
  };
};

/** Returns the usable token document or throws a uniform error (no detail on why it failed). */
export const findUsableToken = async (rawToken, purpose) => {
  if (!rawToken || typeof rawToken !== 'string') throw ApiError.badRequest('This link is invalid or has expired.');
  const invitation = await Invitation.findOne({ tokenHash: hashToken(rawToken), purpose }).populate('user', 'name email status role');
  if (!invitation || !invitation.isUsable || !invitation.user) {
    throw ApiError.badRequest('This link is invalid or has expired.');
  }
  return invitation;
};

export const latestInvitationFor = (userId) =>
  Invitation.findOne({ user: userId, purpose: 'invitation' }).sort({ createdAt: -1 }).select('-tokenHash').lean();
