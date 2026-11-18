import { validationResult } from 'express-validator';
import { ApiError } from '../utils/ApiError.js';

export const validate = (rules) => [
  ...rules,
  (req, res, next) => {
    const result = validationResult(req);
    if (result.isEmpty()) return next();
    const errors = result.array().map((e) => ({ field: e.path, message: e.msg }));
    return next(ApiError.badRequest(errors[0]?.message || 'Validation failed', errors));
  },
];
