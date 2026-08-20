import { Router } from 'express';
import expenseRoutes  from './expense.routes.js';
import audioRoutes    from './audio.routes.js';
import accountRoutes  from './account.routes.js';
import categoryRoutes from './category.routes.js';
import telegramRoutes from './telegram.routes.js';
import configRoutes   from './config.routes.js';

const router = Router();

router.use('/expenses',   expenseRoutes);
router.use('/audio',      audioRoutes);
router.use('/accounts',   accountRoutes);
router.use('/categories', categoryRoutes);
router.use('/telegram',   telegramRoutes);
router.use('/config',     configRoutes);

export default router;
