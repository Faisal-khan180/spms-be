const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { generateToken } = require('../utils/jwt');
const { successResponse } = require('../utils/response');
const { isValidEmail, isValidPassword } = require('../utils/validation');
const asyncHandler = require('../middleware/asyncHandler');

const SALT_ROUNDS = 10;

/**
 * POST /api/auth/register
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role, phone } = req.body;

  if (!name || !email || !password || !role) {
    res.status(400);
    throw new Error('name, email, password and role are required.');
  }
  if (!isValidEmail(email)) {
    res.status(400);
    throw new Error('Please provide a valid email address.');
  }
  if (!isValidPassword(password)) {
    res.status(400);
    throw new Error('Password must be at least 8 characters long.');
  }
  if (!['student', 'company'].includes(role)) {
    res.status(400);
    throw new Error("role must be 'student' or 'company'.");
  }

  // Role-specific required fields
  if (role === 'student') {
    const {
      roll_number, branch, course, degree, batch_year, passing_year,
      cgpa, backlog_count, tenth_percentage, twelfth_percentage
    } = req.body;

    if (!phone || !String(phone).trim()) {
      res.status(400);
      throw new Error('Phone number is required for student registration.');
    }
    if (!roll_number || !String(roll_number).trim()) {
      res.status(400);
      throw new Error('Roll Number is required.');
    }
    if (!branch || !String(branch).trim()) {
      res.status(400);
      throw new Error('Branch is required.');
    }
    if (!course || !String(course).trim()) {
      res.status(400);
      throw new Error('Course is required (e.g. B.Tech, MCA).');
    }
    if (!degree || !String(degree).trim()) {
      res.status(400);
      throw new Error('Degree is required.');
    }
    if (batch_year === undefined || batch_year === null || batch_year === '') {
      res.status(400);
      throw new Error('Batch Year is required.');
    }
    if (passing_year === undefined || passing_year === null || passing_year === '') {
      res.status(400);
      throw new Error('Passing Year is required.');
    }
    if (cgpa === undefined || cgpa === null || cgpa === '' || isNaN(cgpa) || Number(cgpa) < 0 || Number(cgpa) > 10) {
      res.status(400);
      throw new Error('Valid Current CGPA (between 0.00 and 10.00) is required.');
    }
    if (backlog_count === undefined || backlog_count === null || backlog_count === '' || isNaN(backlog_count) || Number(backlog_count) < 0) {
      res.status(400);
      throw new Error('Active Backlogs count (0 or higher) is required.');
    }
    if (tenth_percentage === undefined || tenth_percentage === null || tenth_percentage === '' || isNaN(tenth_percentage) || Number(tenth_percentage) < 0 || Number(tenth_percentage) > 100) {
      res.status(400);
      throw new Error('Valid 10th Percentage (between 0.00 and 100.00) is required.');
    }
    if (twelfth_percentage === undefined || twelfth_percentage === null || twelfth_percentage === '' || isNaN(twelfth_percentage) || Number(twelfth_percentage) < 0 || Number(twelfth_percentage) > 100) {
      res.status(400);
      throw new Error('Valid 12th / Diploma Percentage (between 0.00 and 100.00) is required.');
    }

    // Explicit unique check for roll_number
    const [existingRoll] = await pool.execute('SELECT id FROM students WHERE LOWER(roll_number) = LOWER(?)', [String(roll_number).trim()]);
    if (existingRoll.length > 0) {
      res.status(409);
      throw new Error(`A student with Roll Number '${String(roll_number).trim()}' is already registered.`);
    }
  }

  if (role === 'company') {
    if (!req.body.company_name || !String(req.body.company_name).trim()) {
      res.status(400);
      throw new Error('Company registration requires company_name.');
    }
  }

  // Pre-check email uniqueness
  const [existingEmail] = await pool.execute('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email.trim().toLowerCase()]);
  if (existingEmail.length > 0) {
    res.status(409);
    throw new Error(`An account with email '${email.trim().toLowerCase()}' is already registered.`);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const [userResult] = await connection.execute(
      `INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), email.trim().toLowerCase(), passwordHash, role, phone ? String(phone).trim() : null]
    );
    const userId = userResult.insertId;

    if (role === 'student') {
      const {
        roll_number, course, branch, degree, batch_year, passing_year,
        cgpa, backlog_count, tenth_percentage, twelfth_percentage
      } = req.body;

      await connection.execute(
        `INSERT INTO students
           (user_id, roll_number, course, branch, degree, batch_year, passing_year,
            cgpa, backlog_count, tenth_percentage, twelfth_percentage, verification_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          userId,
          String(roll_number).trim().toUpperCase(),
          String(course).trim(),
          String(branch).trim(),
          String(degree).trim(),
          Number(batch_year),
          Number(passing_year),
          Number(cgpa),
          Number(backlog_count),
          Number(tenth_percentage),
          Number(twelfth_percentage)
        ]
      );
    } else {
      const { company_name, industry, website, description, hr_contact_name, hr_contact_phone } = req.body;
      await connection.execute(
        `INSERT INTO companies
           (user_id, company_name, industry, website, description, hr_contact_name, hr_contact_phone)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          company_name.trim(),
          industry || null,
          website || null,
          description || null,
          hr_contact_name || name.trim(),
          hr_contact_phone || phone || null
        ]
      );
    }

    await connection.commit();

    const token = generateToken({ id: userId, role });
    return successResponse(res, 201, 'Registration successful. Account submitted for verification.', {
      token,
      user: {
        id: userId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        verification_status: role === 'student' ? 'pending' : undefined
      }
    });
  } catch (err) {
    await connection.rollback();

    if (err.code === 'ER_DUP_ENTRY') {
      let message = 'A record with these details already exists.';
      if (err.sqlMessage && err.sqlMessage.includes('roll_number')) {
        message = 'This roll number is already registered.';
      } else if (err.sqlMessage && err.sqlMessage.includes('email')) {
        message = 'This email is already registered.';
      }
      res.status(409);
      throw new Error(message);
    }
    throw err;
  } finally {
    connection.release();
  }
});

/**
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error('email and password are required.');
  }

  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
  const user = rows[0];

  const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!user || !passwordMatches) {
    res.status(401);
    throw new Error('Invalid email or password.');
  }

  if (!user.is_active) {
    res.status(403);
    throw new Error('This account has been deactivated. Contact the placement office.');
  }

  let profile = null;
  if (user.role === 'student') {
    const [studentRows] = await pool.execute('SELECT * FROM students WHERE user_id = ?', [user.id]);
    profile = studentRows[0] || null;
  } else if (user.role === 'company') {
    const [companyRows] = await pool.execute('SELECT * FROM companies WHERE user_id = ?', [user.id]);
    profile = companyRows[0] || null;
  }

  const token = generateToken({ id: user.id, role: user.role });
  return successResponse(res, 200, 'Login successful.', {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      verification_status: profile?.verification_status || (user.role === 'student' ? 'pending' : undefined),
      rejection_reason: profile?.rejection_reason || null,
      is_approved: profile?.is_approved !== undefined ? profile.is_approved : undefined
    },
    profile
  });
});

/**
 * GET /api/auth/me
 */
const getMe = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT id, name, email, role, phone, is_active, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  const user = rows[0];

  if (!user) {
    res.status(404);
    throw new Error('User not found.');
  }

  let profile = null;
  if (user.role === 'student') {
    const [studentRows] = await pool.execute('SELECT * FROM students WHERE user_id = ?', [user.id]);
    profile = studentRows[0] || null;
  } else if (user.role === 'company') {
    const [companyRows] = await pool.execute('SELECT * FROM companies WHERE user_id = ?', [user.id]);
    profile = companyRows[0] || null;
  }

  return successResponse(res, 200, 'Current user fetched.', {
    user: {
      ...user,
      verification_status: profile?.verification_status,
      rejection_reason: profile?.rejection_reason,
      is_approved: profile?.is_approved
    },
    profile
  });
});

module.exports = { register, login, getMe };
