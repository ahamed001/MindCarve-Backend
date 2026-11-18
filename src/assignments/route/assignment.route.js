import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { body, idParam, param, query } from '../../utils/validators.js';
import { ASSIGNMENT_STATUS, ROLES } from '../../utils/constants.js';
import * as c from '../controller/assignment.controller.js';

const router = Router();
const adminOnly = authorize(ROLES.ADMIN);
const staff = authorize(ROLES.ADMIN, ROLES.CLINICIAN);

router.get(
  '/',
  staff,
  validate([
    query('status').optional().isIn(Object.values(ASSIGNMENT_STATUS)),
    query('patient').optional().isMongoId(),
    query('assessment').optional().isMongoId(),
  ]),
  asyncHandler(c.list),
);
router.post(
  '/',
  adminOnly,
  validate([
    body('patientId').isMongoId(),
    body('assessmentIds').isArray({ min: 1 }),
    body('assessmentIds.*').isMongoId(),
    body('dueDate').optional({ values: 'falsy' }).isISO8601(),
  ]),
  asyncHandler(c.create),
);
router.patch('/:id/status', adminOnly, validate([idParam(), body('status').isIn([ASSIGNMENT_STATUS.CANCELLED])]), asyncHandler(c.updateStatus));
router.get(
  '/attempt/:code',
  staff,
  validate([param('code').matches(/^att-\d+-\d+$/i).withMessage('Attempt ID looks like ATT-1-6')]),
  asyncHandler(c.byAttemptCode),
);
router.get('/:id/report', staff, validate([idParam()]), asyncHandler(c.report));
router.get('/:id/submission', staff, validate([idParam()]), asyncHandler(c.submission));

export default router;
