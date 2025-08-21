import Transaction from '../models/Transaction.js';

export const getTransactions = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const q = req.query || {};

    // Filters
    const filter = { userId };
    if (q.category) filter.category = String(q.category);

    // Date range (ISO strings expected, but guard against invalid)
    const from = q.from ? new Date(q.from) : null;
    const to = q.to ? new Date(q.to) : null;
    if ((from && !isNaN(from)) || (to && !isNaN(to))) {
      filter.date = {};
      if (from && !isNaN(from)) filter.date.$gte = from;
      if (to && !isNaN(to)) filter.date.$lte = to;
    }

    // Pagination: support page/size and limit/offset
    let size = Number(q.size);
    let limit = Number(q.limit);
    let page = Number(q.page);
    let offset = Number(q.offset);

    let effectiveLimit = Number.isFinite(size) && size > 0 ? Math.floor(size) : undefined;
    if (effectiveLimit == null) effectiveLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20;
    effectiveLimit = Math.min(100, Math.max(1, effectiveLimit));

    let effectivePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : undefined;
    let effectiveOffset;
    if (effectivePage != null) {
      effectiveOffset = (effectivePage - 1) * effectiveLimit;
    } else {
      effectiveOffset = Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;
      effectivePage = Math.floor(effectiveOffset / effectiveLimit) + 1;
    }

    const [items, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(effectiveOffset)
        .limit(effectiveLimit),
      Transaction.countDocuments(filter),
    ]);

    const nextOffset = effectiveOffset + effectiveLimit;
    const hasMore = nextOffset < total;
    const hasPrevious = effectiveOffset > 0;
    const prevOffset = hasPrevious ? Math.max(0, effectiveOffset - effectiveLimit) : null;

    return res.status(200).json({
      items,
      meta: {
        total,
        limit: effectiveLimit,
        offset: effectiveOffset,
        page: effectivePage,
        size: effectiveLimit,
        hasMore,
        hasPrevious,
        nextOffset: hasMore ? nextOffset : null,
        prevOffset,
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
