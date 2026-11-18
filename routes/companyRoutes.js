const express = require('express');
const router = express.Router();

const {
  getMyProfile, updateMyProfile,
  listCompanies, getCompanyById,
  approveCompany, revokeCompany,
  updateCompanyApproval
} = require('../controllers/companyController');

const { protect, authorize } = require('../middleware/authMiddleware');

// ---- Self-service (company only) ----
router.get('/me', protect, authorize('company'), getMyProfile);
router.put('/me', protect, authorize('company'), updateMyProfile);

// ---- Admin/TPO ----
// Mounted after /me so they aren't shadowed by /:id.
router.get('/', protect, authorize('admin'), listCompanies);
router.get('/:id', protect, authorize('admin'), getCompanyById);
router.patch('/:id/approval', protect, authorize('admin'), updateCompanyApproval);
router.patch('/:id/approve', protect, authorize('admin'), approveCompany);
router.patch('/:id/revoke', protect, authorize('admin'), revokeCompany);

module.exports = router;
