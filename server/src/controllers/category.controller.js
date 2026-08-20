import * as categoryService from '../services/category.service.js';
import { successResponse } from '../utils/response.js';

export const getCategories = async (req, res, next) => {
  try {
    const categories = await categoryService.getCategories(req.query.type);
    return successResponse(res, categories);
  } catch (err) {
    next(err);
  }
};

export const createCategory = async (req, res, next) => {
  try {
    const category = await categoryService.createCategory(req.body);
    return successResponse(res, category, 'Category created successfully.', 201);
  } catch (err) {
    next(err);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const updated = await categoryService.updateCategory(req.params.id, req.body);
    return successResponse(res, updated, 'Category updated successfully.');
  } catch (err) {
    next(err);
  }
};

export const deleteCategory = async (req, res, next) => {
  try {
    await categoryService.deleteCategory(req.params.id);
    return successResponse(res, null, 'Category deleted successfully.');
  } catch (err) {
    next(err);
  }
};
