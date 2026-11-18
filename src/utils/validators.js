import { body, param, query } from 'express-validator';

export const passwordRule = (field = 'password') =>
  body(field)
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8–128 characters')
    .matches(/[A-Za-z]/)
    .withMessage('Password must contain a letter')
    .matches(/\d/)
    .withMessage('Password must contain a number');

export const emailRule = (field = 'email') => body(field).isEmail().withMessage('A valid email is required').normalizeEmail({ gmail_remove_dots: false });

export const idParam = (name = 'id') => param(name).isMongoId().withMessage(`Invalid ${name}`);

export const tokenRule = (location = body) => location('token').isString().isLength({ min: 32, max: 128 }).withMessage('Invalid token');

export { body, param, query };
