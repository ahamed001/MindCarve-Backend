import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { body, idParam } from '../../utils/validators.js';
import { ROLES } from '../../utils/constants.js';
import * as c from '../controller/response.controller.js';

// Patient-facing routes mounted at /api/me. Patients only.
const router = Router();
router.use(authorize(ROLES.PATIENT));

const answerRules = (required) => [
  (required ? body('answers') : body('answers').optional()).isArray({ max: 500 }).withMessage('Answers must be a list'),
  body('answers.*.itemId').isString().isLength({ min: 1, max: 20 }),
  body('answers.*.value').optional({ values: 'null' }).isString().isLength({ max: 50 }),
  body('answers.*.values').optional().isArray({ max: 50 }),
  body('answers.*.text').optional({ values: 'null' }).isString().isLength({ max: 5000 }),
];

router.get('/profile', asyncHandler(c.profile));
router.get('/quizzes', asyncHandler(c.listQuizzes));
router.post('/quizzes/:assessmentId/start', validate([idParam('assessmentId')]), asyncHandler(c.startQuiz));
router.get('/assignments', asyncHandler(c.listAssignments));
router.get('/assignments/:id', validate([idParam()]), asyncHandler(c.getAssignment));
router.put('/assignments/:id/responses', validate([idParam(), ...answerRules(true)]), asyncHandler(c.saveProgress));
router.post('/assignments/:id/submit', validate([idParam(), ...answerRules(false)]), asyncHandler(c.submit));

export default router;
