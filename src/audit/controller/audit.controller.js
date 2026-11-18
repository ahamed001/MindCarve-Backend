import { sendSuccess } from '../../utils/response.js';
import { listAudit } from '../service/audit.service.js';

export const list = async (req, res) => sendSuccess(res, await listAudit(req.query));
