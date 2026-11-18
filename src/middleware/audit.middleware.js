import { recordAudit } from '../audit/service/audit.service.js';

/**
 * Route-level audit hook. Records `action` after the response is sent, only when it succeeded (status < 400).
 * `target(req, body)` may return { patientId, assignmentId, patientCode, entityType, entityId, details }.
 */
export const audit = (action, target = () => ({})) => (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.locals.auditBody = body;
    return originalJson(body);
  };
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    let extra = {};
    try {
      extra = target(req, res.locals.auditBody?.data) || {};
    } catch {
      extra = {};
    }
    recordAudit({ req, action, ...extra });
  });
  next();
};
