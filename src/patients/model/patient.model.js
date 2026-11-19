import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema(
  {
    patientCode: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true, maxlength: 20 },
    dateOfBirth: { type: Date },
    // Self-registration collects age instead of date of birth (matches the existing Athma form).
    age: { type: Number, min: 0, max: 120 },
    gender: { type: String, enum: ['female', 'male', 'other', 'prefer_not_to_say', ''], default: '' },
    guardianName: { type: String, trim: true, maxlength: 120 },
    relevantInfo: { type: String, trim: true, maxlength: 2000 },
    // Optional demographics (mirrors the existing Athma registration form)
    address: { type: String, trim: true, maxlength: 500 },
    city: { type: String, trim: true, maxlength: 80 },
    state: { type: String, trim: true, maxlength: 80 },
    pincode: { type: String, trim: true, maxlength: 6 },
    location: { type: String, trim: true, maxlength: 120 },
    maritalStatus: { type: String, enum: ['', 'single', 'married', 'divorced', 'widowed', 'separated', 'prefer_not_to_say'], default: '' },
    education: { type: String, trim: true, maxlength: 120 },
    occupation: { type: String, trim: true, maxlength: 120 },
    referredBy: { type: String, trim: true, maxlength: 120 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    declaration: {
      accepted: { type: Boolean, default: false },
      acceptedAt: Date,
    },
    source: { type: String, enum: ['admin', 'self_registration'], default: 'admin' },
    lastActivityAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

patientSchema.index({ fullName: 'text', email: 'text', patientCode: 'text' });

export const Patient = mongoose.model('Patient', patientSchema);
