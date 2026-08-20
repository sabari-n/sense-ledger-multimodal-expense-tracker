import { Router } from 'express';
import { getAccounts, createAccount, updateAccount, deleteAccount, transferBetweenAccounts } from '../controllers/account.controller.js';
import { validateCreateAccount, validateUpdateAccount, validateTransfer } from '../validators/account.validator.js';

const router = Router();

router.get('/',          getAccounts);
router.post('/',         validateCreateAccount, createAccount);
router.put('/:id',       validateUpdateAccount, updateAccount);
router.delete('/:id',    deleteAccount);
router.post('/transfer', validateTransfer, transferBetweenAccounts);

export default router;
