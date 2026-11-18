/**
 * interviewController.js — Phase 9 (Interview Module)
 */
const { pool } = require('../config/db');
const { successResponse } = require('../utils/response');
const asyncHandler = require('../middleware/asyncHandler');
const { createNotification } = require('./notificationController');

async function getCompanyId(userId) {
  const [rows] = await pool.execute('SELECT id FROM companies WHERE user_id = ?', [userId]);
  return rows[0]?.id;
}

// ── POST /api/interviews/drives/:id/rounds (Company)
const createRound = asyncHandler(async (req, res) => {
  const { id: driveId } = req.params;
  const { round_number, round_name, scheduled_date } = req.body;
  const companyId = await getCompanyId(req.user.id);

  if (!round_number || !round_name) {
    res.status(400);
    throw new Error('round_number and round_name are required.');
  }

  const [driveRows] = await pool.execute('SELECT company_id FROM placement_drives WHERE id = ?', [driveId]);
  if (!driveRows.length || driveRows[0].company_id !== companyId) {
    res.status(403);
    throw new Error('Unauthorized or drive not found.');
  }

  try {
    const [result] = await pool.execute(
      'INSERT INTO interview_rounds (drive_id, round_number, round_name, scheduled_date) VALUES (?, ?, ?, ?)',
      [driveId, Number(round_number), round_name.trim(), scheduled_date || null]
    );

    return successResponse(res, 201, 'Interview round created.', {
      round: { id: result.insertId, drive_id: driveId, round_number, round_name, scheduled_date }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409);
      throw new Error(`Round number ${round_number} already exists for this drive.`);
    }
    throw err;
  }
});

// ── GET /api/interviews/drives/:id/rounds (Company / Student)
const getDriveRounds = asyncHandler(async (req, res) => {
  const [rounds] = await pool.execute(
    'SELECT * FROM interview_rounds WHERE drive_id = ? ORDER BY round_number ASC',
    [req.params.id]
  );
  return successResponse(res, 200, 'Rounds fetched.', { rounds });
});

// ── GET /api/interviews/drives/:id/results (Company)
const getDriveResults = asyncHandler(async (req, res) => {
  const { id: driveId } = req.params;
  const companyId = await getCompanyId(req.user.id);

  const [driveRows] = await pool.execute('SELECT company_id FROM placement_drives WHERE id = ?', [driveId]);
  if (!driveRows.length || driveRows[0].company_id !== companyId) {
    res.status(403);
    throw new Error('Unauthorized or drive not found.');
  }

  const [results] = await pool.execute(`
    SELECT ir.id as result_id, ir.application_id, ir.round_id, ir.status, ir.feedback, ir.interviewer_name, ir.updated_at,
           r.round_number, r.round_name, r.scheduled_date,
           s.id as student_id, s.roll_number, s.branch, s.cgpa, s.resume_url,
           u.name as student_name, u.email as student_email
    FROM interview_results ir
    JOIN interview_rounds r ON ir.round_id = r.id
    JOIN applications a ON ir.application_id = a.id
    JOIN students s ON a.student_id = s.id
    JOIN users u ON s.user_id = u.id
    WHERE r.drive_id = ?
    ORDER BY r.round_number ASC, ir.updated_at DESC
  `, [driveId]);

  return successResponse(res, 200, 'Interview results fetched.', { results });
});

// ── POST /api/interviews/schedule (Company)
const scheduleInterview = asyncHandler(async (req, res) => {
  const { application_id, round_id } = req.body;
  const companyId = await getCompanyId(req.user.id);

  if (!application_id || !round_id) {
    res.status(400);
    throw new Error('application_id and round_id are required.');
  }

  const [appRows] = await pool.execute(`
    SELECT a.student_id, a.drive_id, pd.title as drive_title, s.user_id as student_user_id, pd.company_id
    FROM applications a
    JOIN placement_drives pd ON a.drive_id = pd.id
    JOIN students s ON a.student_id = s.id
    WHERE a.id = ?
  `, [application_id]);

  if (!appRows.length || appRows[0].company_id !== companyId) {
    res.status(403);
    throw new Error('Unauthorized or application not found.');
  }

  const [roundRows] = await pool.execute('SELECT * FROM interview_rounds WHERE id = ?', [round_id]);
  if (!roundRows.length || roundRows[0].drive_id !== appRows[0].drive_id) {
    res.status(400);
    throw new Error('Selected round does not belong to this drive.');
  }

  // Check if result already exists
  const [existing] = await pool.execute(
    'SELECT id FROM interview_results WHERE application_id = ? AND round_id = ?',
    [application_id, round_id]
  );

  if (existing.length > 0) {
    res.status(409);
    throw new Error('Interview for this round is already scheduled.');
  }

  await pool.execute(
    'INSERT INTO interview_results (application_id, round_id, status) VALUES (?, ?, ?)',
    [application_id, round_id, 'scheduled']
  );

  // Update application status
  await pool.execute('UPDATE applications SET status = ? WHERE id = ?', ['interview_scheduled', application_id]);

  // Notify student
  await createNotification(
    appRows[0].student_user_id,
    'Interview Scheduled',
    `An interview for ${roundRows[0].round_name} (Round ${roundRows[0].round_number}) has been scheduled for "${appRows[0].drive_title}".`
  );

  return successResponse(res, 201, 'Interview scheduled successfully.');
});

// ── PATCH /api/interviews/results/:id (Company)
const updateResult = asyncHandler(async (req, res) => {
  const { id } = req.params; // interview_results.id
  const { status, feedback, interviewer_name } = req.body; // pass, fail, absent

  const validStatuses = ['scheduled', 'pass', 'fail', 'absent'];
  if (!validStatuses.includes(status)) {
    res.status(400);
    throw new Error(`status must be one of: ${validStatuses.join(', ')}`);
  }

  const [resRows] = await pool.execute(`
    SELECT ir.application_id, ir.round_id, a.student_id, pd.company_id, pd.title as drive_title,
           s.user_id as student_user_id, r.round_name, r.round_number
    FROM interview_results ir
    JOIN interview_rounds r ON ir.round_id = r.id
    JOIN applications a ON ir.application_id = a.id
    JOIN placement_drives pd ON a.drive_id = pd.id
    JOIN students s ON a.student_id = s.id
    WHERE ir.id = ?
  `, [id]);

  if (!resRows.length || resRows[0].company_id !== await getCompanyId(req.user.id)) {
    res.status(403);
    throw new Error('Unauthorized or interview result not found.');
  }

  await pool.execute(
    'UPDATE interview_results SET status = ?, feedback = ?, interviewer_name = ? WHERE id = ?',
    [status, feedback || null, interviewer_name || null, id]
  );

  // Notify student of outcome
  if (status === 'pass') {
    await createNotification(
      resRows[0].student_user_id,
      'Interview Cleared!',
      `Congratulations! You cleared Round ${resRows[0].round_number} (${resRows[0].round_name}) for "${resRows[0].drive_title}".`
    );
  } else if (status === 'fail') {
    await createNotification(
      resRows[0].student_user_id,
      'Interview Update',
      `Result for Round ${resRows[0].round_number} (${resRows[0].round_name}) for "${resRows[0].drive_title}": Not cleared.`
    );
  }

  return successResponse(res, 200, 'Interview result updated.');
});

// ── GET /api/interviews/my (Student)
const getMyInterviews = asyncHandler(async (req, res) => {
  const [studentRows] = await pool.execute('SELECT id FROM students WHERE user_id = ?', [req.user.id]);
  if (!studentRows.length) {
    res.status(404);
    throw new Error('Profile not found.');
  }

  const [interviews] = await pool.execute(`
    SELECT ir.id as result_id, ir.status, ir.feedback, ir.interviewer_name, ir.updated_at,
           r.round_name, r.round_number, r.scheduled_date,
           pd.id as drive_id, pd.title as drive_title, pd.location,
           c.company_name
    FROM interview_results ir
    JOIN interview_rounds r ON ir.round_id = r.id
    JOIN applications a ON ir.application_id = a.id
    JOIN placement_drives pd ON a.drive_id = pd.id
    JOIN companies c ON pd.company_id = c.id
    WHERE a.student_id = ?
    ORDER BY r.scheduled_date DESC, ir.updated_at DESC
  `, [studentRows[0].id]);

  return successResponse(res, 200, 'Interviews fetched.', { interviews });
});

module.exports = {
  createRound,
  getDriveRounds,
  getDriveResults,
  scheduleInterview,
  updateResult,
  getMyInterviews
};
