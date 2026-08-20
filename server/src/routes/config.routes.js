import { Router } from 'express';
import { env } from '../config/env.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      currencySymbol: env.defaults.currencySymbol,
      defaultAccount: env.defaults.account,
      defaultExpenseCategory: env.defaults.expenseCategory,
      defaultIncomeCategory: env.defaults.incomeCategory,
    },
  });
});

export default router;
