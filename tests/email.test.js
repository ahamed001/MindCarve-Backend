import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { isUndeliverableAddress, sendEmail } = await import('../src/emails/service/email.service.js');
const { welcomeEmail } = await import('../src/emails/templates/index.js');

test('demo / test addresses are never sent real email', () => {
  for (const a of ['self@example.test', 'demo.patient1@example.test', 'x@example.com', 'admin@athma.local', 'a@foo.test', 'b@localhost']) {
    assert.equal(isUndeliverableAddress(a), true, a);
  }
  for (const a of ['patient@gmail.com', 'someone@athma.in', 'x@examples.com']) {
    assert.equal(isUndeliverableAddress(a), false, a);
  }
});

test('the test environment never sends email', async () => {
  const res = await sendEmail({ to: 'real.person@gmail.com', subject: 's', html: '<p>x</p>', text: 'x' });
  assert.equal(res.status, 'logged_dev');
});

test('welcome email contains Patient ID, login email, password and login link', () => {
  const mail = welcomeEmail({ name: 'Asha', email: 'asha@gmail.com', patientCode: 'ATH-0009', password: 'Secret123', link: 'http://localhost:5173/login?email=asha%40gmail.com' });
  for (const part of ['ATH-0009', 'asha@gmail.com', 'Secret123', 'http://localhost:5173/login?email=asha%40gmail.com']) {
    assert.ok(mail.text.includes(part), `text missing ${part}`);
    assert.ok(mail.html.includes(part.replace('&', '&amp;')), `html missing ${part}`);
  }
});
