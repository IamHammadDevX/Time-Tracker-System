import mongoose from 'mongoose';

export async function connectMongo(uri) {
  if (!uri) {
    console.warn('[db] No MONGO_URI provided. Skipping MongoDB connection.');
    return;
  }
  try {
    await mongoose.connect(uri, { autoIndex: true });
    console.log('[db] Connected to MongoDB');
  } catch (err) {
    console.error('[db] MongoDB connection error:', err.message);
  }
}