import { sendSuccess } from '../../utils/response.js';
import { listActivity } from '../service/activity.service.js';

export const list = async (req, res) => sendSuccess(res, await listActivity(req.query));
