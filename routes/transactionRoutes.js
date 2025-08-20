import { Router } from 'express';
import { getTransactions, createTransaction, updateTransaction, deleteTransaction } from '../controllers/transactionController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Protect all routes under /api/transactions
router.use(requireAuth);

// GET /api/transactions?userId=...&from=...&to=...&category=...
router.get('/', getTransactions);

// POST /api/transactions
router.post('/', createTransaction);

// PUT /api/transactions/:id
router.put('/:id', updateTransaction);

// DELETE /api/transactions/:id
router.delete('/:id', deleteTransaction);

export default router;
