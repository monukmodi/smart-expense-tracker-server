import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Models (inline to avoid import path issues)
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);
const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    date: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);
const User = mongoose.model('User', userSchema, 'users');
const Transaction = mongoose.model('Transaction', transactionSchema, 'transactions');

const MONGO_URI = process.env.MONGO_URI;
const PURGE_ALL = String(process.env.SEED_PURGE_ALL || '').toLowerCase() === 'true';
const PURGE_COLLECTIONS = String(process.env.SEED_PURGE_COLLECTIONS || '').toLowerCase() === 'true';
const USER_EMAIL = process.env.SEED_USER_EMAIL || 'monu@test.com';
const USER_NAME = process.env.SEED_USER_NAME || 'Monu';
const USER_PASSWORD = process.env.SEED_USER_PASSWORD || '123456';

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randAmount(min = 5, max = 250) { return Number((Math.random() * (max - min) + min).toFixed(2)); }
function randDateWithin(daysBack = 90) {
  const d = new Date();
  d.setDate(d.getDate() - randInt(0, daysBack));
  d.setHours(randInt(0, 23), randInt(0, 59), randInt(0, 59), 0);
  return d;
}

const expenseCats = ['Food', 'Transport', 'Shopping', 'Health', 'Utilities', 'Entertainment', 'General', 'Other'];
const incomeCats = ['Salary', 'Bonus', 'Refund', 'Interest'];

async function ensureUser() {
  let user = await User.findOne({ email: USER_EMAIL });
  if (!user) {
    const passwordHash = await bcrypt.hash(USER_PASSWORD, 10);
    user = await User.create({ name: USER_NAME, email: USER_EMAIL, passwordHash });
    console.log('Created seed user:', USER_EMAIL);
  } else {
    console.log('Using existing user:', USER_EMAIL);
  }
  return user;
}

function buildDocs(userId, count = 60) {
  const now = new Date();
  return Array.from({ length: count }).map((_, i) => {
    const isIncome = Math.random() < 0.25; // 25% income
    const base = randAmount(5, 250);
    const amount = isIncome ? -base : base; // negative => income in UI
    const category = isIncome
      ? incomeCats[randInt(0, incomeCats.length - 1)]
      : expenseCats[randInt(0, expenseCats.length - 1)];
    const description = `${isIncome ? 'Income' : 'Expense'} seed txn #${i + 1}`;
    const date = randDateWithin(90);

    return { userId, amount, category, description, date, createdAt: now, updatedAt: now };
  });
}

async function main() {
  if (!MONGO_URI) throw new Error('MONGO_URI not set');
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });

  // Optional purge step
  if (PURGE_ALL) {
    const dbName = mongoose.connection.name;
    await mongoose.connection.dropDatabase();
    console.log(`Dropped database: ${dbName}`);
  } else if (PURGE_COLLECTIONS) {
    const txRes = await Transaction.deleteMany({});
    const userRes = await User.deleteOne({ email: USER_EMAIL });
    console.log(`Cleared collections. transactions removed: ${txRes.deletedCount}, user removed: ${userRes.deletedCount}`);
  }

  const user = await ensureUser();
  const docs = buildDocs(user._id, Number(process.env.SEED_TX_COUNT || 60));
  const result = await Transaction.insertMany(docs);
  console.log(`Inserted ${result.length} transactions for ${USER_EMAIL}`);

  const dbName = mongoose.connection.name;
  console.log('Connected DB name:', dbName);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
