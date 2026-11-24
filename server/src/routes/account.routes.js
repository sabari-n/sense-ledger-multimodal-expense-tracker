import { Router } from 'express';
import { getAccounts, createAccount, updateAccount, deleteAccount, transferBetweenAccounts } from '../controllers/account.controller.js';
import { validate, idParams } from '../validators/validate.js';
import { createAccountSchema, updateAccountSchema, transferSchema } from '../validators/account.validator.js';

const router = Router();

router.get('/',          getAccounts);
router.post('/',         validate({ body: createAccountSchema }), createAccount);
router.put('/:id',       validate({ params: idParams, body: updateAccountSchema }), updateAccount);
router.delete('/:id',    validate({ params: idParams }), deleteAccount);
router.post('/transfer', validate({ body: transferSchema }), transferBetweenAccounts);

export default router;
