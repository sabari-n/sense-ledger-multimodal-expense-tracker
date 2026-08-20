import * as categoryRepo from '../repositories/category.repository.js';
import { AppError } from '../errors/AppError.js';
import { NOT_FOUND, VALIDATION_ERROR } from '../errors/errorCodes.js';

export async function getCategories(type) {
  const where = type ? { transaction_type: type } : {};
  return categoryRepo.findAll(where);
}

export async function createCategory(data) {
  const { name, emoji, transaction_type, subcategories } = data;
  if (!name) throw new AppError('Category name is required.', VALIDATION_ERROR.status, VALIDATION_ERROR.code);

  return categoryRepo.create({
    name,
    emoji:            emoji            || '📋',
    transaction_type: transaction_type || 'expense',
    subcategories:    subcategories    || [],
    is_system:        false,
  });
}

export async function updateCategory(id, data) {
  const existing = await categoryRepo.findById(id);
  if (!existing) throw new AppError('Category not found.', NOT_FOUND.status, NOT_FOUND.code);

  const { name, emoji, subcategories } = data;
  return categoryRepo.update(id, {
    name:          name          ?? existing.name,
    emoji:         emoji         ?? existing.emoji,
    subcategories: subcategories ?? existing.subcategories,
  });
}

export async function deleteCategory(id) {
  const existing = await categoryRepo.findById(id);
  if (!existing) throw new AppError('Category not found.', NOT_FOUND.status, NOT_FOUND.code);

  await categoryRepo.destroyById(id);
}
