/**
 * driveRoutes.js — Phase 6: Placement Drive Routes
 *
 * Route ordering is intentional:
 *   /my, /admin, /:id/approve, /:id/reject, /:id/close, /:id/eligibility
 *   must all be declared before the generic /:id to avoid Express shadowing.
 */

const express = require('express');
const router = express.Router();

const {
  createDrive,
  getMyDrives,
  listDrivesForStudents,
  listDrivesAdmin,
  getDriveById,
  updateDrive,
  deleteDrive,
  approveDrive,
  rejectDrive,
  closeDrive,
  updateDriveStatus,
  checkEligibility
} = require('../controllers/driveController');

const { protect, authorize } = require('../middleware/authMiddleware');

// ── Company: manage own drives ──────────────────────────────────────────────
// POST   /api/drives           — create a new drive (approved company only)
// GET    /api/drives/my        — list own drives

router.post('/',    protect, authorize('company'), createDrive);
router.get('/my',   protect, authorize('company'), getMyDrives);

// ── Admin: manage all drives ─────────────────────────────────────────────────
// GET   /api/drives/admin      — all drives (filterable by ?status=)
// Must come before /:id to avoid /admin being treated as a drive id.

router.get('/admin',               protect, authorize('admin'), listDrivesAdmin);

// ── Admin: status management ──────────────────────────────────────────────────
// Must come before /:id so /:id/approve etc. are not consumed by /:id first.

router.patch('/:id/status',        protect, authorize('admin'), updateDriveStatus);
router.patch('/:id/approve',       protect, authorize('admin'), approveDrive);
router.patch('/:id/reject',        protect, authorize('admin'), rejectDrive);
router.patch('/:id/close',         protect, authorize('admin'), closeDrive);

// ── Student: check eligibility ────────────────────────────────────────────────
router.get('/:id/eligibility',     protect, authorize('student'), checkEligibility);

// ── Student / Admin: browse active drives ─────────────────────────────────────
// GET   /api/drives            — active/approved drives visible to students and admin

router.get('/',    protect, authorize('student', 'admin'), listDrivesForStudents);

// ── Shared: single drive detail (company, admin, student) ────────────────────
// GET    /api/drives/:id       — role-aware: students see approved only
// PUT    /api/drives/:id       — company owner updates
// DELETE /api/drives/:id       — company owner deletes (draft only)

router.get('/:id',    protect, authorize('student', 'company', 'admin'), getDriveById);
router.put('/:id',    protect, authorize('company'), updateDrive);
router.delete('/:id', protect, authorize('company'), deleteDrive);

const { getDriveApplications } = require('../controllers/applicationController');
router.get('/:id/applications', protect, authorize('company'), getDriveApplications);

module.exports = router;
