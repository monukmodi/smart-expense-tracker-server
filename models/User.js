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
    // Email verification fields
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationCode: {
      type: String,
    },
    verificationExpires: {
      type: Date,
    },
    // OAuth support (for future Google login)
    provider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
    oauthId: {
      type: String,
    },
  },
  { timestamps: true }
);

// Unique index for email is defined via the field option `unique: true`

const User = mongoose.model('User', userSchema);

export default User;


