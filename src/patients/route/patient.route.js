import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { body, emailRule, idParam, query } from '../../utils/validators.js';
import { ROLES } from '../../utils/constants.js';
import * as c from '../controller/patient.controller.js';

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

const profileRules = (optional) => [
  (optional ? body('fullName').optional() : body('fullName')).isString().trim().isLength({ min: 2, max: 120 }).withMessage('Full name is required (2–120 characters)'),
  body('phone').optional({ values: 'falsy' }).matches(/^[+\d][\d\s-]{6,18}$/).withMessage('Enter a valid phone number'),
  dobRule(true),
  body('age').optional({ values: 'falsy' }).isInt({ min: 0, max: 120 }).withMessage('Age must be 0–120'),
  body('gender').optional().isIn(['female', 'male', 'other', 'prefer_not_to_say', '']).withMessage('Invalid gender'),
  body('guardianName').optional().isString().isLength({ max: 120 }),
  body('relevantInfo').optional().isString().isLength({ max: 2000 }),
  body('address').optional().isString().isLength({ max: 500 }),
  body(['city', 'state']).optional().isString().isLength({ max: 80 }),
  body('pincode').optional({ values: 'falsy' }).matches(/^\d{6}$/).withMessage('Pincode must be 6 digits'),
  body(['location', 'education', 'occupation', 'referredBy']).optional().isString().isLength({ max: 120 }),
  body('maritalStatus').optional().isIn(['', 'single', 'married', 'divorced', 'widowed', 'separated', 'prefer_not_to_say']),
];

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
    body('phone').notEmpty().withMessage('Phone number is required'),
    body('assessmentIds').optional().isArray(),
    body('assessmentIds.*').isMongoId(),
    body('dueDate').optional({ values: 'falsy' }).isISO8601(),
  ]),
  asyncHandler(c.create),
);
router.get('/:id', staff, validate([idParam()]), asyncHandler(c.detail));
router.put('/:id', adminOnly, validate([idParam(), ...profileRules(true), body('email').optional().isEmail()]), asyncHandler(c.update));
router.patch('/:id/status', adminOnly, validate([idParam(), body('status').isIn(['active', 'inactive'])]), asyncHandler(c.setStatus));
router.post('/:id/invitation/resend', adminOnly, validate([idParam()]), asyncHandler(c.resendInvitation));
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
router.get('/:id/results', staff, validate([idParam()]), asyncHandler(c.results));
router.get('/:id/notes', staff, validate([idParam()]), asyncHandler(c.notes));
router.post(
  '/:id/notes',
  staff,
  validate([idParam(), body('body').isString().trim().isLength({ min: 1, max: 5000 }).withMessage('Note cannot be empty'), body('assignment').optional().isMongoId()]),
  asyncHandler(c.createNote),
);

export default router;
