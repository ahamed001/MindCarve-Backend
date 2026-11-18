import mongoose from 'mongoose';

// Stores single-use, expiring tokens for patient invitations and password resets.
// Only the SHA-256 hash of the token is stored; the raw token exists only in the emailed link.
const invitationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
    purpose: { type: String, enum: ['invitation', 'password_reset'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
    revokedAt: Date,
    emailStatus: { type: String, enum: ['pending', 'sent', 'logged_dev', 'failed'], default: 'pending' },
    emailError: String,
    sentAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

invitationSchema.virtual('isUsable').get(function isUsable() {
  return !this.usedAt && !this.revokedAt && this.expiresAt > new Date();
});

export const Invitation = mongoose.model('Invitation', invitationSchema);
