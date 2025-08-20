import Transaction from '../models/Transaction.js';

export const getTransactions = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const { from, to, category, limit = 20, offset = 0 } = req.query;
    const filter = { userId };

    if (category) filter.category = category;

    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const [items, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(Number(offset))
        .limit(Number(limit)),
      Transaction.countDocuments(filter),
    ]);

    const nextOffset = Number(offset) + Number(limit);
    const hasMore = nextOffset < total;

    return res.status(200).json({
      items,
      meta: {
        total,
        limit: Number(limit),
        offset: Number(offset),
        hasMore,
        nextOffset: hasMore ? nextOffset : null,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const createTransaction = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const { amount, category, description = '', date } = req.body || {};

    if (amount == null || !category) {
      return res.status(400).json({ message: 'amount and category are required.' });
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
    return next(error);
  }
};

export const updateTransaction = async (req, res, next) => {
  try {
    const id = req.params.id;
    const userId = req.user?.userId;

    if (!id) {
      return res.status(400).json({ message: 'Transaction id is required in the path.' });
    }

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

    const query = { _id: id, userId };

    const updated = await Transaction.findOneAndUpdate(query, updates, { new: true });

    if (!updated) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    return res.status(200).json({ item: updated });
  } catch (error) {
    return next(error);
  }
};

export const deleteTransaction = async (req, res, next) => {
  try {
    const id = req.params.id;
    const userId = req.user?.userId;

    if (!id) {
      return res.status(400).json({ message: 'Transaction id is required in the path.' });
    }

    const query = { _id: id, userId };

    const deleted = await Transaction.findOneAndDelete(query);

    if (!deleted) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    return res.status(200).json({ item: deleted });
  } catch (error) {
    return next(error);
  }
};
