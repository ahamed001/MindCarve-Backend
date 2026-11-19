import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { body, emailRule, idParam, query } from '../../utils/validators.js';
import { ROLES } from '../../utils/constants.js';
import * as c from '../controller/patient.controller.js';
import { audit } from '../../middleware/audit.middleware.js';

const byParam = (req) => ({ patientId: req.params.id });

const router = Router();
const adminOnly = authorize(ROLES.ADMIN);
const staff = authorize(ROLES.ADMIN, ROLES.CLINICIAN);

const dobRule = (optional) => {
  const chain = body('dateOfBirth');
  return (optional ? chain.optional({ values: 'falsy' }) : chain)
    .isISO8601()
    .withMessage('Date of birth must be a valid date')
    .custom((v) => new Date(v) < new Date())
    .withMessage('Date of birth must be in the past');
};

// Staff registration requires the same fields as the patient's own Register page.
// When editing (optional = true) a field may be left out, but a sent value must still be valid (not blank).
const profileRules = (optional) => {
  const field = (name) => (optional ? body(name).optional() : body(name));
  return [
    field('fullName').isString().trim().isLength({ min: 2, max: 120 }).withMessage('Full name is required (2–120 characters)'),
    field('phone').matches(/^[+\d][\d\s-]{6,18}$/).withMessage('Enter a valid phone number'),
    dobRule(true),
    field('age').isInt({ min: 1, max: 120 }).withMessage('Age is required (1–120)'),
    body('gender').optional().isIn(['female', 'male', 'other', 'prefer_not_to_say', '']).withMessage('Invalid gender'),
    body('guardianName').optional().isString().isLength({ max: 120 }),
    body('relevantInfo').optional().isString().isLength({ max: 2000 }),
    field('address').isString().trim().isLength({ min: 3, max: 500 }).withMessage('Full address is required'),
    field('city').isString().trim().isLength({ min: 2, max: 80 }).withMessage('City is required'),
    field('state').isString().trim().isLength({ min: 2, max: 80 }).withMessage('State is required'),
    field('pincode').matches(/^\d{6}$/).withMessage('Pincode must be 6 digits'),
    field('location').isString().trim().isLength({ min: 2, max: 120 }).withMessage('Location is required'),
    body(['education', 'occupation', 'referredBy']).optional().isString().isLength({ max: 120 }),
    body('maritalStatus').optional().isIn(['', 'single', 'married', 'divorced', 'widowed', 'separated', 'prefer_not_to_say']),
  ];
};

router.get(
  '/',
  staff,
  validate([
    query('status').optional().isIn(['active', 'inactive']),
    query('completion').optional().isIn(['pending', 'completed', 'none']),
    query('declaration').optional().isIn(['signed', 'pending']),
    query('search').optional().isString().isLength({ max: 100 }),
  ]),
  asyncHandler(c.list),
);
router.post(
  '/',
  adminOnly,
  validate([
    ...profileRules(false),
    emailRule(),
    body('assessmentIds').optional().isArray(),
    body('assessmentIds.*').isMongoId(),
    body('dueDate').optional({ values: 'falsy' }).isISO8601(),
  ]),
  audit('patient.created', (req, data) => ({ patientId: data?.patient?._id })),
  asyncHandler(c.create),
);
router.get('/:id', staff, validate([idParam()]), audit('patient.viewed', byParam), asyncHandler(c.detail));
router.put('/:id', adminOnly, validate([idParam(), ...profileRules(true), body('email').optional().isEmail()]), audit('patient.updated', byParam), asyncHandler(c.update));
router.patch('/:id/status', adminOnly, validate([idParam(), body('status').isIn(['active', 'inactive'])]), audit('patient.status_changed', (req) => ({ patientId: req.params.id, details: `Status → ${req.body.status}` })), asyncHandler(c.setStatus));
router.post('/:id/invitation/resend', adminOnly, validate([idParam()]), audit('patient.invitation_resent', byParam), asyncHandler(c.resendInvitation));
router.get('/:id/assignments', staff, validate([idParam()]), asyncHandler(c.assignments));
router.post(
  '/:id/assignments',
  adminOnly,
  validate([
    idParam(),
    body('assessmentIds').isArray({ min: 1 }).withMessage('Select at least one assessment'),
    body('assessmentIds.*').isMongoId(),
    body('dueDate').optional({ values: 'falsy' }).isISO8601(),
    body('note').optional().isString().isLength({ max: 500 }),
  ]),
  asyncHandler(c.assign),
);
router.get('/:id/report', staff, validate([idParam()]), audit('patient.report_printed', byParam), asyncHandler(c.report));
router.get('/:id/results', staff, validate([idParam()]), asyncHandler(c.results));
router.get('/:id/notes', staff, validate([idParam()]), asyncHandler(c.notes));
router.post(
  '/:id/notes',
  staff,
  validate([idParam(), body('body').isString().trim().isLength({ min: 1, max: 5000 }).withMessage('Note cannot be empty'), body('assignment').optional().isMongoId()]),
  audit('patient.note_added', (req, data) => ({ patientId: req.params.id, entityType: 'ClinicianNote', entityId: data?._id })),
  asyncHandler(c.createNote),
);

export default router;
