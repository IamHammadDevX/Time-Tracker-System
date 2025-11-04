import mongoose from 'mongoose';

const WorkSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    isActive: { type: Boolean, default: true },
    idleSeconds: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export const WorkSession = mongoose.models.WorkSession || mongoose.model('WorkSession', WorkSessionSchema);