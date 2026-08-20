import { Router } from 'express';
import { uploadAudio, getExpenses, createExpense, updateExpense, deleteExpense } from '../controllers/expense.controller.js';
import { validateCreateExpense, validateUpdateExpense } from '../validators/expense.validator.js';
import { upload } from '../middlewares/upload.middleware.js';

const router = Router();

// POST /api/expenses/upload-audio — audio pipeline → expense
router.post('/upload-audio', upload.single('audio'), uploadAudio);

router.get('/',     getExpenses);
router.post('/',    validateCreateExpense, createExpense);
router.put('/:id',  validateUpdateExpense, updateExpense);
router.delete('/:id', deleteExpense);

export default router;
