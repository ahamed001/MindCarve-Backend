import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { body, idParam } from '../../utils/validators.js';
import { ROLES } from '../../utils/constants.js';
import { REPORT_TYPES } from '../model/report.model.js';
import * as c from '../controller/report.controller.js';
import { audit } from '../../middleware/audit.middleware.js';

// Reports contain identifiable patient data: admins only.
const router = Router();
router.use(authorize(ROLES.ADMIN));

router.get('/', asyncHandler(c.list));
router.post(
  '/',
  validate([body('type').isIn(REPORT_TYPES).withMessage('Unknown report type'), body('month').matches(/^\d{4}-\d{2}$/).withMessage('Month must be YYYY-MM')]),
  audit('report.generated', (req, data) => ({ entityType: 'Report', entityId: data?._id, details: `${data?.title || req.body.type} · ${req.body.month}` })),
  asyncHandler(c.generate),
);
router.get('/:id', validate([idParam()]), asyncHandler(c.detail));
router.get('/:id/download', validate([idParam()]), audit('report.downloaded', (req) => ({ entityType: 'Report', entityId: req.params.id })), asyncHandler(c.download));

export default router;
