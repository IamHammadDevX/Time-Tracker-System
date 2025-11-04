import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    name: { type: String },
    role: { type: String, enum: ['super_admin', 'manager', 'employee'], required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' }
  },
  { timestamps: true }
);

export const User = mongoose.models.User || mongoose.model('User', UserSchema);