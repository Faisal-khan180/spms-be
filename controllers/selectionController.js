/**
 * selectionController.js — Phase 10 (Selections & Offers)
 */
const { pool } = require('../config/db');
const { successResponse } = require('../utils/response');
const asyncHandler = require('../middleware/asyncHandler');
const { createNotification } = require('./notificationController');

async function getCompanyId(userId) {
  const [rows] = await pool.execute('SELECT id FROM companies WHERE user_id = ?', [userId]);
  return rows[0]?.id;
}

// ── POST /api/selections (Company)
const recordSelection = asyncHandler(async (req, res) => {
  const { application_id, package_offered } = req.body;
  const companyId = await getCompanyId(req.user.id);

  if (!application_id || package_offered === undefined) {
    res.status(400);
    throw new Error('application_id and package_offered are required.');
  }

  const [appRows] = await pool.execute(`
    SELECT a.student_id, a.drive_id, pd.company_id, pd.title as drive_title, s.user_id as student_user_id
    FROM applications a
    JOIN placement_drives pd ON a.drive_id = pd.id
    JOIN students s ON a.student_id = s.id
    WHERE a.id = ?
  `, [application_id]);

  if (!appRows.length || appRows[0].company_id !== companyId) {
    res.status(403);
    throw new Error('Unauthorized or application not found.');
  }

  // Check duplicate selection
  const [existing] = await pool.execute('SELECT id FROM selections WHERE application_id = ?', [application_id]);
  if (existing.length > 0) {
    res.status(409);
    throw new Error('Selection offer has already been recorded for this applicant.');
  }

  // Insert selection
  const [result] = await pool.execute(
    'INSERT INTO selections (application_id, package_offered, offer_date, status) VALUES (?, ?, CURDATE(), ?)',
    [application_id, Number(package_offered), 'offered']
  );

  // Update application status
  await pool.execute('UPDATE applications SET status = ? WHERE id = ?', ['selected', application_id]);

  // Notify student
  await createNotification(
    appRows[0].student_user_id,
    'Job Offer Received! 🎉',
    `Congratulations! You have received an offer for "${appRows[0].drive_title}" with a package of ${package_offered} LPA.`
  );

  return successResponse(res, 201, 'Selection recorded and student notified.', {
    selection: { id: result.insertId, application_id, package_offered, status: 'offered' }
  });
});

// ── GET /api/selections/drives/:id (Company)
const getDriveSelections = asyncHandler(async (req, res) => {
  const { id: driveId } = req.params;
  const companyId = await getCompanyId(req.user.id);

  const [driveRows] = await pool.execute('SELECT company_id FROM placement_drives WHERE id = ?', [driveId]);
  if (!driveRows.length || driveRows[0].company_id !== companyId) {
    res.status(403);
    throw new Error('Unauthorized or drive not found.');
  }

  const [selections] = await pool.execute(`
    SELECT sel.*, u.name as student_name, u.email as student_email, s.roll_number, s.branch, s.cgpa
    FROM selections sel
    JOIN applications a ON sel.application_id = a.id
    JOIN students s ON a.student_id = s.id
    JOIN users u ON s.user_id = u.id
    WHERE a.drive_id = ?
    ORDER BY sel.created_at DESC
  `, [driveId]);

  return successResponse(res, 200, 'Selections fetched.', { selections });
});

// ── GET /api/selections/my (Student)
const getMyOffers = asyncHandler(async (req, res) => {
  const [studentRows] = await pool.execute('SELECT id FROM students WHERE user_id = ?', [req.user.id]);
  if (!studentRows.length) {
    res.status(404);
    throw new Error('Profile not found.');
  }

  const [offers] = await pool.execute(`
    SELECT sel.*, pd.id as drive_id, pd.title as drive_title, pd.location, pd.job_type,
           c.company_name, c.industry
    FROM selections sel
    JOIN applications a ON sel.application_id = a.id
    JOIN placement_drives pd ON a.drive_id = pd.id
    JOIN companies c ON pd.company_id = c.id
    WHERE a.student_id = ?
    ORDER BY sel.created_at DESC
  `, [studentRows[0].id]);

  return successResponse(res, 200, 'Offers fetched.', { offers });
});

// ── PATCH /api/selections/:id/status (Student)
const updateOfferStatus = asyncHandler(async (req, res) => {
  const { id } = req.params; // selection id
  const { status } = req.body; // accepted or declined

  if (!['accepted', 'declined'].includes(status)) {
    res.status(400);
    throw new Error("status must be 'accepted' or 'declined'.");
  }

  const [studentRows] = await pool.execute('SELECT id FROM students WHERE user_id = ?', [req.user.id]);
  const studentId = studentRows[0]?.id;

  const [selRows] = await pool.execute(`
    SELECT sel.id, sel.status as current_status, a.student_id, pd.title as drive_title,
           c.user_id as company_user_id, u.name as student_name
    FROM selections sel
    JOIN applications a ON sel.application_id = a.id
    JOIN placement_drives pd ON a.drive_id = pd.id
    JOIN companies c ON pd.company_id = c.id
    JOIN students s ON a.student_id = s.id
    JOIN users u ON s.user_id = u.id
    WHERE sel.id = ?
  `, [id]);

  if (!selRows.length || selRows[0].student_id !== studentId) {
    res.status(403);
    throw new Error('Unauthorized or selection not found.');
  }

  if (selRows[0].current_status !== 'offered') {
    res.status(400);
    throw new Error(`Offer has already been ${selRows[0].current_status}.`);
  }

  await pool.execute('UPDATE selections SET status = ? WHERE id = ?', [status, id]);

  // Notify company
  await createNotification(
    selRows[0].company_user_id,
    `Offer ${status === 'accepted' ? 'Accepted' : 'Declined'}`,
    `Candidate ${selRows[0].student_name} has ${status} the offer for "${selRows[0].drive_title}".`
  );

  return successResponse(res, 200, `Offer ${status} successfully.`);
});

module.exports = { recordSelection, getDriveSelections, getMyOffers, updateOfferStatus };
