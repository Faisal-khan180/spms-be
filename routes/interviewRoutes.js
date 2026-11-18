/**
 * interviewRoutes.js — Phase 9
 */
const express = require('express');
const router = express.Router();
const {
  createRound,
  getDriveRounds,
  getDriveResults,
  scheduleInterview,
  updateResult,
  getMyInterviews
} = require('../controllers/interviewController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/drives/:id/rounds', protect, authorize('company'), createRound);
router.get('/drives/:id/rounds', protect, authorize('company', 'student'), getDriveRounds);
router.get('/drives/:id/results', protect, authorize('company'), getDriveResults);
router.post('/schedule', protect, authorize('company'), scheduleInterview);
router.patch('/results/:id', protect, authorize('company'), updateResult);

router.get('/my', protect, authorize('student'), getMyInterviews);

module.exports = router;
