import mongoose from 'mongoose';

const ScreenshotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkSession' },
    filePath: { type: String, required: true },
    capturedAt: { type: Date, required: true },
    meta: { type: Object }
  },
  { timestamps: true }
);

export const Screenshot = mongoose.models.Screenshot || mongoose.model('Screenshot', ScreenshotSchema);