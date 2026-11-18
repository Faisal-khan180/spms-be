/**
 * driveController.js — Phase 6: Placement Drive Module
 *
 * Handles all CRUD and status-management operations for placement_drives.
 * The eligibility check (Phase 7) is split into services/eligibilityService.js
 * and called from checkEligibility below, keeping this controller thin.
 *
 * Roles & permissions summary:
 *   company (approved)  → create, view own, update own (draft/pending), delete own (draft)
 *   admin               → view all, approve, reject, close
 *   student             → view approved/active drives, check eligibility
 */

const { pool } = require('../config/db');
const { successResponse } = require('../utils/response');
const asyncHandler = require('../middleware/asyncHandler');
const {
  isValidCGPA,
  isValidPercentage,
  isNonNegativeInteger,
  isValidPassingYear
} = require('../utils/validation');

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the companies row for the currently logged-in user, or null.
 */
async function getCompanyForUser(userId) {
  const [rows] = await pool.execute(
    'SELECT * FROM companies WHERE user_id = ?',
    [userId]
  );
  return rows[0] || null;
}

/**
 * Returns an array of branch names for a drive.
 */
async function getDriveBranches(driveId) {
  const [rows] = await pool.execute(
    'SELECT branch FROM drive_eligible_branches WHERE drive_id = ?',
    [driveId]
  );
  return rows.map((r) => r.branch);
}

/**
 * Replaces the eligible_branches for a drive atomically.
 * Uses the passed-in connection for transactional safety.
 */
async function replaceDriveBranches(conn, driveId, branches) {
  await conn.execute(
    'DELETE FROM drive_eligible_branches WHERE drive_id = ?',
    [driveId]
  );
  for (const branch of branches) {
    if (branch && branch.trim()) {
      await conn.execute(
        'INSERT INTO drive_eligible_branches (drive_id, branch) VALUES (?, ?)',
        [driveId, branch.trim()]
      );
    }
  }
}

/**
 * Sends an in-app notification to a user.
 */
async function notify(userId, title, message) {
  await pool.execute(
    'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
    [userId, title, message]
  );
}

/**
 * Validates drive payload; returns { errors[], cleaned{} }.
 * Both create and update pass through here (update skips missing-field check
 * by setting `isUpdate = true`).
 */
function validateDrivePayload(body, isUpdate = false) {
  const errors = [];
  const cleaned = {};

  // ── Required fields ──
  if (!isUpdate || body.title !== undefined) {
    if (!body.title || !String(body.title).trim()) errors.push('title is required.');
    else cleaned.title = String(body.title).trim();
  }
  if (!isUpdate || body.description !== undefined) {
    if (!body.description || !String(body.description).trim()) errors.push('description is required.');
    else cleaned.description = String(body.description).trim();
  }

  // ── Eligible branches ──
  if (!isUpdate || body.eligible_branches !== undefined) {
    const branches = body.eligible_branches;
    if (!Array.isArray(branches) || branches.length === 0) {
      if (!isUpdate) errors.push('eligible_branches must be a non-empty array.');
    } else {
      cleaned.eligible_branches = branches;
    }
  }

  // ── Optional enums ──
  const validJobTypes = ['full_time', 'internship', 'ppo'];
  if (body.job_type !== undefined) {
    if (!validJobTypes.includes(body.job_type)) {
      errors.push(`job_type must be one of: ${validJobTypes.join(', ')}.`);
    } else {
      cleaned.job_type = body.job_type;
    }
  }

  const validWorkModes = ['on_site', 'remote', 'hybrid'];
  if (body.work_mode !== undefined) {
    if (!validWorkModes.includes(body.work_mode)) {
      errors.push(`work_mode must be one of: ${validWorkModes.join(', ')}.`);
    } else {
      cleaned.work_mode = body.work_mode;
    }
  }

  // ── Numeric fields ──
  if (body.min_cgpa !== undefined) {
    if (!isValidCGPA(body.min_cgpa)) errors.push('min_cgpa must be between 0 and 10.');
    else cleaned.min_cgpa = Number(body.min_cgpa);
  }
  if (body.max_backlogs !== undefined) {
    if (!isNonNegativeInteger(body.max_backlogs)) errors.push('max_backlogs must be a non-negative integer.');
    else cleaned.max_backlogs = Number(body.max_backlogs);
  }
  if (body.min_10th_percentage !== undefined && body.min_10th_percentage !== null) {
    if (!isValidPercentage(body.min_10th_percentage)) errors.push('min_10th_percentage must be between 0 and 100.');
    else cleaned.min_10th_percentage = Number(body.min_10th_percentage);
  } else if (body.min_10th_percentage === null) {
    cleaned.min_10th_percentage = null;
  }
  if (body.min_12th_percentage !== undefined && body.min_12th_percentage !== null) {
    if (!isValidPercentage(body.min_12th_percentage)) errors.push('min_12th_percentage must be between 0 and 100.');
    else cleaned.min_12th_percentage = Number(body.min_12th_percentage);
  } else if (body.min_12th_percentage === null) {
    cleaned.min_12th_percentage = null;
  }
  if (body.passing_year !== undefined && body.passing_year !== null) {
    if (!isValidPassingYear(body.passing_year)) errors.push('passing_year must be a valid year (±10 from current year).');
    else cleaned.passing_year = Number(body.passing_year);
  } else if (body.passing_year === null) {
    cleaned.passing_year = null;
  }
  if (body.num_openings !== undefined) {
    const n = Number(body.num_openings);
    if (!Number.isInteger(n) || n < 1) errors.push('num_openings must be a positive integer (≥ 1).');
    else cleaned.num_openings = n;
  }
  if (body.package_ctc !== undefined && body.package_ctc !== null) {
    const ctc = Number(body.package_ctc);
    if (Number.isNaN(ctc) || ctc < 0) errors.push('package_ctc must be a non-negative number.');
    else cleaned.package_ctc = ctc;
  } else if (body.package_ctc === null) {
    cleaned.package_ctc = null;
  }

  // ── Date fields ──
  if (body.application_start_date !== undefined) {
    cleaned.application_start_date = body.application_start_date || null;
  }
  if (body.application_deadline !== undefined) {
    cleaned.application_deadline = body.application_deadline || null;
  }
  if (
    cleaned.application_start_date &&
    cleaned.application_deadline &&
    new Date(cleaned.application_deadline) < new Date(cleaned.application_start_date)
  ) {
    errors.push('application_deadline must be on or after application_start_date.');
  }
  if (body.drive_date !== undefined) {
    cleaned.drive_date = body.drive_date || null;
  }

  // ── Text/string optional fields ──
  ['location', 'eligible_course', 'selection_process'].forEach((field) => {
    if (body[field] !== undefined) cleaned[field] = body[field] || null;
  });

  // required_skills: accept array or comma-separated string
  if (body.required_skills !== undefined) {
    if (Array.isArray(body.required_skills)) {
      cleaned.required_skills = body.required_skills.join(',') || null;
    } else {
      cleaned.required_skills = body.required_skills || null;
    }
  }

  return { errors, cleaned };
}

// Fields that may be updated by a company via PUT /api/drives/:id
const UPDATABLE_DRIVE_FIELDS = [
  'title', 'description', 'job_type', 'work_mode', 'location',
  'eligible_course', 'package_ctc', 'min_cgpa', 'max_backlogs',
  'min_10th_percentage', 'min_12th_percentage', 'passing_year',
  'required_skills', 'application_start_date', 'application_deadline',
  'drive_date', 'num_openings', 'selection_process'
];

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/drives — Company creates a placement drive
// ─────────────────────────────────────────────────────────────────────────────
const createDrive = asyncHandler(async (req, res) => {
  const company = await getCompanyForUser(req.user.id);
  if (!company) {
    res.status(404);
    throw new Error('Company profile not found.');
  }
  if (!company.is_approved) {
    res.status(403);
    throw new Error('Your company must be approved by the admin before creating placement drives.');
  }

  const { errors, cleaned } = validateDrivePayload(req.body, false);
  if (errors.length > 0) {
    res.status(400);
    throw new Error(errors.join(' '));
  }

  // Status: approved companies submit as pending_approval; they may save
  // a draft by explicitly passing status='draft' in the body.
  const allowedStatuses = ['draft', 'pending_approval'];
  const status = allowedStatuses.includes(req.body.status) ? req.body.status : 'pending_approval';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO placement_drives
         (company_id, title, description, job_type, work_mode, location,
          eligible_course, package_ctc, min_cgpa, max_backlogs,
          min_10th_percentage, min_12th_percentage, passing_year,
          required_skills, application_start_date, application_deadline,
          drive_date, num_openings, selection_process, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company.id,
        cleaned.title,
        cleaned.description,
        cleaned.job_type    || 'full_time',
        cleaned.work_mode   || 'on_site',
        cleaned.location    || null,
        cleaned.eligible_course  || null,
        cleaned.package_ctc      ?? null,
        cleaned.min_cgpa         ?? 0,
        cleaned.max_backlogs     ?? 0,
        cleaned.min_10th_percentage ?? null,
        cleaned.min_12th_percentage ?? null,
        cleaned.passing_year     ?? null,
        cleaned.required_skills  || null,
        cleaned.application_start_date || null,
        cleaned.application_deadline   || null,
        cleaned.drive_date             || null,
        cleaned.num_openings     ?? 1,
        cleaned.selection_process || null,
        status
      ]
    );

    const driveId = result.insertId;
    if (cleaned.eligible_branches && cleaned.eligible_branches.length > 0) {
      await replaceDriveBranches(conn, driveId, cleaned.eligible_branches);
    }

    await conn.commit();

    const [driveRows] = await pool.execute(
      'SELECT * FROM placement_drives WHERE id = ?',
      [driveId]
    );
    const branches = await getDriveBranches(driveId);
    return successResponse(res, 201, 'Placement drive created.', {
      drive: { ...driveRows[0], eligible_branches: branches }
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/drives/my — Company views its own drives
// ─────────────────────────────────────────────────────────────────────────────
const getMyDrives = asyncHandler(async (req, res) => {
  const company = await getCompanyForUser(req.user.id);
  if (!company) {
    res.status(404);
    throw new Error('Company profile not found.');
  }

  const [drives] = await pool.execute(
    `SELECT pd.*,
            COUNT(DISTINCT a.id) AS applications_count
     FROM placement_drives pd
     LEFT JOIN applications a ON a.drive_id = pd.id
     WHERE pd.company_id = ?
     GROUP BY pd.id
     ORDER BY pd.created_at DESC`,
    [company.id]
  );

  // Attach branches for each drive
  const drivesWithBranches = await Promise.all(
    drives.map(async (d) => ({
      ...d,
      eligible_branches: await getDriveBranches(d.id)
    }))
  );

  return successResponse(res, 200, 'Drives fetched.', {
    count: drivesWithBranches.length,
    drives: drivesWithBranches
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/drives — Students browse active/approved drives
// ─────────────────────────────────────────────────────────────────────────────
const listDrivesForStudents = asyncHandler(async (req, res) => {
  const { course, branch } = req.query;
  const conditions = [`pd.status IN ('approved', 'active')`];
  const values = [];

  // Optional filters passed by students
  if (course) {
    conditions.push('(pd.eligible_course IS NULL OR pd.eligible_course = ?)');
    values.push(course);
  }
  if (branch) {
    conditions.push(
      'EXISTS (SELECT 1 FROM drive_eligible_branches deb WHERE deb.drive_id = pd.id AND deb.branch = ?)'
    );
    values.push(branch);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [drives] = await pool.execute(
    `SELECT pd.id, pd.title, pd.description, pd.job_type, pd.work_mode, pd.location,
            pd.eligible_course, pd.package_ctc, pd.min_cgpa, pd.max_backlogs,
            pd.min_10th_percentage, pd.min_12th_percentage, pd.passing_year,
            pd.required_skills, pd.application_start_date, pd.application_deadline,
            pd.num_openings, pd.selection_process, pd.status, pd.drive_date, pd.created_at,
            c.company_name, c.industry, c.website
     FROM placement_drives pd
     JOIN companies c ON c.id = pd.company_id
     ${whereClause}
     ORDER BY pd.application_deadline ASC, pd.created_at DESC`,
    values
  );

  const drivesWithBranches = await Promise.all(
    drives.map(async (d) => ({
      ...d,
      eligible_branches: await getDriveBranches(d.id)
    }))
  );

  return successResponse(res, 200, 'Placement drives fetched.', {
    count: drivesWithBranches.length,
    drives: drivesWithBranches
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/drives/admin — Admin views all drives
// ─────────────────────────────────────────────────────────────────────────────
const listDrivesAdmin = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const conditions = [];
  const values = [];

  if (status) {
    conditions.push('pd.status = ?');
    values.push(status);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [drives] = await pool.execute(
    `SELECT pd.*,
            c.company_name, c.industry, c.is_approved AS company_approved,
            u.email AS company_email,
            COUNT(DISTINCT a.id) AS applications_count
     FROM placement_drives pd
     JOIN companies c  ON c.id  = pd.company_id
     JOIN users u      ON u.id  = c.user_id
     LEFT JOIN applications a ON a.drive_id = pd.id
     ${whereClause}
     GROUP BY pd.id
     ORDER BY pd.status ASC, pd.created_at DESC`,
    values
  );

  const drivesWithBranches = await Promise.all(
    drives.map(async (d) => ({
      ...d,
      eligible_branches: await getDriveBranches(d.id)
    }))
  );

  return successResponse(res, 200, 'All drives fetched.', {
    count: drivesWithBranches.length,
    drives: drivesWithBranches
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/drives/:id — Single drive (role-aware)
// ─────────────────────────────────────────────────────────────────────────────
const getDriveById = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT pd.*,
            c.company_name, c.industry, c.website, c.is_approved AS company_approved,
            u.email AS company_email
     FROM placement_drives pd
     JOIN companies c ON c.id  = pd.company_id
     JOIN users u     ON u.id  = c.user_id
     WHERE pd.id = ?`,
    [req.params.id]
  );
  const drive = rows[0];
  if (!drive) {
    res.status(404);
    throw new Error('Placement drive not found.');
  }

  // Students only see approved/active drives
  if (req.user.role === 'student') {
    if (!['approved', 'active'].includes(drive.status)) {
      res.status(404);
      throw new Error('Placement drive not found.');
    }
  }

  // A company can only view its own drive (unless admin)
  if (req.user.role === 'company') {
    const company = await getCompanyForUser(req.user.id);
    if (!company || company.id !== drive.company_id) {
      res.status(403);
      throw new Error('You do not have permission to view this drive.');
    }
  }

  const branches = await getDriveBranches(drive.id);
  return successResponse(res, 200, 'Drive fetched.', {
    drive: { ...drive, eligible_branches: branches }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/drives/:id — Company updates its own drive
// ─────────────────────────────────────────────────────────────────────────────
const updateDrive = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT * FROM placement_drives WHERE id = ?',
    [req.params.id]
  );
  const drive = rows[0];
  if (!drive) {
    res.status(404);
    throw new Error('Placement drive not found.');
  }

  const company = await getCompanyForUser(req.user.id);
  if (!company || company.id !== drive.company_id) {
    res.status(403);
    throw new Error('You do not have permission to edit this drive.');
  }

  // Can only edit drives in editable states
  const editableStatuses = ['draft', 'pending_approval'];
  if (!editableStatuses.includes(drive.status)) {
    res.status(400);
    throw new Error(`Drive cannot be edited in '${drive.status}' status. Only draft or pending_approval drives can be modified.`);
  }

  const { errors, cleaned } = validateDrivePayload(req.body, true);
  if (errors.length > 0) {
    res.status(400);
    throw new Error(errors.join(' '));
  }

  // Build update query from whitelisted changed fields
  const fieldsToUpdate = UPDATABLE_DRIVE_FIELDS.filter((f) => cleaned[f] !== undefined);
  if (fieldsToUpdate.length === 0 && !cleaned.eligible_branches) {
    res.status(400);
    throw new Error('No updatable fields provided.');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (fieldsToUpdate.length > 0) {
      const setClause = fieldsToUpdate.map((f) => `${f} = ?`).join(', ');
      const values = fieldsToUpdate.map((f) => cleaned[f]);
      values.push(drive.id);
      await conn.execute(
        `UPDATE placement_drives SET ${setClause} WHERE id = ?`,
        values
      );
    }

    if (cleaned.eligible_branches) {
      await replaceDriveBranches(conn, drive.id, cleaned.eligible_branches);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const [updatedRows] = await pool.execute(
    'SELECT * FROM placement_drives WHERE id = ?',
    [drive.id]
  );
  const branches = await getDriveBranches(drive.id);
  return successResponse(res, 200, 'Drive updated.', {
    drive: { ...updatedRows[0], eligible_branches: branches }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/drives/:id — Company deletes a draft drive
// ─────────────────────────────────────────────────────────────────────────────
const deleteDrive = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT * FROM placement_drives WHERE id = ?',
    [req.params.id]
  );
  const drive = rows[0];
  if (!drive) {
    res.status(404);
    throw new Error('Placement drive not found.');
  }

  const company = await getCompanyForUser(req.user.id);
  if (!company || company.id !== drive.company_id) {
    res.status(403);
    throw new Error('You do not have permission to delete this drive.');
  }

  if (drive.status !== 'draft') {
    res.status(400);
    throw new Error('Only draft drives can be deleted. Submitted drives must be closed by an admin.');
  }

  await pool.execute('DELETE FROM placement_drives WHERE id = ?', [drive.id]);
  return successResponse(res, 200, 'Drive deleted.');
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin status management helpers
// ─────────────────────────────────────────────────────────────────────────────

async function setDriveStatus(req, res, newStatus, notificationTitle, notificationMsg) {
  const [rows] = await pool.execute(
    `SELECT pd.*, c.user_id AS company_user_id, c.company_name
     FROM placement_drives pd
     JOIN companies c ON c.id = pd.company_id
     WHERE pd.id = ?`,
    [req.params.id]
  );
  const drive = rows[0];
  if (!drive) {
    res.status(404);
    throw new Error('Placement drive not found.');
  }

  await pool.execute(
    'UPDATE placement_drives SET status = ? WHERE id = ?',
    [newStatus, drive.id]
  );

  const msg = typeof notificationMsg === 'function'
    ? notificationMsg(drive)
    : notificationMsg;

  await notify(drive.company_user_id, notificationTitle, msg);

  const [updatedRows] = await pool.execute(
    'SELECT * FROM placement_drives WHERE id = ?',
    [drive.id]
  );
  const branches = await getDriveBranches(drive.id);
  return successResponse(res, 200, `Drive ${newStatus}.`, {
    drive: { ...updatedRows[0], eligible_branches: branches }
  });
}

/**
 * PATCH /api/drives/:id/approve — Admin approves a drive
 */
const approveDrive = asyncHandler(async (req, res) => {
  return setDriveStatus(req, res, 'approved', 'Drive Approved',
    (d) => `Your placement drive "${d.title}" has been approved by the placement office and is now visible to students.`
  );
});

/**
 * PATCH /api/drives/:id/reject — Admin rejects a drive
 */
const rejectDrive = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  return setDriveStatus(req, res, 'rejected', 'Drive Rejected',
    (d) => `Your placement drive "${d.title}" has been rejected by the placement office.${reason ? ' Reason: ' + reason : ''}`
  );
});

/**
 * PATCH /api/drives/:id/close — Admin closes a drive
 */
const closeDrive = asyncHandler(async (req, res) => {
  return setDriveStatus(req, res, 'closed', 'Drive Closed',
    (d) => `Your placement drive "${d.title}" has been closed by the placement office.`
  );
});

/**
 * PATCH /api/drives/:id/status — Unified drive status update endpoint
 */
const updateDriveStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (status === 'approved') return approveDrive(req, res);
  if (status === 'rejected') return rejectDrive(req, res);
  if (status === 'closed') return closeDrive(req, res);
  res.status(400);
  throw new Error('Invalid status. Allowed: approved, rejected, closed.');
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/drives/:id/eligibility — Student checks own eligibility for a drive
// (Phase 7 — calls eligibilityService)
// ─────────────────────────────────────────────────────────────────────────────
const checkEligibility = asyncHandler(async (req, res) => {
  const { checkEligibility: runCheck } = require('../services/eligibilityService');

  // 1. Load drive + branches
  const [driveRows] = await pool.execute(
    'SELECT * FROM placement_drives WHERE id = ?',
    [req.params.id]
  );
  const drive = driveRows[0];
  if (!drive) {
    res.status(404);
    throw new Error('Placement drive not found.');
  }
  if (!['approved', 'active'].includes(drive.status)) {
    res.status(400);
    throw new Error('Eligibility can only be checked for approved or active drives.');
  }

  drive.eligible_branches = await getDriveBranches(drive.id);

  // 2. Load student + skills
  const [studentRows] = await pool.execute(
    'SELECT * FROM students WHERE user_id = ?',
    [req.user.id]
  );
  const student = studentRows[0];
  if (!student) {
    res.status(404);
    throw new Error('Student profile not found. Please complete your profile first.');
  }

  const [skillRows] = await pool.execute(
    'SELECT skill_name FROM student_skills WHERE student_id = ?',
    [student.id]
  );
  student.skills = skillRows.map((r) => r.skill_name);

  // 3. Run the eligibility engine
  const result = runCheck(student, drive);

  return successResponse(res, 200, 'Eligibility result.', result);
});

module.exports = {
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
};
