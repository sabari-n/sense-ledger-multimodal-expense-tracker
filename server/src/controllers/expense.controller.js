import fs from 'fs';
import * as expenseService from '../services/expense.service.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { logger } from '../config/logger.js';

// POST /api/expenses/upload-audio — audio → Whisper → LLM → save
export const uploadAudio = async (req, res, next) => {
  const audioPath = req.file?.path;
  if (!audioPath) return errorResponse(res, 'No audio file uploaded.', 400);

  try {
    logger.info(`Received audio file: ${audioPath}`);
    const expense = await expenseService.processAudioExpense(audioPath);
    return successResponse(res, expense, 'Expense recorded successfully!');
  } catch (err) {
    next(err);
  } finally {
    if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  }
};

export const getExpenses = async (req, res, next) => {
  try {
    const expenses = await expenseService.getExpenses();
    return successResponse(res, expenses);
  } catch (err) {
    next(err);
  }
};

export const createExpense = async (req, res, next) => {
  try {
    const expense = await expenseService.createExpense(req.body);
    return successResponse(res, expense, 'Transaction added successfully.', 201);
  } catch (err) {
    next(err);
  }
};

export const updateExpense = async (req, res, next) => {
  try {
    const updated = await expenseService.updateExpense(req.params.id, req.body);
    return successResponse(res, updated, 'Transaction updated successfully.');
  } catch (err) {
    next(err);
  }
};

export const deleteExpense = async (req, res, next) => {
  try {
    await expenseService.deleteExpense(req.params.id);
    return successResponse(res, null, 'Transaction deleted successfully.');
  } catch (err) {
    next(err);
  }
};
