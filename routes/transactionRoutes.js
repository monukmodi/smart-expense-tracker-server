import { Router } from 'express';
import { getTransactions, createTransaction, updateTransaction, deleteTransaction } from '../controllers/transactionController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { schemas } from '../validators/schemas.js';

const router = Router();

// Protect all routes under /api/transactions
router.use(requireAuth);

// GET /api/transactions?userId=...&from=...&to=...&category=...
router.get('/', validate(schemas.txQuery, 'query'), getTransactions);

// POST /api/transactions
router.post('/', validate(schemas.txCreate, 'body'), createTransaction);

// PUT /api/transactions/:id
router.put('/:id', validate(schemas.txUpdate, 'body'), updateTransaction);

// DELETE /api/transactions/:id
router.delete('/:id', deleteTransaction);

export default router;
