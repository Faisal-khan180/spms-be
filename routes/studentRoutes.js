const express = require('express');
const router = express.Router();

const {
  getMyProfile, updateMyProfile,
  addSkill, removeSkill,
  addProject, removeProject,
  addCertification, removeCertification,
  uploadMyResume,
  listStudents, getStudentById,
  approveStudent, rejectStudent, updateStudentVerification,
  getRecommendedDrives
} = require('../controllers/studentController');

const { protect, authorize } = require('../middleware/authMiddleware');
const { uploadResumeSingle } = require('../middleware/uploadMiddleware');

// ---- Self-service (student only) ----
router.get('/me', protect, authorize('student'), getMyProfile);
router.put('/me', protect, authorize('student'), updateMyProfile);

router.post('/me/skills', protect, authorize('student'), addSkill);
router.delete('/me/skills/:skillId', protect, authorize('student'), removeSkill);

router.post('/me/projects', protect, authorize('student'), addProject);
router.delete('/me/projects/:projectId', protect, authorize('student'), removeProject);

router.post('/me/certifications', protect, authorize('student'), addCertification);
router.delete('/me/certifications/:certificationId', protect, authorize('student'), removeCertification);

router.post('/me/resume', protect, authorize('student'), uploadResumeSingle, uploadMyResume);

// ---- Phase 7: Recommended drives (must be before /:id) ----
router.get('/recommended-drives', protect, authorize('student'), getRecommendedDrives);

// ---- Admin/TPO directory & verification ----
// Mounted after the /me routes so they aren't shadowed by /:id.
router.get('/', protect, authorize('admin'), listStudents);
router.get('/:id', protect, authorize('admin'), getStudentById);
router.patch('/:id/verification', protect, authorize('admin'), updateStudentVerification);
router.patch('/:id/approve', protect, authorize('admin'), approveStudent);
router.patch('/:id/reject', protect, authorize('admin'), rejectStudent);

module.exports = router;
