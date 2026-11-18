import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { query } from '../../utils/validators.js';
import { ROLES } from '../../utils/constants.js';
import { ACTIVITY_CATEGORIES } from '../model/activity.model.js';
import * as c from '../controller/activity.controller.js';

const router = Router();

router.get(
  '/',
  authorize(ROLES.ADMIN, ROLES.CLINICIAN),
  validate([
    query('category').optional().isIn(ACTIVITY_CATEGORIES),
    query('patient').optional().isMongoId(),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
  ]),
  asyncHandler(c.list),
);

export default router;
