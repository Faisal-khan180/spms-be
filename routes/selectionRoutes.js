/**
 * selectionRoutes.js — Phase 10
 */
const express = require('express');
const router = express.Router();
const { recordSelection, getDriveSelections, getMyOffers, updateOfferStatus } = require('../controllers/selectionController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/', protect, authorize('company'), recordSelection);
router.get('/drives/:id', protect, authorize('company'), getDriveSelections);

router.get('/my', protect, authorize('student'), getMyOffers);
router.patch('/:id/status', protect, authorize('student'), updateOfferStatus);

module.exports = router;
