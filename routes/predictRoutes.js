import { Router } from 'express';
import { predictExpenses } from '../controllers/predictController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { schemas } from '../validators/schemas.js';

const router = Router();

router.use(requireAuth);

// POST /api/predict
router.post('/', validate(schemas.predict, 'body'), predictExpenses);

export default router;
