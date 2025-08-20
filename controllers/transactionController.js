import Transaction from '../models/Transaction.js';

// Note: In Step 8 we will secure these with JWT and use req.user.userId
// For now, we accept userId from query/body to enable basic functionality during development.

export const getTransactions = async (req, res) => {
  try {
    const userId = req.user?.userId || req.query.userId;
    if (!userId) {
      return res.status(400).json({ message: 'userId is required (temporary until JWT is added in Step 8).' });
    }

    const { from, to, category } = req.query;
    const filter = { userId };

    if (category) filter.category = category;

    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const transactions = await Transaction.find(filter).sort({ date: -1, createdAt: -1 });
    return res.status(200).json({ items: transactions });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch transactions.', error: error.message });
  }
};

export const createTransaction = async (req, res) => {
  try {
    const userId = req.user?.userId || req.body.userId;
    const { amount, category, description = '', date } = req.body || {};

    if (!userId || amount == null || !category) {
      return res.status(400).json({ message: 'userId, amount, and category are required.' });
    }

    if (Number.isNaN(Number(amount))) {
      return res.status(400).json({ message: 'amount must be a valid number.' });
    }

    const tx = await Transaction.create({
      userId,
      amount: Number(amount),
      category: String(category).trim(),
      description: String(description || '').trim(),
      date: date ? new Date(date) : undefined,
    });

    return res.status(201).json({ item: tx });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create transaction.', error: error.message });
  }
};

export const updateTransaction = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user?.userId || req.body.userId; // temporary until JWT

    if (!id) {
      return res.status(400).json({ message: 'Transaction id is required in the path.' });
    }

    // Optional: restrict updates to owner once JWT is added (using userId from token)
    const updates = {};
    const allowed = ['amount', 'category', 'description', 'date'];
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key];
    }

    if ('amount' in updates) {
      if (Number.isNaN(Number(updates.amount))) {
        return res.status(400).json({ message: 'amount must be a valid number.' });
      }
      updates.amount = Number(updates.amount);
    }

    if ('category' in updates) updates.category = String(updates.category).trim();
    if ('description' in updates) updates.description = String(updates.description || '').trim();
    if ('date' in updates) updates.date = updates.date ? new Date(updates.date) : undefined;

    const query = { _id: id };
    // When JWT is added, uncomment the next line to enforce ownership
    if (userId) query.userId = userId;

    const updated = await Transaction.findOneAndUpdate(query, updates, { new: true });

    if (!updated) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    return res.status(200).json({ item: updated });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update transaction.', error: error.message });
  }
};

export const deleteTransaction = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user?.userId || req.body.userId; // temporary until JWT

    if (!id) {
      return res.status(400).json({ message: 'Transaction id is required in the path.' });
    }

    const query = { _id: id };
    if (userId) query.userId = userId;

    const deleted = await Transaction.findOneAndDelete(query);

    if (!deleted) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    return res.status(200).json({ item: deleted });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete transaction.', error: error.message });
  }
};
