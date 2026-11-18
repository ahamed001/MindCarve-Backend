import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { query } from '../../utils/validators.js';
import { ROLES } from '../../utils/constants.js';
import * as c from '../controller/audit.controller.js';

// The audit trail is admin-only.
const router = Router();
router.get(
  '/',
  authorize(ROLES.ADMIN),
  validate([
    query('outcome').optional().isIn(['success', 'failure']),
    query('patient').optional().isMongoId(),
    query('search').optional().isString().isLength({ max: 100 }),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
  ]),
  asyncHandler(c.list),
);

export default router;
