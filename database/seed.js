/**
 * Seeds demo data: 1 admin, 3 students (with skills), 2 companies (one
 * approved, one pending — so Phase 5's approval workflow has something
 * to demo), 2 placement drives, applications in different states, an
 * interview round + result, one selection, and a couple notifications.
 *
 * Passwords are hashed with bcrypt HERE, at seed time — never stored as
 * plaintext or baked into schema.sql. Uses the app's own pool
 * (config/db.js) and parameterized queries throughout, same as real
 * app code will in later phases.
 *
 * Idempotent: if `users` already has rows, it skips instead of
 * inserting duplicates / throwing on the unique email constraint.
 *
 * Usage:  npm run db:seed
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

const DEMO_PASSWORD = 'Password@123';
const SALT_ROUNDS = 10;

async function alreadySeeded() {
  const [rows] = await pool.execute('SELECT COUNT(*) AS c FROM users');
  return rows[0].c > 0;
}

async function insertUser({ name, email, role, phone }) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
  const [result] = await pool.execute(
    `INSERT INTO users (name, email, password_hash, role, phone)
     VALUES (?, ?, ?, ?, ?)`,
    [name, email, passwordHash, role, phone]
  );
  return result.insertId;
}

async function insertStudent(userId, s) {
  const [result] = await pool.execute(
    `INSERT INTO students
       (user_id, roll_number, branch, degree, batch_year, cgpa, backlog_count, gender, dob, address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, s.roll_number, s.branch, s.degree, s.batch_year, s.cgpa,
      s.backlog_count, s.gender, s.dob, s.address]
  );
  return result.insertId;
}

async function insertSkills(studentId, skills) {
  for (const skill of skills) {
    await pool.execute(
      `INSERT INTO student_skills (student_id, skill_name) VALUES (?, ?)`,
      [studentId, skill]
    );
  }
}

async function insertCompany(userId, c) {
  const [result] = await pool.execute(
    `INSERT INTO companies
       (user_id, company_name, industry, website, description, hr_contact_name, hr_contact_phone, is_approved)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, c.company_name, c.industry, c.website, c.description,
      c.hr_contact_name, c.hr_contact_phone, c.is_approved]
  );
  return result.insertId;
}

async function insertDrive(companyId, d) {
  const [result] = await pool.execute(
    `INSERT INTO placement_drives
       (company_id, title, description, job_type, package_ctc, location,
        min_cgpa, max_backlogs, application_deadline, drive_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [companyId, d.title, d.description, d.job_type, d.package_ctc, d.location,
      d.min_cgpa, d.max_backlogs, d.application_deadline, d.drive_date, d.status]
  );
  return result.insertId;
}

async function insertDriveBranches(driveId, branches) {
  for (const branch of branches) {
    await pool.execute(
      `INSERT INTO drive_eligible_branches (drive_id, branch) VALUES (?, ?)`,
      [driveId, branch]
    );
  }
}

async function insertApplication(driveId, studentId, status) {
  const [result] = await pool.execute(
    `INSERT INTO applications (drive_id, student_id, status) VALUES (?, ?, ?)`,
    [driveId, studentId, status]
  );
  return result.insertId;
}

async function insertInterviewRound(driveId, roundNumber, roundName, scheduledDate) {
  const [result] = await pool.execute(
    `INSERT INTO interview_rounds (drive_id, round_number, round_name, scheduled_date)
     VALUES (?, ?, ?, ?)`,
    [driveId, roundNumber, roundName, scheduledDate]
  );
  return result.insertId;
}

async function insertInterviewResult(applicationId, roundId, status, feedback, interviewer) {
  await pool.execute(
    `INSERT INTO interview_results (application_id, round_id, status, feedback, interviewer_name)
     VALUES (?, ?, ?, ?, ?)`,
    [applicationId, roundId, status, feedback, interviewer]
  );
}

async function insertSelection(applicationId, packageOffered, offerDate, status) {
  await pool.execute(
    `INSERT INTO selections (application_id, package_offered, offer_date, status)
     VALUES (?, ?, ?, ?)`,
    [applicationId, packageOffered, offerDate, status]
  );
}

async function insertNotification(userId, title, message) {
  await pool.execute(
    `INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)`,
    [userId, title, message]
  );
}

async function seed() {
  if (await alreadySeeded()) {
    console.log('Seed skipped: `users` table is not empty (already seeded).');
    console.log('To re-seed from scratch, drop and re-run: npm run db:migrate && npm run db:seed');
    return;
  }

  console.log('Seeding demo data ...');

  // ---- Admin / TPO ----
  const adminUserId = await insertUser({
    name: 'System Admin', email: 'admin@spms.edu', role: 'admin', phone: '9000000001'
  });

  // ---- Students ----
  const aaravUserId = await insertUser({
    name: 'Aarav Sharma', email: 'aarav.sharma@student.spms.edu', role: 'student', phone: '9000000011'
  });
  const aaravId = await insertStudent(aaravUserId, {
    roll_number: 'CS2021001', branch: 'Computer Science', degree: 'B.Tech',
    batch_year: 2025, cgpa: 8.70, backlog_count: 0, gender: 'male',
    dob: '2003-04-12', address: 'Aligarh, Uttar Pradesh'
  });
  await insertSkills(aaravId, ['JavaScript', 'Node.js', 'SQL', 'React']);

  const priyaUserId = await insertUser({
    name: 'Priya Verma', email: 'priya.verma@student.spms.edu', role: 'student', phone: '9000000012'
  });
  const priyaId = await insertStudent(priyaUserId, {
    roll_number: 'EC2021015', branch: 'Electronics', degree: 'B.Tech',
    batch_year: 2025, cgpa: 7.90, backlog_count: 1, gender: 'female',
    dob: '2003-08-21', address: 'Lucknow, Uttar Pradesh'
  });
  await insertSkills(priyaId, ['Embedded C', 'Python', 'Signal Processing']);

  const rohanUserId = await insertUser({
    name: 'Rohan Gupta', email: 'rohan.gupta@student.spms.edu', role: 'student', phone: '9000000013'
  });
  const rohanId = await insertStudent(rohanUserId, {
    roll_number: 'ME2021032', branch: 'Mechanical', degree: 'B.Tech',
    batch_year: 2025, cgpa: 6.80, backlog_count: 2, gender: 'male',
    dob: '2003-01-30', address: 'Kanpur, Uttar Pradesh'
  });
  await insertSkills(rohanId, ['AutoCAD', 'SolidWorks']);

  // ---- Companies ----
  const technovaUserId = await insertUser({
    name: 'TechNova HR', email: 'hr@technova.example.com', role: 'company', phone: '9000000021'
  });
  const technovaId = await insertCompany(technovaUserId, {
    company_name: 'TechNova Solutions', industry: 'IT Services',
    website: 'https://technova.example.com',
    description: 'Mid-size software services company hiring full-stack engineers and interns.',
    hr_contact_name: 'Neha Kapoor', hr_contact_phone: '9000000022', is_approved: 1
  });

  const buildrightUserId = await insertUser({
    name: 'BuildRight HR', email: 'hr@buildright.example.com', role: 'company', phone: '9000000031'
  });
  await insertCompany(buildrightUserId, {
    company_name: 'BuildRight Engineering', industry: 'Manufacturing',
    website: 'https://buildright.example.com',
    description: 'Core mechanical engineering firm, pending TPO approval.',
    hr_contact_name: 'Suresh Rao', hr_contact_phone: '9000000032', is_approved: 0
  });

  // ---- Drive 1: open, approved ----
  const drive1Id = await insertDrive(technovaId, {
    title: 'Software Engineer - Full Time',
    description: 'Full-stack role working on internal placement/ops tooling.',
    job_type: 'full_time', package_ctc: 12.50, location: 'Bengaluru',
    min_cgpa: 7.00, max_backlogs: 1,
    application_deadline: '2026-09-15 23:59:59', drive_date: '2026-09-25 09:00:00',
    status: 'approved'
  });
  await insertDriveBranches(drive1Id, ['Computer Science', 'Electronics']);

  const aaravApp1 = await insertApplication(drive1Id, aaravId, 'shortlisted');
  const priyaApp1 = await insertApplication(drive1Id, priyaId, 'applied');

  const round1Id = await insertInterviewRound(drive1Id, 1, 'Online Assessment', '2026-09-20 10:00:00');
  await insertInterviewResult(aaravApp1, round1Id, 'pass', 'Strong DSA round, cleared cutoff comfortably.', 'Neha Kapoor');

  // ---- Drive 2: closed, already resulted in a selection ----
  const drive2Id = await insertDrive(technovaId, {
    title: 'Backend Developer Intern',
    description: '6-month internship, pre-placement offer track.',
    job_type: 'internship', package_ctc: 6.00, location: 'Remote',
    min_cgpa: 6.50, max_backlogs: 2,
    application_deadline: '2026-06-30 23:59:59', drive_date: '2026-07-05 09:00:00',
    status: 'closed'
  });
  await insertDriveBranches(drive2Id, ['Computer Science', 'Mechanical']);

  const rohanApp2 = await insertApplication(drive2Id, rohanId, 'selected');
  await insertSelection(rohanApp2, 6.00, '2026-07-10', 'accepted');

  // ---- Notifications ----
  await insertNotification(aaravUserId, 'Shortlisted', 'You have been shortlisted for Software Engineer - Full Time at TechNova Solutions.');
  await insertNotification(rohanUserId, 'Offer Accepted', 'Your offer for Backend Developer Intern has been recorded as accepted.');

  console.log('Seed complete:');
  console.log('  1 admin, 3 students, 2 companies, 2 drives, 3 applications, 1 selection.');
  console.log('  Demo login password for every seeded account: ' + DEMO_PASSWORD);
}

seed()
  .catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
