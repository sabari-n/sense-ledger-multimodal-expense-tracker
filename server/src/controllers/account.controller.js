import * as accountService from '../services/account.service.js';
import { successResponse } from '../utils/response.js';

export const getAccounts = async (req, res, next) => {
  try {
    const accounts = await accountService.getAccountsWithBalance();
    return successResponse(res, accounts);
  } catch (err) {
    next(err);
  }
};

export const createAccount = async (req, res, next) => {
  try {
    const account = await accountService.createAccount(req.body);
    return successResponse(res, account, 'Account created successfully.', 201);
  } catch (err) {
    next(err);
  }
};

export const updateAccount = async (req, res, next) => {
  try {
    const updated = await accountService.updateAccount(req.params.id, req.body);
    return successResponse(res, updated, 'Account updated successfully.');
  } catch (err) {
    next(err);
  }
};

export const deleteAccount = async (req, res, next) => {
  try {
    const result = await accountService.deleteAccount(req.params.id);
    return successResponse(res, null, result.message);
  } catch (err) {
    next(err);
  }
};

export const transferBetweenAccounts = async (req, res, next) => {
  try {
    const result = await accountService.transferBetweenAccounts(req.body);
    return successResponse(res, null, result.message);
  } catch (err) {
    next(err);
  }
};
