/**
 * applicationRoutes.js — Phase 8: Applications Module
 */
const express = require('express');
const router = express.Router();

const {
  applyForDrive,
  getMyApplications,
  withdrawApplication,
  updateApplicationStatus,
  listAllApplications
} = require('../controllers/applicationController');

const { protect, authorize } = require('../middleware/authMiddleware');

// ── Student Routes ──────────────────────────────────────────────────────────
// POST   /api/applications          — Apply for a drive
// GET    /api/applications/my       — View my applications
// PATCH  /api/applications/:id/withdraw — Withdraw my application

router.post('/', protect, authorize('student'), applyForDrive);
router.get('/my', protect, authorize('student'), getMyApplications);
router.patch('/:id/withdraw', protect, authorize('student'), withdrawApplication);

// ── Company Routes ──────────────────────────────────────────────────────────
// PATCH  /api/applications/:id/status — Update applicant status (shortlist/reject)

router.patch('/:id/status', protect, authorize('company'), updateApplicationStatus);

// ── Admin Routes ────────────────────────────────────────────────────────────
// GET    /api/applications/admin    — View all applications globally

router.get('/admin', protect, authorize('admin'), listAllApplications);

module.exports = router;
