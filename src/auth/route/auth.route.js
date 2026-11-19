import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { authRateLimiter } from '../../middleware/rateLimit.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { body, emailRule, passwordRule, query, tokenRule } from '../../utils/validators.js';
import * as controller from '../controller/auth.controller.js';

const router = Router();

router.post(
  '/login',
  authRateLimiter,
  validate([
    emailRule(),
    body('password').isString().notEmpty().withMessage('Password is required'),
    body('portal').isIn(['staff', 'patient']).withMessage('Invalid portal'),
  ]),
  asyncHandler(controller.login),
);
router.post('/logout', authenticate, asyncHandler(controller.logout));
router.get('/me', authenticate, asyncHandler(controller.me));
router.post('/socket-token', authenticate, asyncHandler(controller.socketToken));

const declarationRule = (field) =>
  body(field)
    .custom((v) => v === true)
    .withMessage('Please confirm the declaration to continue');

router.post(
  '/register',
  authRateLimiter,
  validate([
    body('fullName').isString().trim().isLength({ min: 2, max: 120 }).withMessage('Full name is required'),
    emailRule(),
    body('phone').matches(/^[+\d][\d\s-]{6,18}$/).withMessage('Enter a valid phone number'),
    body('age').notEmpty().withMessage('The age field is required.').bail().isInt({ min: 1, max: 120 }).withMessage('The age must be between 1 and 120.'),
    body('gender').optional().isIn(['female', 'male', 'other', 'prefer_not_to_say', '']),
    body('address').isString().trim().isLength({ min: 3, max: 500 }).withMessage('Full address is required'),
    body(['city', 'state']).isString().trim().isLength({ min: 2, max: 80 }).withMessage('City and state are required'),
    body('pincode').matches(/^\d{6}$/).withMessage('Pincode must be 6 digits'),
    body('location').isString().trim().isLength({ min: 2, max: 120 }).withMessage('Location is required'),
    body('maritalStatus').optional().isIn(['', 'single', 'married', 'divorced', 'widowed', 'separated', 'prefer_not_to_say']),
    body(['education', 'occupation', 'referredBy']).optional().isString().isLength({ max: 120 }),
    passwordRule(),
    declarationRule('declarationAccepted'),
  ]),
  asyncHandler(controller.register),
);

router.get('/invitations/verify', authRateLimiter, validate([tokenRule(query)]), asyncHandler(controller.verifyInvitation));
router.post(
  '/invitations/accept',
  authRateLimiter,
  validate([tokenRule(), passwordRule(), declarationRule('declarationAccepted')]),
  asyncHandler(controller.acceptInvitation),
);

router.post('/password/forgot', authRateLimiter, validate([emailRule()]), asyncHandler(controller.forgotPassword));
router.post('/password/reset', authRateLimiter, validate([tokenRule(), passwordRule()]), asyncHandler(controller.resetPassword));

export default router;
