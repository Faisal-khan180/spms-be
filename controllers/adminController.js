/**
 * adminController.js — Phase 12 (Dashboards & Analytics)
 */
const { pool } = require('../config/db');
const { successResponse } = require('../utils/response');
const asyncHandler = require('../middleware/asyncHandler');

const getDashboardStats = asyncHandler(async (req, res) => {
  const [[studentCount]] = await pool.execute('SELECT COUNT(*) as count FROM students');
  const [[pendingStudentCount]] = await pool.execute('SELECT COUNT(*) as count FROM students WHERE verification_status = "pending"');
  const [[companyCount]] = await pool.execute('SELECT COUNT(*) as count FROM companies');
  const [[pendingCompanyCount]] = await pool.execute('SELECT COUNT(*) as count FROM companies WHERE is_approved = 0');
  const [[driveCount]]   = await pool.execute('SELECT COUNT(*) as count FROM placement_drives');
  const [[activeDriveCount]] = await pool.execute('SELECT COUNT(*) as count FROM placement_drives WHERE status IN ("active", "approved")');
  const [[pendingDriveCount]] = await pool.execute('SELECT COUNT(*) as count FROM placement_drives WHERE status = "pending_approval"');
  const [[applicationCount]] = await pool.execute('SELECT COUNT(*) as count FROM applications');
  const [[selectionCount]]   = await pool.execute('SELECT COUNT(*) as count FROM selections WHERE status = "accepted"');
  const [[totalOffersCount]] = await pool.execute('SELECT COUNT(*) as count FROM selections');

  // 1. Applications by status
  const [appStatusBreakdown] = await pool.execute(`
    SELECT status, COUNT(*) as count
    FROM applications
    GROUP BY status
  `);

  // 2. Selections / Placements by Branch
  const [branchSelections] = await pool.execute(`
    SELECT s.branch, COUNT(DISTINCT sel.id) as placed_count
    FROM students s
    JOIN applications a ON s.id = a.student_id
    JOIN selections sel ON a.id = sel.application_id
    WHERE sel.status = 'accepted'
    GROUP BY s.branch
    ORDER BY placed_count DESC
  `);

  // 3. Drives by Job Type
  const [jobTypeBreakdown] = await pool.execute(`
    SELECT job_type, COUNT(*) as count
    FROM placement_drives
    GROUP BY job_type
  `);

  // 4. Top Recruiting Companies
  const [topCompanies] = await pool.execute(`
    SELECT c.company_name, c.industry, COUNT(sel.id) as hires_count, MAX(sel.package_offered) as max_package
    FROM companies c
    JOIN placement_drives pd ON c.id = pd.company_id
    JOIN applications a ON pd.id = a.drive_id
    JOIN selections sel ON a.id = sel.application_id
    WHERE sel.status = 'accepted'
    GROUP BY c.id
    ORDER BY hires_count DESC
    LIMIT 5
  `);

  // 5. Recent Applications
  const [recentApplications] = await pool.execute(`
    SELECT a.id, a.status, a.applied_at,
           u.name as student_name, s.roll_number, s.branch,
           pd.title as drive_title, c.company_name
    FROM applications a
    JOIN students s ON a.student_id = s.id
    JOIN users u ON s.user_id = u.id
    JOIN placement_drives pd ON a.drive_id = pd.id
    JOIN companies c ON pd.company_id = c.id
    ORDER BY a.applied_at DESC
    LIMIT 6
  `);

  return successResponse(res, 200, 'Dashboard stats and analytics fetched.', {
    stats: {
      students: studentCount.count,
      pending_students: pendingStudentCount.count,
      companies: companyCount.count,
      pending_companies: pendingCompanyCount.count,
      total_drives: driveCount.count,
      active_drives: activeDriveCount.count,
      pending_drives: pendingDriveCount.count,
      applications: applicationCount.count,
      selections: selectionCount.count,
      total_offers: totalOffersCount.count
    },
    analytics: {
      application_status: appStatusBreakdown,
      branch_placements: branchSelections,
      job_types: jobTypeBreakdown,
      top_companies: topCompanies
    },
    recent_applications: recentApplications
  });
});

module.exports = { getDashboardStats };
