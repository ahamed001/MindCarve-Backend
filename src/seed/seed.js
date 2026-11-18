import { pathToFileURL } from 'url';
import { env } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { User } from '../users/model/user.model.js';
import { Patient } from '../patients/model/patient.model.js';
import { Assessment } from '../assessments/model/assessment.model.js';
import { Question } from '../assessments/model/question.model.js';
import { Assignment } from '../assignments/model/assignment.model.js';
import { Response } from '../responses/model/response.model.js';
import { ActivityLog } from '../activity/model/activity.model.js';
import { hashPassword } from '../auth/service/auth.service.js';
import { publishAssessment } from '../assessments/service/assessment.service.js';
import { assignAssessments } from '../assignments/service/assignment.service.js';
import { calculateResult } from '../results/service/result.service.js';
import { ACTIONS, logActivity } from '../activity/service/activity.service.js';
import { AssessmentVersion } from '../assessments/model/assessmentVersion.model.js';
import { nextSequence } from '../utils/counter.model.js';
import { ROLES, ASSIGNMENT_STATUS } from '../utils/constants.js';
import { instruments } from './instruments/index.js';

const DAY = 24 * 60 * 60 * 1000;

const ensureStaff = async ({ name, email, password, role, isDemo = false }) => {
  const existing = await User.findOne({ email });
  if (existing) return existing;
  return User.create({ name, email, role, status: 'active', passwordHash: await hashPassword(password), isDemo });
};

/**
 * Keeps a seeded instrument's scoring configuration (and its source notes) in line with the code.
 * When they differ, the configuration is updated and a NEW version is published — earlier attempts keep
 * the version they were taken under. Questions are never changed here.
 */
// Canonical form for comparison: schema defaults applied, keys sorted, empty arrays/objects dropped.
const canonical = (value) => {
  if (Array.isArray(value)) return value.length ? value.map(canonical) : undefined;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const entries = Object.keys(value)
      .sort()
      .map((k) => [k, canonical(value[k])])
      .filter(([, v]) => v !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return value;
};
const normalisedScoring = (scoring) => JSON.stringify(canonical(new Assessment({ code: 'X', name: 'X', scoring }).toObject().scoring) ?? null);

export const syncSeedScoring = async (existing, definition) => {
  if (!existing.isSeed) return 'exists (not a seeded instrument, left unchanged)';
  const before = normalisedScoring(existing.scoring?.toObject ? existing.scoring.toObject() : existing.scoring);
  const after = normalisedScoring(definition.scoring);
  if (before === after) return 'up to date';
  existing.scoring = definition.scoring;
  existing.sourceNotes = definition.sourceNotes;
  existing.discrepancies = definition.discrepancies;
  await existing.save();
  const updated = await publishAssessment(existing._id, null);
  return `scoring configuration updated — published as v${updated.currentVersion}`;
};

/** Runs the scoring sync for all built-in instruments (used on every development start-up). */
export const syncSeedInstruments = async () => {
  const lines = [];
  for (const { assessment } of instruments) {
    const existing = await Assessment.findOne({ code: assessment.code });
    if (existing) lines.push(`${assessment.code}: ${await syncSeedScoring(existing, assessment)}`);
  }
  return lines;
};

export const seedInstruments = async (admin) => {
  const summary = [];
  for (const { assessment, questions } of instruments) {
    const existing = await Assessment.findOne({ code: assessment.code });
    if (existing) {
      summary.push(`${assessment.code}: ${await syncSeedScoring(existing, assessment)}`);
      continue;
    }
    const created = await Assessment.create({ ...assessment, isSeed: true, createdBy: admin._id, updatedBy: admin._id });
    await Question.insertMany(questions.map((q) => ({ ...q, assessment: created._id })));
    await publishAssessment(created._id, null);
    summary.push(`${assessment.code}: created with ${questions.length} questions and published as v1`);
  }
  return summary;
};

// --- Demonstration data (clearly flagged isDemo; fictional people only) ---------------------------

const DEMO_PATIENTS = [
  { fullName: 'Demo Patient – Asha R.', dob: '1990-04-12', gender: 'female', codes: ['BEIS-10', 'BFI-10'] },
  { fullName: 'Demo Patient – Vikram S.', dob: '1951-09-03', gender: 'male', codes: ['GDS-15'] },
  { fullName: 'Demo Patient – Meera K.', dob: '1985-01-27', gender: 'female', codes: ['MHI-38', 'GDS-15'] },
  { fullName: 'Demo Patient – Arjun (child) – guardian account', dob: '2016-06-18', gender: 'male', guardianName: 'Demo Guardian', codes: ['SCARED-P', 'ISAA'] },
  { fullName: 'Demo Patient – Fatima N.', dob: '1948-11-30', gender: 'female', codes: ['GDS-15', 'BEIS-10'] },
  { fullName: 'Demo Patient – Rahul D.', dob: '1999-02-08', gender: 'male', codes: ['BFI-10', 'SCARED-P'] },
];

// Deterministic pseudo-random generator so demo data is reproducible.
const rng = (seed) => () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};

const answersFor = (version, rand, bias) =>
  [...version.questions]
    .sort((a, b) => a.order - b.order)
    .map((q, i) => {
      const opts = q.options;
      const idx = Math.min(opts.length - 1, Math.max(0, Math.floor((rand() * 0.6 + bias * 0.4) * opts.length)));
      const option = opts[idx];
      return { itemId: q.itemId, questionNumber: i + 1, value: option.value, selectedLabel: option.label, score: option.score, answeredAt: new Date() };
    });

export const seedDemoData = async (admin, clinician) => {
  if (await Patient.exists({ isDemo: true })) return ['Demo data already present (skipped)'];
  const rand = rng(42);
  const demoPassword = 'DemoPatient@1';
  const assessments = await Assessment.find({ code: { $in: instruments.map((i) => i.assessment.code) } });
  const byCode = new Map(assessments.map((a) => [a.code, a]));
  const created = [];

  for (const [index, p] of DEMO_PATIENTS.entries()) {
    const email = `demo.patient${index + 1}@example.test`;
    const registeredAt = new Date(Date.now() - (20 - index * 2) * DAY);
    const user = await User.create({
      name: p.fullName,
      email,
      role: ROLES.PATIENT,
      status: 'active',
      passwordHash: await hashPassword(demoPassword),
      isDemo: true,
    });
    const patient = await Patient.create({
      patientCode: `ATH-${String(await nextSequence('patientCode')).padStart(4, '0')}`,
      user: user._id,
      fullName: p.fullName,
      email,
      phone: `+91 90000 0000${index}`,
      dateOfBirth: new Date(p.dob),
      gender: p.gender,
      guardianName: p.guardianName,
      relevantInfo: 'Fictional demonstration record.',
      createdBy: admin._id,
      isDemo: true,
      declaration: index === 2 ? { accepted: false } : { accepted: true, acceptedAt: registeredAt },
      lastActivityAt: registeredAt,
    });
    user.patient = patient._id;
    await user.save();
    await logActivity({
      actor: admin,
      action: ACTIONS.PATIENT_REGISTERED,
      category: 'patient',
      message: `New patient registered: ${patient.fullName}`,
      entityType: 'Patient',
      entityId: patient._id,
      patient: patient._id,
      isDemo: true,
      createdAt: registeredAt,
    });

    const ids = p.codes.map((code) => byCode.get(code)?._id).filter(Boolean);
    const { created: assignments } = await assignAssessments(patient._id, ids, { dueDate: new Date(Date.now() + 7 * DAY) }, admin, { isDemo: true });

    for (const [aIndex, assignment] of assignments.entries()) {
      // Leave the second assignment of every other patient pending / in progress for realism.
      const complete = aIndex === 0 || index % 2 === 0;
      const version = await AssessmentVersion.findById(assignment.assessmentVersion).lean();
      const daysAgo = (index + aIndex * 3) % 7;
      const completedAt = new Date(Date.now() - daysAgo * DAY - Math.floor(rand() * 6) * 3600 * 1000);
      const bias = index === 1 || index === 3 ? 0.9 : rand();

      if (complete) {
        await Response.create({
          assignment: assignment._id,
          patient: patient._id,
          assessmentVersion: version._id,
          answers: answersFor(version, rand, bias),
          status: 'submitted',
          lastSavedAt: completedAt,
          submittedAt: completedAt,
        });
        await Assignment.updateOne(
          { _id: assignment._id },
          { status: ASSIGNMENT_STATUS.COMPLETED, startedAt: new Date(completedAt.getTime() - 20 * 60 * 1000), completedAt },
        );
        await logActivity({
          actor: user,
          action: ACTIONS.ASSESSMENT_COMPLETED,
          category: 'assessment',
          message: `${patient.fullName} completed ${version.code}`,
          entityType: 'Assignment',
          entityId: assignment._id,
          patient: patient._id,
          isDemo: true,
          createdAt: completedAt,
        });
        await calculateResult(assignment._id, { actor: user, isDemo: true, calculatedAt: completedAt });
        await Patient.updateOne({ _id: patient._id }, { lastActivityAt: completedAt });
      } else if (index % 3 === 0) {
        const startedAt = new Date(Date.now() - 2 * 3600 * 1000);
        await Response.create({
          assignment: assignment._id,
          patient: patient._id,
          assessmentVersion: version._id,
          answers: answersFor(version, rand, 0.5).slice(0, Math.ceil(version.questions.length / 3)),
          status: 'draft',
          lastSavedAt: startedAt,
        });
        await Assignment.updateOne({ _id: assignment._id }, { status: ASSIGNMENT_STATUS.IN_PROGRESS, startedAt });
        await logActivity({
          actor: user,
          action: ACTIONS.ASSESSMENT_STARTED,
          category: 'assessment',
          message: `${patient.fullName} started ${version.code}`,
          entityType: 'Assignment',
          entityId: assignment._id,
          patient: patient._id,
          isDemo: true,
          createdAt: startedAt,
        });
      }
    }
    created.push(`${patient.patientCode} ${patient.fullName} <${email}>`);
  }

  // Backdate the seeding "assigned" activity entries so the feed reads naturally.
  await ActivityLog.updateMany({ isDemo: true, action: ACTIONS.ASSESSMENT_ASSIGNED }, [{ $set: { createdAt: { $subtract: ['$createdAt', 9 * DAY] } } }]);

  const firstPatient = await Patient.findOne({ isDemo: true }).sort({ createdAt: 1 });
  await logActivity({
    actor: clinician,
    action: ACTIONS.NOTE_ADDED,
    category: 'clinical',
    message: `${clinician.name} added notes for ${firstPatient.fullName}`,
    entityType: 'Patient',
    entityId: firstPatient._id,
    patient: firstPatient._id,
    isDemo: true,
    createdAt: new Date(Date.now() - 3 * 3600 * 1000),
  });

  return [`Demo patients (password ${demoPassword}):`, ...created];
};

/** Development-only patient login from SEED_PATIENT_* (active account, declaration signed). */
export const seedDevPatient = async (admin) => {
  const { email, password, name } = env.seedPatient;
  if (!email || !password) return [];
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return [`Patient: ${email} (exists, left unchanged)`];

  const user = await User.create({ name, email, role: ROLES.PATIENT, status: 'active', passwordHash: await hashPassword(password), isDemo: true });
  const patient = await Patient.create({
    patientCode: `ATH-${String(await nextSequence('patientCode')).padStart(4, '0')}`,
    user: user._id,
    fullName: name,
    email: email.toLowerCase(),
    phone: '+91 90000 00000',
    age: 30,
    gender: 'prefer_not_to_say',
    city: 'Chennai',
    state: 'Tamil Nadu',
    relevantInfo: 'Development test account.',
    declaration: { accepted: true, acceptedAt: new Date() },
    createdBy: admin._id,
    isDemo: true,
    lastActivityAt: new Date(),
  });
  user.patient = patient._id;
  await user.save();
  return [`Patient: ${email} / ${password} (development credentials, ${patient.patientCode})`];
};

export const runSeed = async ({ withDemo = false, withDevPatient = true } = {}) => {
  // Short development passwords (e.g. admin123) are allowed locally but never in production.
  if (env.isProduction && (env.seedAdmin.password.length < 12 || ['Admin@12345', 'admin123'].includes(env.seedAdmin.password))) {
    throw new Error('Refusing to seed a weak admin password in production. Set a strong SEED_ADMIN_PASSWORD (12+ characters).');
  }
  const admin = await ensureStaff({ ...env.seedAdmin, role: ROLES.ADMIN });
  const lines = [`Admin: ${admin.email}${env.isProduction ? '' : ` / ${env.seedAdmin.password} (development credentials)`}`];
  lines.push(...(await seedInstruments(admin)));

  if (withDemo && !env.isProduction) {
    const clinician = await ensureStaff({
      name: 'Dr. Demo Clinician',
      email: 'clinician@athma.local',
      password: 'Clinician@123',
      role: ROLES.CLINICIAN,
      isDemo: true,
    });
    lines.push(`Clinician (demo): ${clinician.email} / Clinician@123`);
    lines.push(...(await seedDemoData(admin, clinician)));
  }
  if (!env.isProduction && withDevPatient) lines.push(...(await seedDevPatient(admin)));
  lines.forEach((l) => console.info(`[seed] ${l}`));
  return lines;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const withDemo = process.argv.includes('--demo');
  // --base: admin + the six instruments only (no dev patient, no demo data) — for a real database.
  const base = process.argv.includes('--base');
  connectDatabase()
    .then(() => runSeed({ withDemo: withDemo && !base, withDevPatient: !base }))
    .then(() => disconnectDatabase())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[seed] Failed:', error);
      process.exit(1);
    });
}
