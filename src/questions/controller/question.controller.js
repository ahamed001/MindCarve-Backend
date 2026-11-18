import { sendSuccess } from '../../utils/response.js';
import { listQuestions } from '../service/question.service.js';

export const list = async (req, res) => sendSuccess(res, { items: await listQuestions(req.params.id) });
