const { pool } = require('../config/db');
const { successResponse } = require('../utils/response');
const asyncHandler = require('../middleware/asyncHandler');
const {
  isValidCGPA,
  isValidPercentage,
  isNonNegativeInteger,
  isValidPassingYear
} = require('../utils/validation');

// Fields a student is allowed to edit about themselves
const EDITABLE_PROFILE_FIELDS = [
  'course', 'branch', 'degree', 'batch_year', 'passing_year',
  'cgpa', 'backlog_count', 'tenth_percentage', 'twelfth_percentage',
  'gender', 'dob', 'address'
];

async function getStudentByUserId(userId) {
  const [rows] = await pool.execute('SELECT * FROM students WHERE user_id = ?', [userId]);
  return rows[0] || null;
}

async function attachSkillsProjectsCertifications(student) {
  const [skills] = await pool.execute(
    'SELECT id, skill_name FROM student_skills WHERE student_id = ? ORDER BY skill_name ASC',
    [student.id]
  );
  const [projects] = await pool.execute(
    'SELECT id, title, description, tech_stack, project_url, created_at FROM student_projects WHERE student_id = ? ORDER BY created_at DESC',
    [student.id]
  );
  const [certifications] = await pool.execute(
    'SELECT id, title, issuing_organization, issue_date, credential_url, created_at FROM student_certifications WHERE student_id = ? ORDER BY issue_date DESC',
    [student.id]
  );
  return { ...student, skills, projects, certifications };
}

/**
 * GET /api/students/me
 */
const getMyProfile = asyncHandler(async (req, res) => {
  const student = await getStudentByUserId(req.user.id);
  if (!student) {
    res.status(404);
    throw new Error('Student profile not found.');
  }
  const fullProfile = await attachSkillsProjectsCertifications(student);

  // Also include user-level contact info (name, email, phone)
  const [userRows] = await pool.execute('SELECT name, email, phone FROM users WHERE id = ?', [req.user.id]);
  const user = userRows[0] || {};

  return successResponse(res, 200, 'Profile fetched.', {
    student: { ...fullProfile, name: user.name, email: user.email, phone: user.phone }
  });
});

/**
 * PUT /api/students/me
 * Partial update — only whitelisted fields present in the body are changed.
 */
const updateMyProfile = asyncHandler(async (req, res) => {
  const student = await getStudentByUserId(req.user.id);
  if (!student) {
    res.status(404);
    throw new Error('Student profile not found.');
  }

  // Update user name / phone if provided
  if (req.body.name || req.body.phone !== undefined) {
    const userUpdates = [];
    const userVals = [];
    if (req.body.name && String(req.body.name).trim()) {
      userUpdates.push('name = ?');
      userVals.push(String(req.body.name).trim());
    }
    if (req.body.phone !== undefined) {
      userUpdates.push('phone = ?');
      userVals.push(req.body.phone || null);
    }
    if (userUpdates.length > 0) {
      userVals.push(req.user.id);
      await pool.execute(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`, userVals);
    }
  }

  const updates = EDITABLE_PROFILE_FIELDS.filter((field) => req.body[field] !== undefined);
  if (updates.length === 0 && !req.body.name && req.body.phone === undefined) {
    res.status(400);
    throw new Error(`No editable fields provided. Allowed: ${EDITABLE_PROFILE_FIELDS.join(', ')}.`);
  }

  // Validations
  if (req.body.cgpa !== undefined) {
    if (!isValidCGPA(req.body.cgpa)) {
      res.status(400);
      throw new Error('cgpa must be a number between 0 and 10.');
    }
  }
  if (req.body.backlog_count !== undefined) {
    if (!isNonNegativeInteger(req.body.backlog_count)) {
      res.status(400);
      throw new Error('backlog_count must be a non-negative integer.');
    }
  }
  if (req.body.tenth_percentage !== undefined && req.body.tenth_percentage !== null) {
    if (!isValidPercentage(req.body.tenth_percentage)) {
      res.status(400);
      throw new Error('tenth_percentage must be between 0 and 100.');
    }
  }
  if (req.body.twelfth_percentage !== undefined && req.body.twelfth_percentage !== null) {
    if (!isValidPercentage(req.body.twelfth_percentage)) {
      res.status(400);
      throw new Error('twelfth_percentage must be between 0 and 100.');
    }
  }
  if (req.body.passing_year !== undefined && req.body.passing_year !== null && req.body.passing_year !== '') {
    if (!isValidPassingYear(req.body.passing_year)) {
      res.status(400);
      throw new Error('passing_year must be a valid 4-digit year.');
    }
  }

  if (updates.length > 0) {
    const setClause = updates.map((field) => `${field} = ?`).join(', ');
    const values = updates.map((field) => {
      const val = req.body[field];
      if (val === '' || val === undefined) return null;
      return val;
    });
    values.push(student.id);

    await pool.execute(`UPDATE students SET ${setClause} WHERE id = ?`, values);
  }

  const updated = await getStudentByUserId(req.user.id);
  const fullProfile = await attachSkillsProjectsCertifications(updated);

  const [userRows] = await pool.execute('SELECT name, email, phone FROM users WHERE id = ?', [req.user.id]);
  const user = userRows[0] || {};

  return successResponse(res, 200, 'Profile updated successfully.', {
    student: { ...fullProfile, name: user.name, email: user.email, phone: user.phone }
  });
});

/**
 * POST /api/students/me/skills
 * body: { skill_name }
 */
const addSkill = asyncHandler(async (req, res) => {
  const { skill_name } = req.body;
  if (!skill_name || !skill_name.trim()) {
    res.status(400);
    throw new Error('skill_name is required.');
  }

  const student = await getStudentByUserId(req.user.id);
  if (!student) {
    res.status(404);
    throw new Error('Student profile not found.');
  }

  try {
    const [result] = await pool.execute(
      'INSERT INTO student_skills (student_id, skill_name) VALUES (?, ?)',
      [student.id, skill_name.trim()]
    );
    return successResponse(res, 201, 'Skill added.', {
      skill: { id: result.insertId, skill_name: skill_name.trim() }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409);
      throw new Error('This skill is already on your profile.');
    }
    throw err;
  }
});

/**
 * DELETE /api/students/me/skills/:skillId
 */
const removeSkill = asyncHandler(async (req, res) => {
  const student = await getStudentByUserId(req.user.id);
  if (!student) {
    res.status(404);
    throw new Error('Student profile not found.');
  }

  const [result] = await pool.execute(
    'DELETE FROM student_skills WHERE id = ? AND student_id = ?',
    [req.params.skillId, student.id]
  );

  if (result.affectedRows === 0) {
    res.status(404);
    throw new Error('Skill not found on your profile.');
  }
  return successResponse(res, 200, 'Skill removed.');
});

/**
 * POST /api/students/me/projects
 * body: { title, description?, tech_stack?, project_url? }
 */
const addProject = asyncHandler(async (req, res) => {
  const { title, description, tech_stack, project_url } = req.body;
  if (!title || !title.trim()) {
    res.status(400);
    throw new Error('title is required.');
  }

  const student = await getStudentByUserId(req.user.id);
  if (!student) {
    res.status(404);
    throw new Error('Student profile not found.');
  }

  const [result] = await pool.execute(
    `INSERT INTO student_projects (student_id, title, description, tech_stack, project_url)
     VALUES (?, ?, ?, ?, ?)`,
    [student.id, title.trim(), description || null, tech_stack || null, project_url || null]
  );

  return successResponse(res, 201, 'Project added.', {
    project: { id: result.insertId, title: title.trim(), description, tech_stack, project_url }
  });
});

/**
 * DELETE /api/students/me/projects/:projectId
 */
const removeProject = asyncHandler(async (req, res) => {
  const student = await getStudentByUserId(req.user.id);
  if (!student) {
    res.status(404);
    throw new Error('Student profile not found.');
  }

  const [result] = await pool.execute(
    'DELETE FROM student_projects WHERE id = ? AND student_id = ?',
    [req.params.projectId, student.id]
  );

  if (result.affectedRows === 0) {
    res.status(404);
    throw new Error('Project not found on your profile.');
  }
  return successResponse(res, 200, 'Project removed.');
});

/**
 * POST /api/students/me/certifications
 * body: { title, issuing_organization?, issue_date?, credential_url? }
 */
const addCertification = asyncHandler(async (req, res) => {
  const { title, issuing_organization, issue_date, credential_url } = req.body;
  if (!title || !title.trim()) {
    res.status(400);
    throw new Error('title is required.');
  }

  const student = await getStudentByUserId(req.user.id);
  if (!student) {
    res.status(404);
    throw new Error('Student profile not found.');
  }

  const [result] = await pool.execute(
    `INSERT INTO student_certifications (student_id, title, issuing_organization, issue_date, credential_url)
     VALUES (?, ?, ?, ?, ?)`,
    [student.id, title.trim(), issuing_organization || null, issue_date || null, credential_url || null]
  );

  return successResponse(res, 201, 'Certification added.', {
    certification: { id: result.insertId, title: title.trim(), issuing_organization, issue_date, credential_url }
  });
});

/**
 * DELETE /api/students/me/certifications/:certificationId
 */
const removeCertification = asyncHandler(async (req, res) => {
  const student = await getStudentByUserId(req.user.id);
  if (!student) {
    res.status(404);
    throw new Error('Student profile not found.');
  }

  const [result] = await pool.execute(
    'DELETE FROM student_certifications WHERE id = ? AND student_id = ?',
    [req.params.certificationId, student.id]
  );

  if (result.affectedRows === 0) {
    res.status(404);
    throw new Error('Certification not found on your profile.');
  }
  return successResponse(res, 200, 'Certification removed.');
});

/**
 * POST /api/students/me/resume
 */
const uploadMyResume = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('No file uploaded. Use the "resume" form field with a PDF/DOC/DOCX file.');
  }

  const student = await getStudentByUserId(req.user.id);
  if (!student) {
    res.status(404);
    throw new Error('Student profile not found.');
  }

  const resumeUrl = `/uploads/resumes/${req.file.filename}`;
  await pool.execute('UPDATE students SET resume_url = ? WHERE id = ?', [resumeUrl, student.id]);

  return successResponse(res, 200, 'Resume uploaded.', { resume_url: resumeUrl });
});

async function insertNotification(userId, title, message) {
  await pool.execute(
    'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
    [userId, title, message]
  );
}

/**
 * GET /api/students
 * Admin directory with optional filters: ?branch=&batch_year=&min_cgpa=&verification_status=
 */
const listStudents = asyncHandler(async (req, res) => {
  const { branch, batch_year, min_cgpa, search, verification_status } = req.query;
  const conditions = [];
  const values = [];

  if (branch) {
    conditions.push('s.branch = ?');
    values.push(branch);
  }
  if (batch_year) {
    conditions.push('s.batch_year = ?');
    values.push(batch_year);
  }
  if (min_cgpa) {
    conditions.push('s.cgpa >= ?');
    values.push(Number(min_cgpa));
  }
  if (verification_status) {
    conditions.push('s.verification_status = ?');
    values.push(verification_status);
  }
  if (search) {
    conditions.push('(u.name LIKE ? OR s.roll_number LIKE ? OR u.email LIKE ? OR s.course LIKE ? OR s.degree LIKE ?)');
    values.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.execute(
    `SELECT s.id, s.roll_number, s.course, s.branch, s.degree, s.batch_year, s.passing_year,
            s.cgpa, s.backlog_count, s.tenth_percentage, s.twelfth_percentage, s.resume_url,
            s.verification_status, s.rejection_reason, s.created_at,
            u.id AS user_id, u.name, u.email, u.phone,
            (SELECT COUNT(*) FROM applications a WHERE a.student_id = s.id) AS applications_count,
            (SELECT COUNT(*) FROM selections sel JOIN applications a2 ON sel.application_id = a2.id WHERE a2.student_id = s.id AND sel.status = 'accepted') AS offers_accepted
     FROM students s
     JOIN users u ON u.id = s.user_id
     ${whereClause}
     ORDER BY FIELD(s.verification_status, 'pending', 'rejected', 'approved') ASC, s.created_at DESC`,
    values
  );

  return successResponse(res, 200, 'Students fetched.', { count: rows.length, students: rows });
});

/**
 * GET /api/students/:id
 * Admin-only single student full profile
 */
const getStudentById = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT s.*, u.name, u.email, u.phone
     FROM students s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
    [req.params.id]
  );
  const student = rows[0];
  if (!student) {
    res.status(404);
    throw new Error('Student not found.');
  }
  const fullProfile = await attachSkillsProjectsCertifications(student);
  return successResponse(res, 200, 'Student fetched.', { student: fullProfile });
});

/**
 * PATCH /api/students/:id/approve — Admin approves student registration
 */
const approveStudent = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM students WHERE id = ?', [req.params.id]);
  const student = rows[0];
  if (!student) {
    res.status(404);
    throw new Error('Student not found.');
  }

  await pool.execute(
    "UPDATE students SET verification_status = 'approved', rejection_reason = NULL WHERE id = ?",
    [student.id]
  );

  await insertNotification(
    student.user_id,
    'Student Account Approved',
    'Your student profile has been verified and approved by the Training & Placement Office. You now have full access to view and apply for placement drives.'
  );

  const [updated] = await pool.execute(
    'SELECT s.*, u.name, u.email, u.phone FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?',
    [student.id]
  );
  return successResponse(res, 200, 'Student approved successfully.', { student: updated[0] });
});

/**
 * PATCH /api/students/:id/reject — Admin rejects student registration
 */
const rejectStudent = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM students WHERE id = ?', [req.params.id]);
  const student = rows[0];
  if (!student) {
    res.status(404);
    throw new Error('Student not found.');
  }

  const { reason } = req.body;
  const rejectionReason = reason ? String(reason).trim() : 'Registration details could not be verified by the placement office.';

  await pool.execute(
    "UPDATE students SET verification_status = 'rejected', rejection_reason = ? WHERE id = ?",
    [rejectionReason, student.id]
  );

  await insertNotification(
    student.user_id,
    'Student Verification Rejected',
    `Your student registration was rejected by the Training & Placement Office. Reason: ${rejectionReason}`
  );

  const [updated] = await pool.execute(
    'SELECT s.*, u.name, u.email, u.phone FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?',
    [student.id]
  );
  return successResponse(res, 200, 'Student registration rejected.', { student: updated[0] });
});

/**
 * PATCH /api/students/:id/verification — Unified endpoint
 */
const updateStudentVerification = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (status === 'approved') {
    return approveStudent(req, res);
  } else if (status === 'rejected') {
    return rejectStudent(req, res);
  } else {
    res.status(400);
    throw new Error("Invalid verification status. Must be 'approved' or 'rejected'.");
  }
});

/**
 * GET /api/students/recommended-drives
 */
const getRecommendedDrives = asyncHandler(async (req, res) => {
  const { checkEligibility } = require('../services/eligibilityService');

  const student = await getStudentByUserId(req.user.id);
  if (!student) {
    res.status(404);
    throw new Error('Student profile not found. Please complete your profile first.');
  }

  const [skillRows] = await pool.execute(
    'SELECT skill_name FROM student_skills WHERE student_id = ?',
    [student.id]
  );
  student.skills = skillRows.map((r) => r.skill_name);

  // Fetch all approved/active drives
  const [drives] = await pool.execute(
    `SELECT pd.*,
            c.company_name, c.industry, c.website
     FROM placement_drives pd
     JOIN companies c ON c.id = pd.company_id
     WHERE pd.status IN ('approved', 'active')
     ORDER BY pd.application_deadline ASC`
  );

  const results = [];

  for (const drive of drives) {
    const [branchRows] = await pool.execute(
      'SELECT branch FROM drive_eligible_branches WHERE drive_id = ?',
      [drive.id]
    );
    drive.eligible_branches = branchRows.map((r) => r.branch);

    const eligibility = checkEligibility(student, drive);

    if (eligibility.eligible) {
      results.push({
        drive: {
          ...drive,
          eligible_branches: drive.eligible_branches
        },
        eligibility
      });
    }
  }

  // Rank: skill match % descending, then deadline ascending
  results.sort((a, b) => {
    const skillDiff = (b.eligibility.skillMatchPercentage || 0) - (a.eligibility.skillMatchPercentage || 0);
    if (skillDiff !== 0) return skillDiff;
    const aDeadline = a.drive.application_deadline ? new Date(a.drive.application_deadline) : new Date('9999-12-31');
    const bDeadline = b.drive.application_deadline ? new Date(b.drive.application_deadline) : new Date('9999-12-31');
    return aDeadline - bDeadline;
  });

  return successResponse(res, 200, 'Recommended drives fetched.', {
    count: results.length,
    recommended_drives: results
  });
});

module.exports = {
  getMyProfile,
  updateMyProfile,
  addSkill,
  removeSkill,
  addProject,
  removeProject,
  addCertification,
  removeCertification,
  uploadMyResume,
  listStudents,
  getStudentById,
  approveStudent,
  rejectStudent,
  updateStudentVerification,
  getRecommendedDrives
};
