const { pool } = require('../config/db');
const { successResponse } = require('../utils/response');
const asyncHandler = require('../middleware/asyncHandler');

// Whitelist of editable fields
const EDITABLE_COMPANY_FIELDS = [
  'company_name', 'industry', 'website', 'description',
  'hr_contact_name', 'hr_contact_phone'
];

async function getCompanyByUserId(userId) {
  const [rows] = await pool.execute('SELECT * FROM companies WHERE user_id = ?', [userId]);
  return rows[0] || null;
}

async function insertNotification(userId, title, message) {
  await pool.execute(
    'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
    [userId, title, message]
  );
}

/**
 * GET /api/companies/me
 */
const getMyProfile = asyncHandler(async (req, res) => {
  const company = await getCompanyByUserId(req.user.id);
  if (!company) {
    res.status(404);
    throw new Error('Company profile not found.');
  }
  return successResponse(res, 200, 'Profile fetched.', { company });
});

/**
 * PUT /api/companies/me
 */
const updateMyProfile = asyncHandler(async (req, res) => {
  const company = await getCompanyByUserId(req.user.id);
  if (!company) {
    res.status(404);
    throw new Error('Company profile not found.');
  }

  const updates = EDITABLE_COMPANY_FIELDS.filter((field) => req.body[field] !== undefined);
  if (updates.length === 0) {
    res.status(400);
    throw new Error(`No editable fields provided. Allowed: ${EDITABLE_COMPANY_FIELDS.join(', ')}.`);
  }

  const setClause = updates.map((field) => `${field} = ?`).join(', ');
  const values = updates.map((field) => req.body[field]);
  values.push(company.id);

  await pool.execute(`UPDATE companies SET ${setClause} WHERE id = ?`, values);

  const updated = await getCompanyByUserId(req.user.id);
  return successResponse(res, 200, 'Profile updated.', { company: updated });
});

/**
 * GET /api/companies
 */
const listCompanies = asyncHandler(async (req, res) => {
  const { is_approved, search } = req.query;
  const conditions = [];
  const values = [];

  if (is_approved !== undefined) {
    conditions.push('c.is_approved = ?');
    values.push(is_approved === 'true' || is_approved === '1' ? 1 : 0);
  }
  if (search) {
    conditions.push('(c.company_name LIKE ? OR c.industry LIKE ? OR u.email LIKE ?)');
    values.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.execute(
    `SELECT c.id, c.company_name, c.industry, c.website, c.description, c.hr_contact_name, c.hr_contact_phone, c.is_approved, c.created_at,
            u.name AS hr_user_name, u.email, u.phone,
            (SELECT COUNT(*) FROM placement_drives pd WHERE pd.company_id = c.id) AS drives_posted
     FROM companies c
     JOIN users u ON u.id = c.user_id
     ${whereClause}
     ORDER BY c.is_approved ASC, c.created_at DESC`,
    values
  );

  return successResponse(res, 200, 'Companies fetched.', { count: rows.length, companies: rows });
});

/**
 * GET /api/companies/:id
 */
const getCompanyById = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT c.*, u.name AS hr_user_name, u.email, u.phone,
            (SELECT COUNT(*) FROM placement_drives pd WHERE pd.company_id = c.id) AS drives_posted
     FROM companies c JOIN users u ON u.id = c.user_id
     WHERE c.id = ?`,
    [req.params.id]
  );
  const company = rows[0];
  if (!company) {
    res.status(404);
    throw new Error('Company not found.');
  }
  return successResponse(res, 200, 'Company fetched.', { company });
});

/**
 * PATCH /api/companies/:id/approve
 */
const approveCompany = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM companies WHERE id = ?', [req.params.id]);
  const company = rows[0];
  if (!company) {
    res.status(404);
    throw new Error('Company not found.');
  }

  if (company.is_approved) {
    return successResponse(res, 200, 'Company is already approved.', { company });
  }

  await pool.execute('UPDATE companies SET is_approved = 1 WHERE id = ?', [company.id]);
  await insertNotification(
    company.user_id,
    'Account Approved',
    `${company.company_name} has been approved by the placement office. You can now post placement drives.`
  );

  const [updatedRows] = await pool.execute('SELECT * FROM companies WHERE id = ?', [company.id]);
  return successResponse(res, 200, 'Company approved.', { company: updatedRows[0] });
});

/**
 * PATCH /api/companies/:id/revoke
 */
const revokeCompany = asyncHandler(async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM companies WHERE id = ?', [req.params.id]);
  const company = rows[0];
  if (!company) {
    res.status(404);
    throw new Error('Company not found.');
  }

  if (!company.is_approved) {
    return successResponse(res, 200, 'Company is already unapproved.', { company });
  }

  await pool.execute('UPDATE companies SET is_approved = 0 WHERE id = ?', [company.id]);
  await insertNotification(
    company.user_id,
    'Account Access Revoked',
    `${company.company_name}'s approval has been revoked by the placement office. Contact the TPO for details.`
  );

  const [updatedRows] = await pool.execute('SELECT * FROM companies WHERE id = ?', [company.id]);
  return successResponse(res, 200, 'Company approval revoked.', { company: updatedRows[0] });
});

/**
 * PATCH /api/companies/:id/approval
 * Unified endpoint accepting { is_approved: true | false }
 */
const updateCompanyApproval = asyncHandler(async (req, res) => {
  const { is_approved } = req.body;
  if (is_approved === true || is_approved === 1 || is_approved === '1' || is_approved === 'true') {
    return approveCompany(req, res);
  } else {
    return revokeCompany(req, res);
  }
});

module.exports = {
  getMyProfile,
  updateMyProfile,
  listCompanies,
  getCompanyById,
  approveCompany,
  revokeCompany,
  updateCompanyApproval
};
