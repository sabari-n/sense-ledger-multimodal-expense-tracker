import { Router } from 'express';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../controllers/category.controller.js';
import { validateCreateCategory, validateUpdateCategory } from '../validators/category.validator.js';

const router = Router();

router.get('/',       getCategories);
router.post('/',      validateCreateCategory, createCategory);
router.put('/:id',    validateUpdateCategory, updateCategory);
router.delete('/:id', deleteCategory);

export default router;
