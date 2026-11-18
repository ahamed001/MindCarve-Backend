import { Question } from '../../assessments/model/question.model.js';

// Question editing (add / update / delete / reorder / sections) was removed for now.
// Questions are seeded from the reference documents and published as version 1.
export const listQuestions = (assessmentId) => Question.find({ assessment: assessmentId }).sort({ order: 1 }).lean();
