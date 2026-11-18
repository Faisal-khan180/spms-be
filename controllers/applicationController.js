/**
 * applicationController.js — Phase 8: Applications Module
 */

const { pool } = require('../config/db');
const { successResponse } = require('../utils/response');
const asyncHandler = require('../middleware/asyncHandler');
const { checkEligibility } = require('../services/eligibilityService');

// Helper to get drive branches
async function getDriveBranches(driveId) {
  const [rows] = await pool.execute('SELECT branch FROM drive_eligible_branches WHERE drive_id = ?', [driveId]);
  return rows.map((r) => r.branch);
}

// ── Student: Apply for a Drive ──────────────────────────────────────────────
const applyForDrive = asyncHandler(async (req, res) => {
  const { drive_id } = req.body;
  if (!drive_id) {
    res.status(400);
    throw new Error('drive_id is required.');
  }

  // 1. Get student profile
  const [studentRows] = await pool.execute('SELECT * FROM students WHERE user_id = ?', [req.user.id]);
  const student = studentRows[0];
  if (!student) {
    res.status(404);
    throw new Error('Student profile not found. Please complete your profile first.');
  }

  // 1b. Check verification status
  if (student.verification_status !== 'approved') {
    res.status(403);
    const msg = student.verification_status === 'rejected'
      ? `Your student registration was rejected by TPO (${student.rejection_reason || 'Contact placement office'}). You cannot apply for placement drives.`
      : 'Your student account is pending TPO verification. You cannot apply for placement drives until approved.';
    throw new Error(msg);
  }

  // 2. Check if resume exists
  if (!student.resume_url) {
    res.status(400);
    throw new Error('You must upload a resume to your profile before applying.');
  }

  // 3. Get drive
  const [driveRows] = await pool.execute('SELECT * FROM placement_drives WHERE id = ?', [drive_id]);
  const drive = driveRows[0];
  if (!drive) {
    res.status(404);
    throw new Error('Placement drive not found.');
  }

  if (!['approved', 'active'].includes(drive.status)) {
    res.status(400);
    throw new Error('This drive is not open for applications.');
  }

  // 4. Check application deadline
  if (drive.application_deadline) {
    const deadline = new Date(drive.application_deadline);
    if (new Date() > deadline) {
      res.status(400);
      throw new Error('The application deadline for this drive has passed.');
    }
  }

  if (drive.application_start_date) {
    const start = new Date(drive.application_start_date);
    if (new Date() < start) {
      res.status(400);
      throw new Error('Applications for this drive have not opened yet.');
    }
  }

  // 5. Check duplicate application
  const [existing] = await pool.execute(
    'SELECT id, status FROM applications WHERE drive_id = ? AND student_id = ?',
    [drive.id, student.id]
  );
  if (existing.length > 0) {
    res.status(400);
    throw new Error(`You have already applied for this drive. Status: ${existing[0].status}`);
  }

  // 6. Check eligibility (Phase 7 Engine)
  const [skillRows] = await pool.execute('SELECT skill_name FROM student_skills WHERE student_id = ?', [student.id]);
  student.skills = skillRows.map((r) => r.skill_name);
  drive.eligible_branches = await getDriveBranches(drive.id);

  const eligibility = checkEligibility(student, drive);
  if (!eligibility.eligible) {
    res.status(400);
    throw new Error('You are not eligible for this drive. Reasons: ' + eligibility.reasons.join(' '));
  }

  // 7. Insert application
  const [result] = await pool.execute(
    'INSERT INTO applications (drive_id, student_id, status) VALUES (?, ?, ?)',
    [drive.id, student.id, 'applied']
  );

  return successResponse(res, 201, 'Successfully applied for the placement drive.', {
    application_id: result.insertId
  });
});

// ── Student: My Applications ────────────────────────────────────────────────
const getMyApplications = asyncHandler(async (req, res) => {
  const [studentRows] = await pool.execute('SELECT id FROM students WHERE user_id = ?', [req.user.id]);
  if (!studentRows.length) {
    res.status(404);
    throw new Error('Student profile not found.');
  }

  const [applications] = await pool.execute(`
    SELECT a.*,
           pd.title as drive_title, pd.job_type, pd.location, pd.package_ctc,
           c.company_name
    FROM applications a
    JOIN placement_drives pd ON a.drive_id = pd.id
    JOIN companies c ON pd.company_id = c.id
    WHERE a.student_id = ?
    ORDER BY a.applied_at DESC
  `, [studentRows[0].id]);

  return successResponse(res, 200, 'Applications fetched.', {
    count: applications.length,
    applications
  });
});

// ── Student: Withdraw Application ───────────────────────────────────────────
const withdrawApplication = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [studentRows] = await pool.execute('SELECT id FROM students WHERE user_id = ?', [req.user.id]);
  if (!studentRows.length) {
    res.status(404);
    throw new Error('Student profile not found.');
  }

  const [appRows] = await pool.execute('SELECT * FROM applications WHERE id = ?', [id]);
  const application = appRows[0];

  if (!application) {
    res.status(404);
    throw new Error('Application not found.');
  }

  if (application.student_id !== studentRows[0].id) {
    res.status(403);
    throw new Error('You do not have permission to withdraw this application.');
  }

  if (['rejected', 'selected'].includes(application.status)) {
    res.status(400);
    throw new Error(`Cannot withdraw application with status '${application.status}'.`);
  }

  if (application.status === 'withdrawn') {
    res.status(400);
    throw new Error('Application is already withdrawn.');
  }

  await pool.execute('UPDATE applications SET status = ? WHERE id = ?', ['withdrawn', id]);

  return successResponse(res, 200, 'Application withdrawn successfully.');
});

// ── Company: View Drive Applications ────────────────────────────────────────
const getDriveApplications = asyncHandler(async (req, res) => {
  const { id: driveId } = req.params; // drive_id

  // 1. Get company and check ownership
  const [companyRows] = await pool.execute('SELECT id FROM companies WHERE user_id = ?', [req.user.id]);
  const companyId = companyRows[0]?.id;

  if (!companyId) {
    res.status(404);
    throw new Error('Company profile not found.');
  }

  const [driveRows] = await pool.execute('SELECT company_id FROM placement_drives WHERE id = ?', [driveId]);
  if (!driveRows.length) {
    res.status(404);
    throw new Error('Drive not found.');
  }

  if (driveRows[0].company_id !== companyId) {
    res.status(403);
    throw new Error('You do not have permission to view applications for this drive.');
  }

  // 2. Fetch applications with student details
  const [applications] = await pool.execute(`
    SELECT a.id as application_id, a.status, a.applied_at,
           s.id as student_id, s.roll_number, s.branch, s.cgpa, s.resume_url,
           u.name as student_name, u.email as student_email
    FROM applications a
    JOIN students s ON a.student_id = s.id
    JOIN users u ON s.user_id = u.id
    WHERE a.drive_id = ?
    ORDER BY a.applied_at DESC
  `, [driveId]);

  // Load skills for each student
  for (const app of applications) {
    const [skillRows] = await pool.execute(
      'SELECT skill_name FROM student_skills WHERE student_id = ?',
      [app.student_id]
    );
    app.skills = skillRows.map(r => r.skill_name);
  }

  return successResponse(res, 200, 'Applications fetched.', {
    count: applications.length,
    applications
  });
});

// ── Company: Update Application Status ──────────────────────────────────────
const updateApplicationStatus = asyncHandler(async (req, res) => {
  const { id } = req.params; // application id
  const { status } = req.body;

  const validStatuses = ['shortlisted', 'rejected', 'interview_scheduled', 'selected'];
  if (!validStatuses.includes(status)) {
    res.status(400);
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const [companyRows] = await pool.execute('SELECT id FROM companies WHERE user_id = ?', [req.user.id]);
  const companyId = companyRows[0]?.id;

  const [appRows] = await pool.execute(`
    SELECT a.*, pd.company_id 
    FROM applications a
    JOIN placement_drives pd ON a.drive_id = pd.id
    WHERE a.id = ?
  `, [id]);

  const application = appRows[0];
  if (!application) {
    res.status(404);
    throw new Error('Application not found.');
  }

  if (application.company_id !== companyId) {
    res.status(403);
    throw new Error('You do not have permission to update this application.');
  }
  
  if (application.status === 'withdrawn') {
    res.status(400);
    throw new Error('Cannot update a withdrawn application.');
  }

  await pool.execute('UPDATE applications SET status = ? WHERE id = ?', [status, id]);

  return successResponse(res, 200, 'Application status updated.', {
    application_id: application.id,
    status
  });
});

// ── Admin: List All Applications ────────────────────────────────────────────
const listAllApplications = asyncHandler(async (req, res) => {
  const { status, drive_id } = req.query;

  let query = `
    SELECT a.*,
           pd.title as drive_title, c.company_name,
           u.name as student_name, s.roll_number
    FROM applications a
    JOIN placement_drives pd ON a.drive_id = pd.id
    JOIN companies c ON pd.company_id = c.id
    JOIN students s ON a.student_id = s.id
    JOIN users u ON s.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    query += ' AND a.status = ?';
    params.push(status);
  }
  if (drive_id) {
    query += ' AND a.drive_id = ?';
    params.push(drive_id);
  }

  query += ' ORDER BY a.applied_at DESC';

  const [applications] = await pool.execute(query, params);

  return successResponse(res, 200, 'All applications fetched.', {
    count: applications.length,
    applications
  });
});

module.exports = {
  applyForDrive,
  getMyApplications,
  withdrawApplication,
  getDriveApplications,
  updateApplicationStatus,
  listAllApplications
};
