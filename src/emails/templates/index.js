import { renderLayout } from './layout.js';

export const invitationEmail = ({ name, link, expiresHours }) => ({
  subject: 'Set up your Athma Mind Care patient account',
  text: `Hello ${name},\n\nAthma Mind Care Hospital has created a patient account for you so you can complete your assigned assessments online.\n\nSet your password here (link expires in ${expiresHours} hours):\n${link}\n\nAfter setting your password, sign in with this email address.\n\nIf you were not expecting this email, please contact the hospital.`,
  html: renderLayout({
    heading: `Welcome, ${name}`,
    paragraphs: [
      'Athma Mind Care Hospital has created a patient account for you so you can complete your assigned assessments online.',
      `Use the button below to choose your own password. For your security this link can be used once and expires in ${expiresHours} hours.`,
      'After setting your password, sign in to the patient portal with this email address.',
    ],
    ctaLabel: 'Set up my account',
    ctaUrl: link,
    footnote: 'If you were not expecting this email, please contact the hospital. We will never ask you for your password by email.',
  }),
});

// Sent after self-registration. Contains the sign-in identity and a login link — never the password.
export const welcomeEmail = ({ name, email, patientCode, link }) => ({
  subject: 'Your Athma Mind Care account is ready',
  text: `Hello ${name},\n\nThank you for registering with Athma Mind Care Hospital.\n\nYour login details:\n  Patient ID: ${patientCode}\n  Login email: ${email}\n  Password: the password you chose during registration\n\nSign in here: ${link}\n\nFor your security we never send passwords by email. If you forget it, use "Forgot password" on the sign-in page.\n\nIf you did not create this account, please contact the hospital.`,
  html: renderLayout({
    heading: `Welcome to Athma, ${name}`,
    paragraphs: [
      'Thank you for registering with Athma Mind Care Hospital. Your patient account is ready.',
      `Patient ID: ${patientCode}`,
      `Login email: ${email}`,
      'Password: the password you chose during registration. For your security we never send passwords by email — if you forget it, use “Forgot password” on the sign-in page.',
    ],
    ctaLabel: 'Log in to Athma',
    ctaUrl: link,
    footnote: 'If you did not create this account, please contact the hospital.',
  }),
});

export const passwordResetEmail = ({ name, link, expiresMinutes }) => ({
  subject: 'Reset your Athma Mind Care password',
  text: `Hello ${name},\n\nWe received a request to reset your password. Use this link within ${expiresMinutes} minutes:\n${link}\n\nIf you did not request this, you can ignore this email.`,
  html: renderLayout({
    heading: 'Reset your password',
    paragraphs: [
      `Hello ${name}, we received a request to reset your password.`,
      `This link can be used once and expires in ${expiresMinutes} minutes.`,
    ],
    ctaLabel: 'Choose a new password',
    ctaUrl: link,
    footnote: 'If you did not request this, you can safely ignore this email.',
  }),
});
