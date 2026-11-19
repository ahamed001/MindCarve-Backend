import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authorize } from '../../middleware/role.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { body, idParam, query } from '../../utils/validators.js';
import { ASSESSMENT_STATUS, QUESTION_TYPES, ROLES } from '../../utils/constants.js';
import * as c from '../controller/assessment.controller.js';
import * as q from '../../questions/controller/question.controller.js';

// Editing (details and questions) changes the draft only; Publish creates the next version for patients.
const router = Router();
const adminOnly = authorize(ROLES.ADMIN);
const staff = authorize(ROLES.ADMIN, ROLES.CLINICIAN);

const detailRules = (creating) => [
  (creating ? body('name') : body('name').optional()).isString().trim().isLength({ min: 2, max: 200 }).withMessage('Name is required (2–200 characters)'),
  body('category').optional().isString().isLength({ max: 80 }),
  body('description').optional().isString().isLength({ max: 2000 }),
  body('instructions').optional().isString().isLength({ max: 5000 }),
  body('respondent').optional().isString().isLength({ max: 200 }),
  body('timeframe').optional().isString().isLength({ max: 200 }),
  body('primaryQuestionType').optional().isIn(QUESTION_TYPES),
];

const questionRules = (creating) => [
  (creating ? body('text') : body('text').optional()).isString().trim().isLength({ min: 1, max: 1000 }).withMessage('Question text is required'),
  (creating ? body('type') : body('type').optional()).isIn(QUESTION_TYPES).withMessage('Choose a valid question type'),
  body('options').optional().isArray({ max: 20 }),
  body('options.*.label').optional().isString().isLength({ max: 300 }),
  body('options.*.value').optional().isString().isLength({ max: 50 }),
  body('helpText').optional().isString().isLength({ max: 500 }),
  body('required').optional().isBoolean(),
  body('reverseScored').optional().isBoolean(),
  body('excludedFromScoring').optional().isBoolean(),
  body('sensitive').optional().isBoolean(),
];

router.get('/', staff, validate([query('status').optional().isIn([...Object.values(ASSESSMENT_STATUS), 'inactive'])]), asyncHandler(c.list));
router.post(
  '/',
  adminOnly,
  validate([...detailRules(true), body('code').isString().trim().matches(/^[A-Za-z0-9-]{2,20}$/).withMessage('Code must be 2–20 letters, numbers or dashes')]),
  asyncHandler(c.create),
);
router.get('/versions/:versionId', staff, validate([idParam('versionId')]), asyncHandler(c.version));
router.get('/:id', staff, validate([idParam()]), asyncHandler(c.detail));
router.put('/:id', adminOnly, validate([idParam(), ...detailRules(false)]), asyncHandler(c.update));
router.post('/:id/publish', adminOnly, validate([idParam()]), asyncHandler(c.publish));
router.post('/:id/archive', adminOnly, validate([idParam()]), asyncHandler(c.archive));
router.post('/:id/restore', adminOnly, validate([idParam()]), asyncHandler(c.restore));

router.get('/:id/questions', staff, validate([idParam()]), asyncHandler(q.list));
router.post('/:id/questions', adminOnly, validate([idParam(), ...questionRules(true)]), asyncHandler(q.add));
router.put('/:id/questions/reorder', adminOnly, validate([idParam(), body('orderedIds').isArray({ min: 1 }), body('orderedIds.*').isMongoId()]), asyncHandler(q.reorder));
router.put('/questions/:questionId', adminOnly, validate([idParam('questionId'), ...questionRules(false)]), asyncHandler(q.update));
router.delete('/questions/:questionId', adminOnly, validate([idParam('questionId')]), asyncHandler(q.remove));

export default router;
