import { Router } from 'express';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../controllers/category.controller.js';
import { validate, idParams } from '../validators/validate.js';
import { createCategorySchema, updateCategorySchema, categoryListQuery } from '../validators/category.validator.js';

const router = Router();

router.get('/',       validate({ query: categoryListQuery }), getCategories);
router.post('/',      validate({ body: createCategorySchema }), createCategory);
router.put('/:id',    validate({ params: idParams, body: updateCategorySchema }), updateCategory);
router.delete('/:id', validate({ params: idParams }), deleteCategory);

export default router;
