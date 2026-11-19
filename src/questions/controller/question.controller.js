import { sendSuccess } from '../../utils/response.js';
import * as service from '../service/question.service.js';

export const list = async (req, res) => sendSuccess(res, { items: await service.listQuestions(req.params.id) });
export const add = async (req, res) => sendSuccess(res, await service.addQuestion(req.params.id, req.body, req.user), 'Question added', 201);
export const update = async (req, res) => sendSuccess(res, await service.updateQuestion(req.params.questionId, req.body, req.user), 'Question saved');
export const remove = async (req, res) => sendSuccess(res, { items: await service.deleteQuestion(req.params.questionId, req.user) }, 'Question deleted');
export const reorder = async (req, res) => sendSuccess(res, { items: await service.reorderQuestions(req.params.id, req.body.orderedIds, req.user) }, 'Order saved');
