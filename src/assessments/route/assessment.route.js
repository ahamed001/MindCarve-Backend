import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { idParam, query } from '../../utils/validators.js';
import { ASSESSMENT_STATUS, ROLES } from '../../utils/constants.js';
import * as c from '../controller/assessment.controller.js';
import * as q from '../../questions/controller/question.controller.js';

// Assessments are read-only through the API for now (creating, editing, publishing and archiving were removed).
// The seed publishes version 1 of each instrument internally.
const router = Router();
const staff = authorize(ROLES.ADMIN, ROLES.CLINICIAN);

router.get(
  '/',
  staff,
  validate([query('status').optional().isIn([...Object.values(ASSESSMENT_STATUS), 'inactive'])]),
  asyncHandler(c.list),
);
router.get('/versions/:versionId', staff, validate([idParam('versionId')]), asyncHandler(c.version));
router.get('/:id', staff, validate([idParam()]), asyncHandler(c.detail));
router.get('/:id/questions', staff, validate([idParam()]), asyncHandler(q.list));

export default router;
