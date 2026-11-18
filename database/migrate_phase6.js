/**
 * Phase 6 migration — adds missing columns to placement_drives.
 *
 * Safe to re-run: each column is added only if it does not already
 * exist (checked via INFORMATION_SCHEMA before the ALTER).
 *
 * Usage:  node database/migrate_phase6.js
 *         (or add a script to package.json: "db:migrate6")
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { getDatabaseConfig } = require('../config/databaseConfig');

async function columnExists(connection, table, column) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS c
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = ?
       AND COLUMN_NAME  = ?`,
    [table, column]
  );
  return rows[0].c > 0;
}

async function addColumnIfMissing(connection, table, column, definition) {
  const exists = await columnExists(connection, table, column);
  if (exists) {
    console.log(`  SKIP  ${table}.${column} (already exists)`);
  } else {
    await connection.execute(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${definition}`);
    console.log(`  ADDED ${table}.${column}`);
  }
}

async function migrate() {
  const connection = await mysql.createConnection(getDatabaseConfig());

  try {
    console.log('Phase 6 migration: extending placement_drives ...');

    // New columns for Phase 6 — order matters; adding after related cols
    await addColumnIfMissing(connection, 'placement_drives', 'work_mode',
      `ENUM('on_site','remote','hybrid') NOT NULL DEFAULT 'on_site' COMMENT 'Work location type'`);

    await addColumnIfMissing(connection, 'placement_drives', 'eligible_course',
      `VARCHAR(100) DEFAULT NULL COMMENT 'e.g. B.Tech, MCA, MBA'`);

    await addColumnIfMissing(connection, 'placement_drives', 'min_10th_percentage',
      `DECIMAL(5,2) DEFAULT NULL COMMENT 'Minimum 10th percentage required'`);

    await addColumnIfMissing(connection, 'placement_drives', 'min_12th_percentage',
      `DECIMAL(5,2) DEFAULT NULL COMMENT 'Minimum 12th/Diploma percentage required'`);

    await addColumnIfMissing(connection, 'placement_drives', 'passing_year',
      `YEAR DEFAULT NULL COMMENT 'Required graduation/passing year'`);

    await addColumnIfMissing(connection, 'placement_drives', 'required_skills',
      `TEXT DEFAULT NULL COMMENT 'Comma-separated skill names required for the drive'`);

    await addColumnIfMissing(connection, 'placement_drives', 'application_start_date',
      `DATETIME DEFAULT NULL COMMENT 'When applications open'`);

    await addColumnIfMissing(connection, 'placement_drives', 'num_openings',
      `INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Number of positions available'`);

    await addColumnIfMissing(connection, 'placement_drives', 'selection_process',
      `TEXT DEFAULT NULL COMMENT 'Description of selection rounds/process'`);

    // Also add student academic columns for eligibility (10th/12th %)
    // These go on the students table if not present yet
    await addColumnIfMissing(connection, 'students', 'tenth_percentage',
      `DECIMAL(5,2) DEFAULT NULL COMMENT '10th standard percentage'`);

    await addColumnIfMissing(connection, 'students', 'twelfth_percentage',
      `DECIMAL(5,2) DEFAULT NULL COMMENT '12th standard / Diploma percentage'`);

    await addColumnIfMissing(connection, 'students', 'passing_year',
      `YEAR DEFAULT NULL COMMENT 'Graduation/passing year'`);

    await addColumnIfMissing(connection, 'students', 'course',
      `VARCHAR(100) DEFAULT NULL COMMENT 'e.g. B.Tech, MCA — for eligibility matching'`);

    console.log('\nPhase 6 migration complete.');
  } finally {
    await connection.end();
  }
}

migrate().catch((err) => {
  console.error('Phase 6 migration failed:', err.message);
  process.exit(1);
});
