export const ROLES = Object.freeze({ ADMIN: 'admin', CLINICIAN: 'clinician', PATIENT: 'patient' });
export const STAFF_ROLES = [ROLES.ADMIN, ROLES.CLINICIAN];

export const ASSESSMENT_STATUS = Object.freeze({ DRAFT: 'draft', PUBLISHED: 'published', ARCHIVED: 'archived' });

export const QUESTION_TYPES = Object.freeze([
  'yes_no',
  'single_choice',
  'multiple_choice',
  'rating_scale',
  'frequency_scale',
  'percentage_scale',
  'text',
]);

export const ASSIGNMENT_STATUS = Object.freeze({
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const RISK_LEVELS = Object.freeze(['low', 'moderate', 'high']);

export const AUTH_COOKIE = 'athma_token';
