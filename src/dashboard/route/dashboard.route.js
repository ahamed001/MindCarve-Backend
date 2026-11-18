import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { query } from '../../utils/validators.js';
import { ROLES } from '../../utils/constants.js';
import * as c from '../controller/dashboard.controller.js';

const router = Router();
router.use(authorize(ROLES.ADMIN, ROLES.CLINICIAN));

router.get('/overview', asyncHandler(c.overview));
router.get('/kpis', asyncHandler(c.kpis));
router.get('/assessments-by-day', validate([query('days').optional().isInt({ min: 1, max: 90 })]), asyncHandler(c.byDay));
router.get('/risk-distribution', validate([query('days').optional().isInt({ min: 1, max: 365 })]), asyncHandler(c.risk));
router.get('/latest-activity', validate([query('limit').optional().isInt({ min: 1, max: 50 })]), asyncHandler(c.latestActivity));

export default router;
