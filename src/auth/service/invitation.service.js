import { Invitation } from '../model/invitation.model.js';
import { env } from '../../config/env.js';
import { generateRawToken, hashToken } from '../../utils/tokens.js';
import { sendEmail } from '../../emails/service/email.service.js';
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
export const issueToken = async ({ user, patient, purpose, createdBy }) => {
  if (purpose === 'invitation') {
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

  try {
    const { status } = await sendEmail({ to: user.email, ...content });
    invitation.emailStatus = status;
    invitation.sentAt = new Date();
  } catch (error) {
    invitation.emailStatus = 'failed';
    invitation.emailError = error.message;
  }
  await invitation.save();

  return {
    invitation: {
      id: invitation._id,
      emailStatus: invitation.emailStatus,
      expiresAt: invitation.expiresAt,
      sentAt: invitation.sentAt,
    },
    devLink: env.isProduction ? undefined : link,
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
