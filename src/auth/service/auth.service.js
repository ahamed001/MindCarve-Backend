import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { User } from '../../users/model/user.model.js';
import { Patient } from '../../patients/model/patient.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { ROLES, STAFF_ROLES } from '../../utils/constants.js';
import { findUsableToken, issueToken } from './invitation.service.js';
import { ACTIONS, logActivity } from '../../activity/service/activity.service.js';
import { sendEmail } from '../../emails/service/email.service.js';
import { welcomeEmail } from '../../emails/templates/index.js';
import { nextSequence } from '../../utils/counter.model.js';

const BCRYPT_ROUNDS = 12;
// Used to equalise response time when the email does not exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', BCRYPT_ROUNDS);

export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);

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
    await bcrypt.compare(String(password), DUMMY_HASH);
    throw genericError;
  }
  const valid = await bcrypt.compare(String(password), user.passwordHash);
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
 * the login email, Patient ID and a login link — never the password.
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
  let emailStatus;
  try {
    ({ status: emailStatus } = await sendEmail({
      to: email,
      ...welcomeEmail({ name: patient.fullName, email, patientCode: patient.patientCode, password: data.password, link: loginLink }),
    }));
  } catch (error) {
    emailStatus = 'failed';
    if (!env.isTest) console.error('[register] welcome email failed', error.message);
  }

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
    ...(env.isProduction ? {} : { devLoginLink: loginLink }),
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
};
