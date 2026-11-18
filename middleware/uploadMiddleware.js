const multer = require('multer');
const path = require('path');
const fs = require('fs');

const RESUME_DIR = path.join(__dirname, '..', 'uploads', 'resumes');

// multer's diskStorage does NOT create missing directories itself — do
// it once up front so the first upload doesn't fail with ENOENT.
if (!fs.existsSync(RESUME_DIR)) {
  fs.mkdirSync(RESUME_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RESUME_DIR),
  filename: (req, file, cb) => {
    // Requires `protect` middleware to have run first (sets req.user),
    // which route wiring in studentRoutes.js enforces.
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `student_${req.user.id}_${Date.now()}${ext}`;
    cb(null, uniqueName);
  }
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error('Resume must be a PDF or Word document (.pdf, .doc, .docx).'));
  }
  return cb(null, true);
}

const uploadResume = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

/**
 * Wraps multer's single-file middleware so upload failures (wrong file
 * type from fileFilter, file too large from limits) come back as a
 * clean 400 through the app's normal error envelope, instead of an
 * uncaught error object reaching the generic 500 handler.
 */
function uploadResumeSingle(req, res, next) {
  uploadResume.single('resume')(req, res, (err) => {
    if (err) {
      res.status(400);
      return next(new Error(err.message));
    }
    return next();
  });
}

module.exports = { uploadResumeSingle };
