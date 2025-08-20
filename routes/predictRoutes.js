import { Router } from 'express';
import { predictExpenses } from '../controllers/predictController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

// POST /api/predict
router.post('/', predictExpenses);

export default router;
