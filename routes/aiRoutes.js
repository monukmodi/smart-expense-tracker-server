import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { schemas } from '../validators/schemas.js';
import { coach } from '../controllers/coachController.js';
import { scanRecurring } from '../controllers/recurringController.js';

const router = Router();

router.use(requireAuth);

// POST /api/ai/coach
router.post('/coach', validate(schemas.coach, 'body'), coach);

// POST /api/ai/recurring/scan
router.post('/recurring/scan', validate(schemas.recurringScan, 'body'), scanRecurring);

export default router;
