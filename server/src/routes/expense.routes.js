import { Router } from 'express';
import { uploadAudio, getExpenses, createExpense, updateExpense, deleteExpense } from '../controllers/expense.controller.js';
import { validate, idParams } from '../validators/validate.js';
import { createExpenseSchema, updateExpenseSchema } from '../validators/expense.validator.js';
import { upload } from '../middlewares/upload.middleware.js';

const router = Router();

// POST /api/expenses/upload-audio — audio pipeline → expense
router.post('/upload-audio', upload.single('audio'), uploadAudio);

router.get('/',       getExpenses);
router.post('/',      validate({ body: createExpenseSchema }), createExpense);
router.put('/:id',    validate({ params: idParams, body: updateExpenseSchema }), updateExpense);
router.delete('/:id', validate({ params: idParams }), deleteExpense);

export default router;
