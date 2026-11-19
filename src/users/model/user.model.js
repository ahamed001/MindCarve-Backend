import mongoose from 'mongoose';
import { ROLES } from '../../utils/constants.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: Object.values(ROLES), required: true, index: true },
    status: { type: String, enum: ['invited', 'active', 'disabled'], default: 'invited', index: true },
    // Incremented on logout/password change to invalidate all issued JWTs for this user.
    tokenVersion: { type: Number, default: 0, select: false },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    status: this.status,
    patient: this.patient || null,
    lastLoginAt: this.lastLoginAt,
  };
};

export const User = mongoose.model('User', userSchema);
