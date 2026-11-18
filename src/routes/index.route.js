import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import authRoutes from '../auth/route/auth.route.js';
import patientRoutes from '../patients/route/patient.route.js';
import assessmentRoutes from '../assessments/route/assessment.route.js';
import assignmentRoutes from '../assignments/route/assignment.route.js';
import resultRoutes from '../results/route/result.route.js';
import responseRoutes from '../responses/route/response.route.js';
import dashboardRoutes from '../dashboard/route/dashboard.route.js';
import reportRoutes from '../reports/route/report.route.js';
import activityRoutes from '../activity/route/activity.route.js';

const router = Router();

router.get('/health', (req, res) => res.json({ success: true, message: 'OK', data: { time: new Date().toISOString() } }));
router.use('/auth', authRoutes);

// Everything below requires an authenticated session; each router enforces roles.
router.use('/patients', authenticate, patientRoutes);
router.use('/assessments', authenticate, assessmentRoutes);
router.use('/assignments', authenticate, assignmentRoutes);
router.use('/results', authenticate, resultRoutes);
router.use('/me', authenticate, responseRoutes);
router.use('/dashboard', authenticate, dashboardRoutes);
router.use('/reports', authenticate, reportRoutes);
router.use('/activity', authenticate, activityRoutes);

export default router;
