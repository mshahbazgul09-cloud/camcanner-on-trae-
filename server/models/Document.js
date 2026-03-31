import mongoose from 'mongoose';

const pageSchema = new mongoose.Schema({
  originalUrl: { type: String, required: true },
  processedUrl: { type: String, required: true },
  filter: {
    type: String,
    enum: ['original', 'grayscale', 'bw', 'magic'],
    default: 'original',
  },
  rotation: { type: Number, default: 0 },
  ocrText: { type: String, default: '' },
  ocrConfidence: { type: Number, default: 0 },
});

const documentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    default: 'Scanned Document',
    trim: true,
  },
  pages: [pageSchema],
  thumbnailUrl: { type: String },
  tags: [{ type: String }],
  isFavorite: { type: Boolean, default: false },
}, {
  timestamps: true,
});

// Index for faster queries
documentSchema.index({ userId: 1, createdAt: -1 });

const Document = mongoose.model('Document', documentSchema);

export default Document;
