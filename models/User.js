import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

// Unique index for email is defined via the field option `unique: true`

const User = mongoose.model('User', userSchema);

export default User;


