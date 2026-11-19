import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { User } from '../../users/model/user.model.js';
import { Patient } from '../../patients/model/patient.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { ROLES, STAFF_ROLES } from '../../utils/constants.js';
import { findUsableToken, issueToken } from './invitation.service.js';
import { ACTIONS, logActivity } from '../../activity/service/activity.service.js';
import { sendEmailInBackground, willDeliver } from '../../emails/service/email.service.js';
import { recordAudit } from '../../audit/service/audit.service.js';
import { passwordChangedEmail, welcomeEmail } from '../../emails/templates/index.js';
import { nextSequence } from '../../utils/counter.model.js';

const BCRYPT_ROUNDS = 12;
// Used to equalise response time when the email does not exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', BCRYPT_ROUNDS);

// Spaces at the start/end of a password are ignored everywhere (registration, reset, sign-in), so a
// password copied from an email with a stray space still works.
const cleanPassword = (password) => String(password ?? '').trim();
export const hashPassword = (password) => bcrypt.hash(cleanPassword(password), BCRYPT_ROUNDS);

export const signToken = (user) => jwt.sign({ sub: String(user._id), role: user.role, tv: user.tokenVersion ?? 0 }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

const buildSession = async (user) => {
  const fresh = await User.findById(user._id).select('+tokenVersion');
  let patient = null;
  if (fresh.role === ROLES.PATIENT && fresh.patient) {
    patient = await Patient.findById(fresh.patient).select('fullName patientCode dateOfBirth gender').lean();
  }
  return { token: signToken(fresh), user: { ...fresh.toSafeJSON(), patientProfile: patient } };
};

/** portal: 'staff' accepts admin/clinician; 'patient' accepts patients only. */
export const login = async ({ email, password, portal }) => {
  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+passwordHash +tokenVersion');
  const genericError = ApiError.unauthorized('Invalid email or password');

  if (!user || !user.passwordHash) {
    // Equalise timing to reduce account enumeration.
    await bcrypt.compare(cleanPassword(password), DUMMY_HASH);
    throw genericError;
  }
  const valid = await bcrypt.compare(cleanPassword(password), user.passwordHash);
  if (!valid) throw genericError;

  const allowed = portal === 'patient' ? user.role === ROLES.PATIENT : STAFF_ROLES.includes(user.role);
  if (!allowed) throw genericError;
  if (user.status !== 'active') throw ApiError.forbidden('This account is not active. Please contact the hospital.');

  if (user.role === ROLES.PATIENT) {
    const patient = await Patient.findById(user.patient).select('status');
    if (!patient || patient.status !== 'active') throw ApiError.forbidden('This account is not active. Please contact the hospital.');
  }

  user.lastLoginAt = new Date();
  await user.save();
  return buildSession(user);
};

/** Invalidates every token issued to this user. */
export const logout = async (userId) => {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
};

export const getCurrentUser = async (user) => (await buildSession(user)).user;

export const verifyInvitation = async (rawToken) => {
  const invitation = await findUsableToken(rawToken, 'invitation');
  return { name: invitation.user.name, email: invitation.user.email, expiresAt: invitation.expiresAt };
};

export const acceptInvitation = async ({ token, password }) => {
  const invitation = await findUsableToken(token, 'invitation');
  // Atomically mark as used to prevent the same link being redeemed twice.
  const claimed = await invitation.constructor.findOneAndUpdate(
    { _id: invitation._id, usedAt: null },
    { usedAt: new Date() },
    { new: true },
  );
  if (!claimed) throw ApiError.badRequest('This link is invalid or has expired.');

  const user = await User.findById(invitation.user._id).select('+tokenVersion');
  if (user.status === 'disabled') throw ApiError.forbidden('This account is not active. Please contact the hospital.');
  user.passwordHash = await hashPassword(password);
  user.status = 'active';
  user.tokenVersion += 1;
  await user.save();
  await Patient.updateOne({ _id: user.patient }, { declaration: { accepted: true, acceptedAt: new Date() } });

  await logActivity({
    actor: user,
    action: ACTIONS.INVITATION_ACCEPTED,
    category: 'patient',
    message: `${user.name} set up their patient account`,
    entityType: 'Patient',
    entityId: user.patient,
    patient: user.patient,
  });
  return buildSession(user);
};

const SELF_REGISTER_FIELDS = ['phone', 'gender', 'address', 'city', 'state', 'pincode', 'location', 'maritalStatus', 'education', 'occupation', 'referredBy'];

/**
 * Patient self-registration. The patient chooses their own password; the welcome email contains
 * the Patient ID, login email, password and a login link (sent in the background).
 */
export const registerPatient = async (data) => {
  const email = String(data.email).toLowerCase().trim();
  if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists. Please sign in instead.');

  const user = await User.create({
    name: data.fullName.trim(),
    email,
    role: ROLES.PATIENT,
    status: 'active',
    passwordHash: await hashPassword(data.password),
  });
  let patient;
  try {
    const seq = await nextSequence('patientCode');
    patient = await Patient.create({
      ...Object.fromEntries(SELF_REGISTER_FIELDS.filter((f) => data[f] !== undefined).map((f) => [f, data[f]])),
      patientCode: `ATH-${String(seq).padStart(4, '0')}`,
      user: user._id,
      fullName: data.fullName.trim(),
      email,
      age: data.age === '' || data.age === undefined ? undefined : Number(data.age),
      declaration: { accepted: true, acceptedAt: new Date() },
      source: 'self_registration',
      lastActivityAt: new Date(),
    });
    user.patient = patient._id;
    await user.save();
  } catch (error) {
    await User.deleteOne({ _id: user._id });
    throw error;
  }

  const loginLink = `${env.clientUrl}/login?email=${encodeURIComponent(email)}`;
  // The welcome email is sent in the background so registration responds immediately (SMTP can take
  // several seconds). Its outcome is written to the audit log when sending finishes.
  const delivering = willDeliver(email);
  sendEmailInBackground(
    { to: email, ...welcomeEmail({ name: patient.fullName, email, patientCode: patient.patientCode, password: cleanPassword(data.password), link: loginLink }) },
    (status, error) =>
      recordAudit({
        actor: user,
        action: status === 'failed' ? 'email.welcome_failed' : 'email.welcome_sent',
        outcome: status === 'failed' ? 'failure' : 'success',
        patientId: patient._id,
        details: status === 'failed' ? error?.message : status === 'sent' ? `Sent to ${email}` : 'Not sent (development / test address) — saved to dev-mail',
      }),
  );
  const emailStatus = delivering ? 'sending' : 'logged_dev';

  await logActivity({
    actor: user,
    action: ACTIONS.PATIENT_REGISTERED,
    category: 'patient',
    message: `${patient.fullName} registered a new account`,
    entityType: 'Patient',
    entityId: patient._id,
    patient: patient._id,
  });

  return {
    patientCode: patient.patientCode,
    email,
    emailStatus,
    ...(env.isProduction || delivering ? {} : { devLoginLink: loginLink }),
  };
};

export const forgotPassword = async (email) => {
  const user = await User.findOne({ email: String(email).toLowerCase().trim(), status: 'active' });
  // Always respond identically to avoid revealing which emails are registered.
  if (!user) return { devLink: undefined };
  const { devLink } = await issueToken({ user, purpose: 'password_reset' });
  return { devLink };
};

export const resetPassword = async ({ token, password }) => {
  const record = await findUsableToken(token, 'password_reset');
  const claimed = await record.constructor.findOneAndUpdate({ _id: record._id, usedAt: null }, { usedAt: new Date() });
  if (!claimed) throw ApiError.badRequest('This link is invalid or has expired.');
  const user = await User.findById(record.user._id).select('+tokenVersion');
  user.passwordHash = await hashPassword(password);
  user.tokenVersion += 1; // sign out every existing session
  await user.save();

  // Confirmation email with the new login details, sent in the background; outcome recorded in the audit log.
  const loginPath = user.role === ROLES.PATIENT ? '/login' : '/admin/login';
  const link = `${env.clientUrl}${loginPath}?email=${encodeURIComponent(user.email)}`;
  sendEmailInBackground({ to: user.email, ...passwordChangedEmail({ name: user.name, email: user.email, password: cleanPassword(password), link }) }, (status, error) =>
    recordAudit({
      actor: user,
      action: status === 'failed' ? 'email.password_changed_failed' : 'email.password_changed_sent',
      outcome: status === 'failed' ? 'failure' : 'success',
      patientId: user.patient || undefined,
      details: status === 'failed' ? error?.message : status === 'sent' ? `Sent to ${user.email}` : 'Not sent (development / test address) — saved to dev-mail',
    }),
  );
};
