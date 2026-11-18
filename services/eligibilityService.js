/**
 * eligibilityService.js — Phase 7: Smart Eligibility Engine
 *
 * Pure, rule-based eligibility checker. No DB calls here — the caller
 * (driveController.checkEligibility / studentController.getRecommendedDrives)
 * is responsible for fetching and passing in the fully-populated student
 * and drive objects.
 *
 * Design principles:
 *   • Does NOT stop on the first failure — collects ALL failure reasons.
 *   • Case-insensitive, whitespace-trimmed skill matching.
 *   • No duplicate skill counting (uses Sets).
 *   • Returns a plain object (no DB side-effects).
 *   • Deterministic: same input always yields same output.
 *
 * Input shape expected for `student`:
 * {
 *   course          : string | null    (e.g. "B.Tech", "MCA")
 *   branch          : string           (e.g. "Computer Science")
 *   cgpa            : number
 *   backlog_count   : number
 *   passing_year    : number | null
 *   tenth_percentage  : number | null
 *   twelfth_percentage: number | null
 *   skills          : string[]         (skill_name values from student_skills)
 * }
 *
 * Input shape expected for `drive`:
 * {
 *   eligible_course        : string | null
 *   eligible_branches      : string[]          (from drive_eligible_branches)
 *   min_cgpa               : number
 *   max_backlogs           : number
 *   passing_year           : number | null
 *   min_10th_percentage    : number | null
 *   min_12th_percentage    : number | null
 *   required_skills        : string | null     (comma-separated)
 * }
 *
 * Return shape:
 * {
 *   eligible            : boolean
 *   reasons             : string[]   (empty when eligible)
 *   matchedSkills       : string[]
 *   missingSkills       : string[]
 *   skillMatchPercentage: number     (0–100)
 * }
 */

/**
 * Normalises a skill name for comparison: trim + lowercase.
 */
function normaliseSkill(skill) {
  return String(skill).trim().toLowerCase();
}

/**
 * Parses the comma-separated required_skills string from a drive into
 * a deduplicated array of normalised skill names.
 */
function parseDriveSkills(requiredSkillsStr) {
  if (!requiredSkillsStr) return [];
  return [
    ...new Set(
      requiredSkillsStr
        .split(',')
        .map(normaliseSkill)
        .filter(Boolean)
    )
  ];
}

/**
 * Main eligibility check function.
 *
 * @param {object} student  — student row + skills array (see shape above)
 * @param {object} drive    — drive row + eligible_branches array (see shape above)
 * @returns {object}        — eligibility result (see shape above)
 */
function checkEligibility(student, drive) {
  const reasons = [];

  // ── 1. Course check ────────────────────────────────────────────────────────
  // Only enforced if the drive specifies an eligible_course.
  if (drive.eligible_course) {
    const requiredCourse = String(drive.eligible_course).trim().toLowerCase();
    const studentCourse  = student.course ? String(student.course).trim().toLowerCase() : '';
    if (studentCourse !== requiredCourse) {
      reasons.push(
        `Course not eligible. Required: ${drive.eligible_course}. ` +
        `Your course: ${student.course || 'not set on profile'}.`
      );
    }
  }

  // ── 2. Branch check ────────────────────────────────────────────────────────
  // drive.eligible_branches is an array; if empty we treat as open to all.
  if (drive.eligible_branches && drive.eligible_branches.length > 0) {
    const normalBranches = drive.eligible_branches.map((b) => String(b).trim().toLowerCase());
    const studentBranch  = student.branch ? String(student.branch).trim().toLowerCase() : '';
    if (!normalBranches.includes(studentBranch)) {
      const listed = drive.eligible_branches.join(', ');
      reasons.push(
        `Branch not eligible. Eligible branches: ${listed}. ` +
        `Your branch: ${student.branch || 'not set on profile'}.`
      );
    }
  }

  // ── 3. CGPA check ─────────────────────────────────────────────────────────
  const minCgpa    = Number(drive.min_cgpa) || 0;
  const studentCgpa = Number(student.cgpa) || 0;
  if (studentCgpa < minCgpa) {
    reasons.push(
      `CGPA below required minimum. Required: ${minCgpa.toFixed(2)}. ` +
      `Your CGPA: ${studentCgpa.toFixed(2)}.`
    );
  }

  // ── 4. Backlog check ──────────────────────────────────────────────────────
  const maxBacklogs     = Number(drive.max_backlogs) ?? 0;
  const studentBacklogs = Number(student.backlog_count) || 0;
  if (studentBacklogs > maxBacklogs) {
    reasons.push(
      `Too many active backlogs. Maximum allowed: ${maxBacklogs}. ` +
      `Your backlogs: ${studentBacklogs}.`
    );
  }

  // ── 5. Passing year check ─────────────────────────────────────────────────
  if (drive.passing_year) {
    const requiredYear = Number(drive.passing_year);
    const studentYear  = student.passing_year ? Number(student.passing_year) : null;
    if (studentYear === null) {
      reasons.push(
        `Passing year not set on your profile. Required: ${requiredYear}. ` +
        `Please update your profile with your graduation year.`
      );
    } else if (studentYear !== requiredYear) {
      reasons.push(
        `Passing year does not match. Required: ${requiredYear}. ` +
        `Your passing year: ${studentYear}.`
      );
    }
  }

  // ── 6. 10th percentage check ──────────────────────────────────────────────
  if (drive.min_10th_percentage !== null && drive.min_10th_percentage !== undefined) {
    const required10th = Number(drive.min_10th_percentage);
    const student10th  = student.tenth_percentage !== null && student.tenth_percentage !== undefined
      ? Number(student.tenth_percentage)
      : null;
    if (student10th === null) {
      reasons.push(
        `10th percentage not set on your profile. Required minimum: ${required10th}%. ` +
        `Please update your profile.`
      );
    } else if (student10th < required10th) {
      reasons.push(
        `10th percentage below required minimum. Required: ${required10th}%. ` +
        `Your 10th percentage: ${student10th}%.`
      );
    }
  }

  // ── 7. 12th percentage check ──────────────────────────────────────────────
  if (drive.min_12th_percentage !== null && drive.min_12th_percentage !== undefined) {
    const required12th = Number(drive.min_12th_percentage);
    const student12th  = student.twelfth_percentage !== null && student.twelfth_percentage !== undefined
      ? Number(student.twelfth_percentage)
      : null;
    if (student12th === null) {
      reasons.push(
        `12th/Diploma percentage not set on your profile. Required minimum: ${required12th}%. ` +
        `Please update your profile.`
      );
    } else if (student12th < required12th) {
      reasons.push(
        `12th/Diploma percentage below required minimum. Required: ${required12th}%. ` +
        `Your 12th percentage: ${student12th}%.`
      );
    }
  }

  // ── 8. Skill matching ──────────────────────────────────────────────────────
  // Case-insensitive, trimmed, deduplicated on both sides.
  const requiredSkills = parseDriveSkills(drive.required_skills);

  // Normalised set of student skills for O(1) lookup
  const studentSkillSet = new Set(
    (student.skills || []).map(normaliseSkill).filter(Boolean)
  );

  const matchedSkillsNorm = [];
  const missingSkillsNorm = [];

  requiredSkills.forEach((reqSkill) => {
    if (studentSkillSet.has(reqSkill)) {
      matchedSkillsNorm.push(reqSkill);
    } else {
      missingSkillsNorm.push(reqSkill);
    }
  });

  // Skill match percentage (0 if no skills required — doesn't penalise)
  const skillMatchPercentage = requiredSkills.length > 0
    ? Math.round((matchedSkillsNorm.length / requiredSkills.length) * 100)
    : 100;

  if (missingSkillsNorm.length > 0) {
    reasons.push(
      `Missing required skills: ${missingSkillsNorm.join(', ')}. ` +
      `Matched ${matchedSkillsNorm.length} of ${requiredSkills.length} required skills ` +
      `(${skillMatchPercentage}%).`
    );
  }

  // ── Result ────────────────────────────────────────────────────────────────
  // Restore original casing for display: use the drive's required_skills string
  // for missing, and the student's actual skill for matched.
  const driveSkillOriginal = drive.required_skills
    ? drive.required_skills.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  // Build a lookup: normalised → original casing (drive side)
  const normToOrigDrive = {};
  driveSkillOriginal.forEach((s) => {
    normToOrigDrive[normaliseSkill(s)] = s;
  });

  // Build a lookup: normalised → original casing (student side)
  const normToOrigStudent = {};
  (student.skills || []).forEach((s) => {
    normToOrigStudent[normaliseSkill(s)] = s;
  });

  const matchedSkills  = matchedSkillsNorm.map((n) => normToOrigStudent[n] || n);
  const missingSkills  = missingSkillsNorm.map((n) => normToOrigDrive[n]    || n);

  return {
    eligible: reasons.length === 0,
    reasons,
    matchedSkills,
    missingSkills,
    skillMatchPercentage
  };
}

module.exports = { checkEligibility };
