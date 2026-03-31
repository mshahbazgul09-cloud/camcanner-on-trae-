import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createWorker } from 'tesseract.js';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import connectDB from './db.js';
import User from './models/User.js';
import Document from './models/Document.js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const SECRET_KEY = process.env.JWT_SECRET || 'super-secret-key-change-in-prod';

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

// Auth Middleware
const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Multer Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// --- ROUTES ---

// Root route
app.get('/', (req, res) => {
  res.json({ 
    name: 'CamScannerX API Server',
    status: 'running',
    version: '1.0.0',
    database: 'MongoDB',
    endpoints: ['/api/health', '/api/auth/*', '/api/upload', '/api/ocr', '/api/files', '/api/pdf/*', '/api/documents/*']
  });
});

// 1. Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'MongoDB', timestamp: new Date() });
});

// ========================
//   AUTH ROUTES (MongoDB)
// ========================

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);
    const newUser = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
    });

    const token = jwt.sign({ id: newUser._id, email: newUser.email }, SECRET_KEY, { expiresIn: '7d' });
    console.log(`✅ User registered: ${email}`);
    res.status(201).json({ token, user: { id: newUser._id, email: newUser.email } });
  } catch (e) {
    console.error('Registration failed:', e);
    if (e.code === 11000) {
      return res.status(400).json({ error: 'Email already in use' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    
    if (!user || !(await bcryptjs.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user._id, email: user.email }, SECRET_KEY, { expiresIn: '7d' });
    console.log(`✅ User logged in: ${email}`);
    res.json({ token, user: { id: user._id, email: user.email } });
  } catch (e) {
    console.error('Login failed:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get Current User
app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({ user: { id: req.user._id, email: req.user.email } });
});

// ============================
//   DOCUMENT ROUTES (MongoDB)
// ============================

// Save/Sync a document to DB
app.post('/api/documents', authenticate, async (req, res) => {
  try {
    const { title, pages, thumbnailUrl } = req.body;
    
    const doc = await Document.create({
      userId: req.user._id,
      title: title || 'Scanned Document',
      pages: pages || [],
      thumbnailUrl,
    });

    console.log(`📄 Document saved: "${doc.title}" by ${req.user.email}`);
    res.status(201).json(doc);
  } catch (e) {
    console.error('Save document failed:', e);
    res.status(500).json({ error: 'Failed to save document' });
  }
});

// Get all documents for current user
app.get('/api/documents', authenticate, async (req, res) => {
  try {
    const docs = await Document.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    
    res.json(docs);
  } catch (e) {
    console.error('Fetch documents failed:', e);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Get single document
app.get('/api/documents/:id', authenticate, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// Update a document
app.put('/api/documents/:id', authenticate, async (req, res) => {
  try {
    const { title, pages, thumbnailUrl, isFavorite, tags } = req.body;
    
    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { title, pages, thumbnailUrl, isFavorite, tags },
      { new: true, runValidators: true }
    );

    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// Delete a document
app.delete('/api/documents/:id', authenticate, async (req, res) => {
  try {
    const doc = await Document.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    console.log(`🗑️ Document deleted: "${doc.title}"`);
    res.json({ message: 'Document deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ========================
//   FILE UPLOAD & OCR
// ========================

// Upload File
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ 
    id: req.file.filename,
    url: fileUrl, 
    path: req.file.path,
    size: req.file.size
  });
});

// OCR Endpoint
app.post('/api/ocr', upload.single('image'), async (req, res) => {
  try {
    const imagePath = req.file ? req.file.path : null;
    if (!imagePath) {
      return res.status(400).json({ error: 'Image file required' });
    }

    console.log(`🔍 Processing OCR for: ${imagePath}`);
    const worker = await createWorker('eng');
    const { data } = await worker.recognize(imagePath);
    await worker.terminate();

    res.json({ 
      text: data.text.trim(), 
      confidence: data.confidence 
    });
  } catch (error) {
    console.error('OCR Error:', error);
    res.status(500).json({ error: 'OCR Processing failed' });
  }
});

// List uploaded files
app.get('/api/files', (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: 'Failed to list files' });
    
    const fileList = files.map(file => ({
      name: file,
      url: `${req.protocol}://${req.get('host')}/uploads/${file}`,
      date: fs.statSync(path.join(UPLOAD_DIR, file)).mtime
    }));
    
    res.json(fileList);
  });
});

// ========================
//   PDF TOOLS
// ========================

const parsePageRange = (rangeStr, totalPages) => {
  const pages = new Set();
  const parts = rangeStr.split(',');
  
  parts.forEach(part => {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          if (i > 0 && i <= totalPages) pages.add(i - 1);
        }
      }
    } else {
      const page = Number(trimmed);
      if (!isNaN(page) && page > 0 && page <= totalPages) {
        pages.add(page - 1);
      }
    }
  });
  return Array.from(pages).sort((a, b) => a - b);
};

// Merge PDFs
app.post('/api/pdf/merge', upload.array('files'), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length < 2) {
      return res.status(400).json({ error: 'At least 2 PDF files are required' });
    }

    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
      const fileBuffer = fs.readFileSync(file.path);
      const pdf = await PDFDocument.load(fileBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
      fs.unlinkSync(file.path); 
    }

    const pdfBytes = await mergedPdf.save();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=merged.pdf');
    res.send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('Merge Error:', error);
    res.status(500).json({ error: 'Failed to merge PDFs' });
  }
});

// Split PDF
app.post('/api/pdf/split', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF file required' });
    const range = req.body.range;
    if (!range) return res.status(400).json({ error: 'Page range required (e.g., "1-3")' });

    const fileBuffer = fs.readFileSync(req.file.path);
    const srcPdf = await PDFDocument.load(fileBuffer);
    
    const indicesToKeep = parsePageRange(range, srcPdf.getPageCount());
    
    if (indicesToKeep.length === 0) {
      return res.status(400).json({ error: 'Invalid page range' });
    }

    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(srcPdf, indicesToKeep);
    copiedPages.forEach(page => newPdf.addPage(page));

    const pdfBytes = await newPdf.save();
    fs.unlinkSync(req.file.path);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=split.pdf');
    res.send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('Split Error:', error);
    res.status(500).json({ error: 'Failed to split PDF' });
  }
});

// Compress PDF
app.post('/api/pdf/compress', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF file required' });

    const fileBuffer = fs.readFileSync(req.file.path);
    const pdfDoc = await PDFDocument.load(fileBuffer);
    
    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    fs.unlinkSync(req.file.path);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=compressed.pdf');
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Compress Error:', error);
    res.status(500).json({ error: 'Failed to compress PDF' });
  }
});


// Start Server
app.listen(PORT, () => {
  console.log(`\n🚀 CamScannerX Server running on http://localhost:${PORT}`);
  console.log(`🗄️  Database: MongoDB`);
  console.log(`📂 Uploads directory: ${UPLOAD_DIR}`);
  console.log(`✅ All API endpoints ready!\n`);
});