import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-testing-purposes';
// Pin seed credentials so local .env values do not affect the tests.
process.env.SEED_ADMIN_EMAIL = 'admin@athma.local';
process.env.SEED_ADMIN_PASSWORD = 'Admin@12345';
process.env.SEED_PATIENT_EMAIL = '';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: request } = await import('supertest');
const { connectDatabase, disconnectDatabase } = await import('../src/config/db.js');
const { createApp } = await import('../src/app.js');
const { runSeed } = await import('../src/seed/seed.js');
const { Invitation } = await import('../src/auth/model/invitation.model.js');
const { Assessment } = await import('../src/assessments/model/assessment.model.js');

let mongo;
let app;
let adminCookie;
let gds;

const cookieFrom = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('athma_token='))?.split(';')[0];
const tokenFrom = (link) => new URL(link).searchParams.get('token');

const login = async (email, password, portal) => {
  const res = await request(app).post('/api/auth/login').send({ email, password, portal });
  assert.equal(res.status, 200, res.body.message);
  return cookieFrom(res);
};

const registerPatient = async (email, assessmentIds) => {
  const res = await request(app)
    .post('/api/patients')
    .set('Cookie', adminCookie)
    .send({ fullName: 'Test Patient', email, phone: '+91 98765 43210', dateOfBirth: '1950-01-01', gender: 'female', assessmentIds });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
};

const onboard = async (email, assessmentIds) => {
  const created = await registerPatient(email, assessmentIds);
  const res = await request(app).post('/api/auth/invitations/accept').send({ token: tokenFrom(created.devInviteLink), password: 'Patient123', declarationAccepted: true });
  assert.equal(res.status, 200, res.body.message);
  return { ...created, cookie: cookieFrom(res) };
};

before(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri('athma-test'));
  await runSeed({ withDemo: false });
  app = createApp();
  adminCookie = await login('admin@athma.local', 'Admin@12345', 'staff');
  gds = await Assessment.findOne({ code: 'GDS-15' });
});

after(async () => {
  await disconnectDatabase();
  await mongo.stop();
});

describe('Authentication & authorisation', () => {
  test('unauthenticated requests are rejected', async () => {
    const res = await request(app).get('/api/patients');
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  test('staff credentials cannot sign in through the patient portal', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@athma.local', password: 'Admin@12345', portal: 'patient' });
    assert.equal(res.status, 401);
  });

  test('all six instruments are seeded and published', async () => {
    const res = await request(app).get('/api/assessments').set('Cookie', adminCookie);
    assert.equal(res.status, 200);
    const codes = res.body.data.items.map((a) => `${a.code}:${a.questionCount}:${a.status}`).sort();
    assert.deepEqual(codes, ['BEIS-10:10:published', 'BFI-10:10:published', 'GDS-15:15:published', 'ISAA:40:published', 'MHI-38:38:published', 'SCARED-P:41:published']);
  });
});

describe('Full patient journey', () => {
  let patient;
  let assignmentId;

  test('admin registers a patient; invitation is issued and no password is emailed', async () => {
    patient = await registerPatient('journey@example.test', [String(gds._id)]);
    assert.equal(patient.assignments.created, 1);
    assert.ok(patient.devInviteLink.includes('/setup-account?token='));
    const inv = await Invitation.findOne({ user: patient.patient.user });
    assert.notEqual(inv.tokenHash, tokenFrom(patient.devInviteLink), 'only a hash is stored');
  });

  test('patient cannot sign in before setting a password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'journey@example.test', password: 'whatever1', portal: 'patient' });
    assert.equal(res.status, 401);
  });

  test('invitation verifies, is accepted once, and cannot be reused', async () => {
    const token = tokenFrom(patient.devInviteLink);
    const verify = await request(app).get('/api/auth/invitations/verify').query({ token });
    assert.equal(verify.status, 200);
    assert.equal(verify.body.data.email, 'journey@example.test');

    const accept = await request(app).post('/api/auth/invitations/accept').send({ token, password: 'Patient123', declarationAccepted: true });
    assert.equal(accept.status, 200);
    patient.cookie = cookieFrom(accept);

    const reuse = await request(app).post('/api/auth/invitations/accept').send({ token, password: 'Patient456', declarationAccepted: true });
    assert.equal(reuse.status, 400);
  });

  test('patient sees only their assignment, without scores or scoring config', async () => {
    const list = await request(app).get('/api/me/assignments').set('Cookie', patient.cookie);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.items.length, 1);
    assignmentId = list.body.data.items[0]._id;

    const detail = await request(app).get(`/api/me/assignments/${assignmentId}`).set('Cookie', patient.cookie);
    assert.equal(detail.status, 200);
    const { assessment } = detail.body.data;
    assert.equal(assessment.questions.length, 15);
    assert.equal(assessment.questions[0].text, 'Are you basically satisfied with your life?');
    assert.equal(assessment.scoring, undefined);
    assert.equal(assessment.questions[0].options[0].score, undefined);
  });

  test('progress is saved and resumable', async () => {
    const save = await request(app)
      .put(`/api/me/assignments/${assignmentId}/responses`)
      .set('Cookie', patient.cookie)
      .send({ answers: [{ itemId: '1', value: 'no' }, { itemId: '2', value: 'yes' }] });
    assert.equal(save.status, 200);
    assert.equal(save.body.data.answeredCount, 2);

    const resume = await request(app).get(`/api/me/assignments/${assignmentId}`).set('Cookie', patient.cookie);
    assert.equal(resume.body.data.assignment.status, 'in_progress');
    assert.equal(resume.body.data.answers.length, 2);
  });

  test('invalid answers are rejected', async () => {
    const res = await request(app)
      .put(`/api/me/assignments/${assignmentId}/responses`)
      .set('Cookie', patient.cookie)
      .send({ answers: [{ itemId: '3', value: 'maybe' }] });
    assert.equal(res.status, 400);
  });

  test('incomplete submission is refused', async () => {
    const res = await request(app).post(`/api/me/assignments/${assignmentId}/submit`).set('Cookie', patient.cookie).send({});
    assert.equal(res.status, 400);
    assert.match(res.body.message, /13 remaining/);
  });

  test('complete submission succeeds exactly once', async () => {
    // Depressive answers for items 1–6 => score 6 ("Suggests depression"), the rest non-depressive.
    const depressive = ['no', 'yes', 'yes', 'yes', 'no', 'yes', 'no', 'yes', 'yes', 'yes', 'no', 'yes', 'no', 'yes', 'yes'];
    const flip = (v) => (v === 'yes' ? 'no' : 'yes');
    const answers = depressive.map((v, i) => ({ itemId: String(i + 1), value: i < 6 ? v : flip(v) }));

    const [first, second] = await Promise.all([
      request(app).post(`/api/me/assignments/${assignmentId}/submit`).set('Cookie', patient.cookie).send({ answers }),
      request(app).post(`/api/me/assignments/${assignmentId}/submit`).set('Cookie', patient.cookie).send({ answers }),
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [200, 409]);

    const again = await request(app).post(`/api/me/assignments/${assignmentId}/submit`).set('Cookie', patient.cookie).send({});
    assert.equal(again.status, 409);
  });

  test('admin sees submitted responses and backend-calculated result', async () => {
    const res = await request(app).get(`/api/assignments/${assignmentId}/submission`).set('Cookie', adminCookie);
    assert.equal(res.status, 200);
    const { result, response, version } = res.body.data;
    assert.equal(response.answers.length, 15);
    assert.equal(version.version, 1);
    assert.equal(result.status, 'scored');
    assert.equal(result.total.score, 6);
    assert.equal(result.total.band.label, 'Suggests depression');
    assert.equal(result.reviewStatus, 'flagged');
  });

  test('overview and activity reflect the real actions', async () => {
    const overview = await request(app).get('/api/dashboard/overview').set('Cookie', adminCookie);
    assert.equal(overview.status, 200);
    assert.ok(overview.body.data.kpis.completedThisWeek >= 1);
    assert.ok(overview.body.data.kpis.highRiskFollowUps >= 1);
    assert.equal(overview.body.data.assessmentsByDay.length, 7);

    const activity = await request(app).get('/api/activity').set('Cookie', adminCookie);
    const actions = activity.body.data.items.map((a) => a.action);
    for (const action of ['patient.registered', 'assessment.assigned', 'assessment.started', 'assessment.completed', 'clinical.flagged_for_review']) {
      assert.ok(actions.includes(action), `missing ${action}`);
    }
  });

  test('clinician review and notes are recorded', async () => {
    const sub = await request(app).get(`/api/assignments/${assignmentId}/submission`).set('Cookie', adminCookie);
    const review = await request(app).patch(`/api/results/${sub.body.data.result._id}/review`).set('Cookie', adminCookie).send({ reviewStatus: 'reviewed' });
    assert.equal(review.status, 200);
    const note = await request(app).post(`/api/patients/${patient.patient._id}/notes`).set('Cookie', adminCookie).send({ body: 'Follow-up call scheduled.' });
    assert.equal(note.status, 201);
  });

  test('reports generate real files from stored data', async () => {
    const month = new Date().toISOString().slice(0, 7);
    for (const type of ['monthly_summary', 'high_risk_followups', 'response_analysis', 'clinician_workload']) {
      const gen = await request(app).post('/api/reports').set('Cookie', adminCookie).send({ type, month });
      assert.equal(gen.status, 202);
      let report;
      for (let i = 0; i < 50; i += 1) {
        report = (await request(app).get(`/api/reports/${gen.body.data._id}`).set('Cookie', adminCookie)).body.data;
        if (report.status !== 'generating') break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(report.status, 'ready', `${type} ${report.error || ''}`);
      const file = await request(app).get(`/api/reports/${report._id}/download`).set('Cookie', adminCookie).buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      assert.equal(file.status, 200);
      assert.ok(file.body.length > 500, `${type} file too small`);
      const magic = file.body.subarray(0, 4).toString('latin1');
      assert.ok(type.includes('analysis') || type.includes('workload') ? magic.startsWith('PK') : magic === '%PDF', `${type} wrong format`);
    }
  });

  test('patients cannot access admin APIs or reports', async () => {
    for (const path of ['/api/patients', '/api/assessments', '/api/reports', '/api/dashboard/overview', '/api/activity']) {
      const res = await request(app).get(path).set('Cookie', patient.cookie);
      assert.equal(res.status, 403, path);
    }
  });

  test('logout invalidates the session token', async () => {
    const res = await request(app).post('/api/auth/logout').set('Cookie', patient.cookie);
    assert.equal(res.status, 200);
    const me = await request(app).get('/api/me/assignments').set('Cookie', patient.cookie);
    assert.equal(me.status, 401);
  });
});

describe('Record isolation, invitations and versioning', () => {
  test("a patient cannot access another patient's assignment", async () => {
    const a = await onboard('owner@example.test', [String(gds._id)]);
    const b = await onboard('intruder@example.test', []);
    const list = await request(app).get('/api/me/assignments').set('Cookie', a.cookie);
    const assignmentId = list.body.data.items[0]._id;

    const read = await request(app).get(`/api/me/assignments/${assignmentId}`).set('Cookie', b.cookie);
    assert.equal(read.status, 404);
    const write = await request(app)
      .put(`/api/me/assignments/${assignmentId}/responses`)
      .set('Cookie', b.cookie)
      .send({ answers: [{ itemId: '1', value: 'yes' }] });
    assert.equal(write.status, 404);
  });

  test('expired invitation tokens are rejected', async () => {
    const created = await registerPatient('expired@example.test', []);
    await Invitation.updateMany({ user: created.patient.user }, { expiresAt: new Date(Date.now() - 1000) });
    const res = await request(app).post('/api/auth/invitations/accept').send({ token: tokenFrom(created.devInviteLink), password: 'Patient123', declarationAccepted: true });
    assert.equal(res.status, 400);
  });

  test('a new published version does not change existing assignment snapshots', async () => {
    const { Question } = await import('../src/assessments/model/question.model.js');
    const { publishAssessment } = await import('../src/assessments/service/assessment.service.js');
    const p = await onboard('version@example.test', [String(gds._id)]);
    const list = await request(app).get('/api/me/quizzes').set('Cookie', p.cookie);
    const { assignmentId } = (await request(app).post(`/api/me/quizzes/${list.body.data.items.find((q) => q.code === 'GDS-15').assessmentId}/start`).set('Cookie', p.cookie)).body.data;

    const q1 = await Question.findOne({ assessment: gds._id, itemId: '1' });
    const original = q1.text;
    q1.text = 'EDITED wording for testing';
    await q1.save();
    const published = await publishAssessment(gds._id, null);
    assert.equal(published.currentVersion, 2);

    const view = await request(app).get(`/api/me/assignments/${assignmentId}`).set('Cookie', p.cookie);
    assert.equal(view.body.data.assessment.version, 1);
    assert.equal(view.body.data.assessment.questions[0].text, 'Are you basically satisfied with your life?');

    q1.text = original;
    await q1.save();
    await publishAssessment(gds._id, null);
  });

  test('assessment create / publish / question-edit endpoints are not exposed', async () => {
    const bfi = await Assessment.findOne({ code: 'BFI-10' });
    for (const [method, path] of [
      ['post', '/api/assessments'],
      ['post', `/api/assessments/${bfi._id}/publish`],
      ['put', `/api/assessments/${bfi._id}`],
      ['post', `/api/assessments/${bfi._id}/questions`],
      ['post', `/api/assessments/${bfi._id}/archive`],
    ]) {
      const res = await request(app)[method](path).set('Cookie', adminCookie).send({});
      assert.equal(res.status, 404, `${method} ${path}`);
    }
  });
});

describe('Patient self-registration', () => {
  const form = {
    fullName: 'Self Registered',
    age: 30,
    gender: 'female',
    phone: '+91 90000 12345',
    email: 'self@example.test',
    address: '12 Example Street, Example Area',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600001',
    location: 'Nungambakkam',
    maritalStatus: 'single',
    password: 'Patient123',
    declarationAccepted: true,
  };

  test('declaration must be accepted', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...form, declarationAccepted: false });
    assert.equal(res.status, 400);
  });

  test('registers, emails login details without the password, and the patient can sign in', async () => {
    const res = await request(app).post('/api/auth/register').send(form);
    assert.equal(res.status, 201, res.body.message);
    assert.match(res.body.data.patientCode, /^ATH-\d{4}$/);
    assert.ok(res.body.data.devLoginLink.includes('/login?email='));
    assert.equal(JSON.stringify(res.body).includes('Patient123'), false, 'password never echoed');
    assert.equal(res.headers['set-cookie'], undefined, 'registration does not sign the user in');

    const loginRes = await request(app).post('/api/auth/login').send({ email: form.email, password: form.password, portal: 'patient' });
    assert.equal(loginRes.status, 200);

    const list = await request(app).get('/api/patients').query({ declaration: 'signed', search: 'Self Registered' }).set('Cookie', adminCookie);
    assert.equal(list.body.data.items.length, 1);
    assert.equal(list.body.data.items[0].source, 'self_registration');
    assert.ok(list.body.data.stats.declarationSigned >= 1);
  });

  test('duplicate email is rejected', async () => {
    const res = await request(app).post('/api/auth/register').send(form);
    assert.equal(res.status, 409);
  });
});

describe('Patient quiz list (all published assessments)', () => {
  test('lists every published assessment and start reuses the open attempt', async () => {
    const p = await onboard('quizzes@example.test', []);
    const list = await request(app).get('/api/me/quizzes').set('Cookie', p.cookie);
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.body.data.items.map((q) => q.code),
      ['BEIS-10', 'MHI-38', 'SCARED-P', 'ISAA', 'GDS-15', 'BFI-10'],
    );
    assert.ok(list.body.data.items.every((q) => q.state === 'not_started' && q.scoring === undefined));

    const beis = list.body.data.items[0].assessmentId;
    const first = await request(app).post(`/api/me/quizzes/${beis}/start`).set('Cookie', p.cookie);
    const again = await request(app).post(`/api/me/quizzes/${beis}/start`).set('Cookie', p.cookie);
    assert.equal(first.status, 200);
    assert.equal(first.body.data.assignmentId, again.body.data.assignmentId);

    const staff = await request(app).get('/api/me/quizzes').set('Cookie', adminCookie);
    assert.equal(staff.status, 403);
  });
});

describe('Per-click autosave', () => {
  test('many concurrent single-answer saves never lose an answer', async () => {
    const p = await onboard('clicks@example.test', [String(gds._id)]);
    const list = await request(app).get('/api/me/quizzes').set('Cookie', p.cookie);
    const gdsQuiz = list.body.data.items.find((q) => q.code === 'GDS-15');
    const { assignmentId } = (await request(app).post(`/api/me/quizzes/${gdsQuiz.assessmentId}/start`).set('Cookie', p.cookie)).body.data;
    const saves = Array.from({ length: 15 }, (_, i) =>
      request(app).put(`/api/me/assignments/${assignmentId}/responses`).set('Cookie', p.cookie).send({ answers: [{ itemId: String(i + 1), value: 'yes' }] }),
    );
    const results = await Promise.all(saves);
    assert.ok(results.every((r) => r.status === 200), results.map((r) => r.body.message).join(';'));
    // Change one answer, then confirm all 15 are stored exactly once.
    await request(app).put(`/api/me/assignments/${assignmentId}/responses`).set('Cookie', p.cookie).send({ answers: [{ itemId: '1', value: 'no' }] });
    const view = await request(app).get(`/api/me/assignments/${assignmentId}`).set('Cookie', p.cookie);
    assert.equal(view.body.data.answers.length, 15);
    assert.equal(view.body.data.answers.find((a) => a.itemId === '1').value, 'no');
  });
});

describe('Attempt report (all numbers calculated on the server)', () => {
  test('BEIS-10 report gives totals out of max, levels, counts and per-answer scores', async () => {
    const p = await onboard('report@example.test', []);
    const quizzes = (await request(app).get('/api/me/quizzes').set('Cookie', p.cookie)).body.data.items;
    const beis = quizzes.find((q) => q.code === 'BEIS-10');
    const { assignmentId } = (await request(app).post(`/api/me/quizzes/${beis.assessmentId}/start`).set('Cookie', p.cookie)).body.data;
    const values = [4, 4, 5, 5, 3, 4, 2, 3, 4, 4];
    await request(app).post(`/api/me/assignments/${assignmentId}/submit`).set('Cookie', p.cookie).send({ answers: values.map((v, i) => ({ itemId: String(i + 1), value: String(v) })) });

    const res = await request(app).get(`/api/assignments/${assignmentId}/report`).set('Cookie', adminCookie);
    assert.equal(res.status, 200);
    const { summary, score, questions } = res.body.data;
    assert.deepEqual(summary, { questions: 10, answered: 10, notAttended: 0, percentAnswered: 100 });
    assert.deepEqual([score.total.score, score.total.min, score.total.max], [38, 10, 50]);
    assert.equal(score.total.level.source, 'range', 'BEIS has no source norms, so only a range position is given');
    assert.equal(score.kind, 'range');
    assert.deepEqual(score.segments.map((x) => x.label), ['Low', 'Mid', 'High']);
    assert.equal(score.subscales.length, 5);
    assert.equal(score.chips.reduce((n, c) => n + c.count, 0), 5);
    assert.ok(score.rangeNote);
    assert.equal(res.body.data.patient.fullName, 'Test Patient');
    assert.equal(res.body.data.patient.ageYears, 76);
    assert.equal(questions[0].answerLabel, 'Agree');
    assert.equal(questions[0].score, 4);

    const detail = await request(app).get(`/api/patients/${p.patient._id}`).set('Cookie', adminCookie);
    const attempt = detail.body.data.assignments.find((a) => String(a._id) === String(assignmentId));
    assert.deepEqual(attempt.progress, { questionCount: 10, answeredCount: 10, percentAnswered: 100 });
    assert.equal(detail.body.data.patient.ageYears, 76);

    const patientTry = await request(app).get(`/api/assignments/${assignmentId}/report`).set('Cookie', p.cookie);
    assert.equal(patientTry.status, 403);
  });
});

describe('Score summary display per instrument (decided on the server)', () => {
  test('each instrument gets its own card kind and labels', async () => {
    const p = await onboard('kinds@example.test', []);
    const quizzes = (await request(app).get('/api/me/quizzes').set('Cookie', p.cookie)).body.data.items;
    const take = async (code, value) => {
      const quiz = quizzes.find((q) => q.code === code);
      const { assignmentId } = (await request(app).post(`/api/me/quizzes/${quiz.assessmentId}/start`).set('Cookie', p.cookie)).body.data;
      const view = (await request(app).get(`/api/me/assignments/${assignmentId}`).set('Cookie', p.cookie)).body.data;
      const answers = view.assessment.questions.map((q) => ({ itemId: q.itemId, value: typeof value === 'function' ? value(q) : value }));
      const sub = await request(app).post(`/api/me/assignments/${assignmentId}/submit`).set('Cookie', p.cookie).send({ answers });
      assert.equal(sub.status, 200, `${code}: ${sub.body.message}`);
      return (await request(app).get(`/api/assignments/${assignmentId}/report`).set('Cookie', adminCookie)).body.data.score;
    };

    const scared = await take('SCARED-P', '2'); // all "Very True" → every cutoff met
    assert.equal(scared.kind, 'cutoff');
    assert.deepEqual(scared.segments.map((s) => s.label), ['Below cutoff', 'Meets cutoff']);
    assert.ok(scared.subscales.every((s) => s.level.label === 'Meets screening cutoff' && s.level.tone === 'alert'));
    assert.deepEqual(scared.chips, [{ key: 'meets', label: 'Meets screening cutoff', count: 5, tone: 'alert' }]);
    assert.equal(scared.total.level.label, 'Meets screening cutoff');
    assert.match(scared.total.level.detail, /score ≥ 25/);
    assert.equal(scared.total.level.tone, 'alert');

    const bfi = await take('BFI-10', '4');
    assert.equal(bfi.kind, 'bands');
    assert.equal(bfi.groupLabel, 'Traits');
    assert.equal(bfi.subscales.find((s) => s.key === 'agreeableness').score, 6); // 4 + (6-4)
    assert.equal(bfi.subscales.find((s) => s.key === 'agreeableness').level.label, 'Average');
    assert.equal(bfi.subscales.find((s) => s.key === 'agreeableness').max, 10);

    const isaa = await take('ISAA', '3'); // 40 × 3 = 120 → Moderate Autism, 70%
    assert.equal(isaa.kind, 'score');
    assert.equal(isaa.groupLabel, 'Domains');
    assert.equal(isaa.total.score, 120);
    assert.equal(isaa.total.level.label, 'Moderate Autism (70%)');
    assert.deepEqual(isaa.outputs.map((o) => [o.value, o.label]), [[70, '70%']]);
    assert.equal(isaa.total.level.tone, 'alert');
    assert.deepEqual(isaa.chips, []);

    const gds = await take('GDS-15', 'yes');
    assert.equal(gds.kind, null);
    assert.equal(gds.total.level.label, 'Suggests depression');
    assert.equal(gds.total.level.tone, 'alert');
  });
});

describe('Patient detail lists every published assessment', () => {
  test('not-started assessments are included with state not_started', async () => {
    const p = await onboard('allsix@example.test', []);
    const res = await request(app).get(`/api/patients/${p.patient._id}`).set('Cookie', adminCookie);
    const rows = res.body.data.assessments;
    assert.equal(rows.length, 6);
    assert.deepEqual(rows.map((r) => r.code), ['BEIS-10', 'MHI-38', 'SCARED-P', 'ISAA', 'GDS-15', 'BFI-10']);
    assert.ok(rows.every((r) => r.state === 'not_started' && r.attempt === null));
    assert.equal(res.body.data.completedCount, 0);
  });
});

describe('Combined patient report', () => {
  test('includes every started assessment with scores and answers; lists not-started ones', async () => {
    const p = await onboard('combined@example.test', []);
    const quizzes = (await request(app).get('/api/me/quizzes').set('Cookie', p.cookie)).body.data.items;
    const start = async (code) => (await request(app).post(`/api/me/quizzes/${quizzes.find((q) => q.code === code).assessmentId}/start`).set('Cookie', p.cookie)).body.data.assignmentId;
    const beis = await start('BEIS-10');
    await request(app).post(`/api/me/assignments/${beis}/submit`).set('Cookie', p.cookie).send({ answers: Array.from({ length: 10 }, (_, i) => ({ itemId: String(i + 1), value: '3' })) });
    const gdsId = await start('GDS-15');
    await request(app).put(`/api/me/assignments/${gdsId}/responses`).set('Cookie', p.cookie).send({ answers: [{ itemId: '1', value: 'no' }] });

    const res = await request(app).get(`/api/patients/${p.patient._id}/report`).set('Cookie', adminCookie);
    assert.equal(res.status, 200);
    const { patient, sections, notStarted } = res.body.data;
    assert.equal(patient.fullName, 'Test Patient');
    assert.deepEqual(sections.map((s) => [s.assessment.code, s.state]), [['BEIS-10', 'completed'], ['GDS-15', 'in_progress']]);
    assert.equal(sections[0].score.total.score, 30);
    assert.equal(sections[1].summary.answered, 1);
    assert.equal(notStarted.length, 4);

    const patientTry = await request(app).get(`/api/patients/${p.patient._id}/report`).set('Cookie', p.cookie);
    assert.equal(patientTry.status, 403);
  });
});

describe('ISAA below 70 and SCARED screening wording in the report', () => {
  test('ISAA total below 70: No Autism, disability % null, "Not specified in reference"', async () => {
    const p = await onboard('isaa-low@example.test', []);
    const quizzes = (await request(app).get('/api/me/quizzes').set('Cookie', p.cookie)).body.data.items;
    const { assignmentId } = (await request(app).post(`/api/me/quizzes/${quizzes.find((q) => q.code === 'ISAA').assessmentId}/start`).set('Cookie', p.cookie)).body.data;
    // 40 items × "Rarely" (1) = 40
    await request(app).post(`/api/me/assignments/${assignmentId}/submit`).set('Cookie', p.cookie).send({ answers: Array.from({ length: 40 }, (_, i) => ({ itemId: String(i + 1), value: '1' })) });
    const score = (await request(app).get(`/api/assignments/${assignmentId}/report`).set('Cookie', adminCookie)).body.data.score;
    assert.equal(score.total.score, 40);
    assert.equal(score.total.level.label, 'No Autism');
    assert.deepEqual(score.outputs.map((o) => [o.value, o.label]), [[null, 'Not specified in reference']]);
  });
});

describe('Seeded instrument scoring sync', () => {
  test('an outdated seeded scoring configuration is updated and published as a new version', async () => {
    const { syncSeedInstruments } = await import('../src/seed/seed.js');
    const scared = await Assessment.findOne({ code: 'SCARED-P' });
    const before = scared.currentVersion;
    scared.scoring.total.cutoff = undefined; // simulate an older configuration
    await scared.save();
    const lines = await syncSeedInstruments();
    assert.ok(lines.some((l) => l.startsWith('SCARED-P: scoring configuration updated')));
    const after = await Assessment.findOne({ code: 'SCARED-P' });
    assert.equal(after.currentVersion, before + 1);
    assert.equal(after.scoring.total.cutoff.value, 25);
    assert.ok((await syncSeedInstruments()).every((l) => l.endsWith('up to date')));
  });
});

describe('Audit log', () => {
  test('records who did what to which patient, including failed logins; admin-only and append-only', async () => {
    const { AuditLog } = await import('../src/audit/model/auditLog.model.js');
    const p = await onboard('audited@example.test', []);
    await request(app).post('/api/auth/login').send({ email: 'admin@athma.local', password: 'wrong-password', portal: 'staff' });
    await request(app).get(`/api/patients/${p.patient._id}`).set('Cookie', adminCookie);
    await request(app).get(`/api/patients/${p.patient._id}/report`).set('Cookie', adminCookie);
    await request(app).post(`/api/patients/${p.patient._id}/notes`).set('Cookie', adminCookie).send({ body: 'Called patient.' });
    const quizzes = (await request(app).get('/api/me/quizzes').set('Cookie', p.cookie)).body.data.items;
    const { assignmentId } = (await request(app).post(`/api/me/quizzes/${quizzes.find((q) => q.code === 'BEIS-10').assessmentId}/start`).set('Cookie', p.cookie)).body.data;
    await request(app).post(`/api/me/assignments/${assignmentId}/submit`).set('Cookie', p.cookie).send({ answers: Array.from({ length: 10 }, (_, i) => ({ itemId: String(i + 1), value: '3' })) });
    await new Promise((r) => setTimeout(r, 150)); // audit entries are written after the response finishes

    const res = await request(app).get('/api/audit').query({ patient: String(p.patient._id), limit: 50 }).set('Cookie', adminCookie);
    assert.equal(res.status, 200);
    const actions = res.body.data.items.map((i) => i.action);
    for (const a of ['patient.created', 'auth.invitation_accepted', 'patient.viewed', 'patient.report_printed', 'patient.note_added', 'assessment.started', 'assessment.submitted']) {
      assert.ok(actions.includes(a), `missing ${a}`);
    }
    const note = res.body.data.items.find((i) => i.action === 'patient.note_added');
    assert.equal(note.patientName, 'Test Patient');
    assert.match(note.patientCode, /^ATH-\d{4}$/);
    assert.equal(note.actorRole, 'admin');
    assert.equal(note.actionLabel, 'Added a note to the patient');

    const failed = await request(app).get('/api/audit').query({ action: 'auth.login_failed' }).set('Cookie', adminCookie);
    assert.ok(failed.body.data.items.some((i) => i.actorEmail === 'admin@athma.local' && i.outcome === 'failure'));

    const patientTry = await request(app).get('/api/audit').set('Cookie', p.cookie);
    assert.equal(patientTry.status, 403);

    await assert.rejects(AuditLog.updateOne({}, { action: 'tampered' }));
    await assert.rejects(AuditLog.deleteMany({}));
  });
});
