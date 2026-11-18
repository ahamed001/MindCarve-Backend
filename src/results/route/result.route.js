import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { body, idParam } from '../../utils/validators.js';
import { ROLES } from '../../utils/constants.js';
import * as c from '../controller/result.controller.js';
import { audit } from '../../middleware/audit.middleware.js';

const router = Router();
router.use(authorize(ROLES.ADMIN, ROLES.CLINICIAN));

router.get('/assignment/:assignmentId', validate([idParam('assignmentId')]), asyncHandler(c.byAssignment));
router.get('/assignment/:assignmentId/subscales', validate([idParam('assignmentId')]), asyncHandler(c.subscales));
router.post('/assignment/:assignmentId/calculate', validate([idParam('assignmentId')]), asyncHandler(c.calculate));
router.patch(
  '/:id/review',
  validate([idParam(), body('reviewStatus').isIn(['flagged', 'reviewed'])]),
  audit('result.review_updated', (req, data) => ({ patientId: data?.patient, details: `Review → ${req.body.reviewStatus}` })),
  asyncHandler(c.review),
);

export default router;
