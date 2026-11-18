const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');

const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { successResponse } = require('./utils/response');

const app = express();

// ---- Core middleware ----
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Ignore favicon 404
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/config.json', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ apiBaseUrl: process.env.API_BASE_URL || '/api' });
});

// ---- Static file serving ----
// 1. Uploaded student resumes
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 2. Frontend application static files (serves the UI directly at http://localhost:5000)
app.use(express.static(path.join(__dirname, '../frontend')));

// ---- Health check ----
app.get('/api/health', (req, res) => {
  successResponse(res, 200, 'Smart Placement Management System API is running');
});

// ---- Route modules ----
app.use('/api/auth', require('./routes/authRoutes'));                   // Phase 3
app.use('/api/students', require('./routes/studentRoutes'));            // Phase 4
app.use('/api/companies', require('./routes/companyRoutes'));           // Phase 5
app.use('/api/drives', require('./routes/driveRoutes'));                // Phase 6 + 7
app.use('/api/applications', require('./routes/applicationRoutes'));    // Phase 8
app.use('/api/interviews', require('./routes/interviewRoutes'));        // Phase 9
app.use('/api/selections', require('./routes/selectionRoutes'));        // Phase 10
app.use('/api/notifications', require('./routes/notificationRoutes'));  // Phase 11
app.use('/api/admin', require('./routes/adminRoutes'));                 // Phase 12

// ---- 404 + centralized error handling (must stay last) ----
app.use(notFound);
app.use(errorHandler);

module.exports = app;
