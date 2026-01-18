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
import { Pool } from 'pg';

let pool; // Declare pool globally but initialize conditionally

// Check if SKIP_POSTGRES environment variable is set to true
const skipPostgres = process.env.SKIP_POSTGRES === 'true';

if (process.env.NODE_ENV === 'development' && !skipPostgres) {
  // PostgreSQL Connection Pool (Development only)
  pool = new Pool({
    user: 'camscannerx_user',
    host: 'localhost',
    database: 'camscannerx_db',
    password: 'C0ldC0fe',
    port: 5432,
  });

  pool.connect((err, client, release) => {
    if (err) {
      console.error('Error acquiring client from PostgreSQL pool:', err.stack);
      // Optionally, you might want to set pool to null or undefined here
      // to prevent further attempts to use it if the connection failed.
      // For now, we'll let subsequent route handlers check for its existence.
      return;
    }
    client.query('SELECT NOW()', (err, result) => {
      release();
      if (err) {
        console.error('Error executing query on PostgreSQL:', err.stack);
        return;
      }
      console.log('PostgreSQL connected:', result.rows[0].now);
    });
  });
} else {
  console.log('Skipping PostgreSQL connection. NODE_ENV is not development or SKIP_POSTGRES is true.');
}

export { pool }; // Export the pool for use in other modules

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const SECRET_KEY = process.env.JWT_SECRET || 'super-secret-key-change-in-prod';

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));

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

// 1. Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// 2. Auth Routes
app.post('/api/auth/register', async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: 'Database not connected. Cannot register user.' });
  }
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check if user already exists
    const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);
    const newUser = await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
      [email, hashedPassword]
    );

    const user = newUser.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error('Registration failed:', e);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: 'Database not connected. Cannot log in.' });
  }
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const userResult = await pool.query('SELECT id, email, password FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    
    if (!user || !(await bcryptjs.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error('Login failed:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: 'Database not connected. Cannot fetch user data.' });
  }
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Null token' });

  jwt.verify(token, SECRET_KEY, async (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    
    try {
      const userResult = await pool.query('SELECT id, email FROM users WHERE id = $1', [decoded.id]);
      const user = userResult.rows[0];

      if (!user) return res.status(404).json({ error: 'User not found' });

      res.json({ user });
    } catch (dbError) {
      console.error('Error fetching user from DB:', dbError);
      res.status(500).json({ error: 'Failed to fetch user data' });
    }
  });
});


// 3. Upload File
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

// 4. OCR Endpoint
app.post('/api/ocr', upload.single('image'), async (req, res) => {
  try {
    const imagePath = req.file ? req.file.path : null;
    if (!imagePath) {
        return res.status(400).json({ error: 'Image file required' });
    }

    console.log(`Processing OCR for: ${imagePath}`);

    // Initialize Tesseract Worker
    const worker = await createWorker('eng');
    const { data } = await worker.recognize(imagePath);
    await worker.terminate();

    // Clean up file if needed - optional based on retention policy
    // fs.unlinkSync(imagePath);

    res.json({ 
        text: data.text.trim(), 
        confidence: data.confidence 
    });
  } catch (error) {
    console.error('OCR Error:', error);
    res.status(500).json({ error: 'OCR Processing failed' });
  }
});

// 5. List Files
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

// --- PDF TOOLS ENDPOINTS ---

// Helper: Parse Page Range (e.g., "1,3-5" -> [0, 2, 3, 4])
const parsePageRange = (rangeStr, totalPages) => {
  const pages = new Set();
  const parts = rangeStr.split(',');
  
  parts.forEach(part => {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          if (i > 0 && i <= totalPages) pages.add(i - 1); // Convert 1-based to 0-based
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

// 6. Merge PDFs
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
      // Cleanup uploaded temp file immediately
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

// 7. Split PDF
app.post('/api/pdf/split', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF file required' });
    const range = req.body.range; // e.g., "1-3"
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
    
    // Cleanup
    fs.unlinkSync(req.file.path);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=split.pdf');
    res.send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('Split Error:', error);
    res.status(500).json({ error: 'Failed to split PDF' });
  }
});

// 8. Compress PDF (Structural Optimization)
app.post('/api/pdf/compress', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF file required' });

    const fileBuffer = fs.readFileSync(req.file.path);
    const pdfDoc = await PDFDocument.load(fileBuffer);
    
    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });

    // Cleanup
    fs.unlinkSync(req.file.path);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=compressed.pdf');
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Compress Error:', error);
    res.status(500).json({ error: 'Failed to compress PDF' });
  }
});


app.listen(PORT, () => {
  console.log(`CamScannerX Server running on port ${PORT}`);
});