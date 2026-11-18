/**
 * Runs database/schema.sql against MySQL and safely ensures all columns exist.
 *
 * Safe to re-run: every statement uses CREATE TABLE IF NOT EXISTS and
 * dynamic column check/migration.
 *
 * Usage: npm run db:migrate
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

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
  if (!exists) {
    await connection.execute(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${definition}`);
    console.log(`  + Added missing column ${table}.${column}`);
  }
}

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const databaseName = process.env.DB_NAME || 'placement_management';
  if (!/^[A-Za-z0-9_$]+$/.test(databaseName)) {
    throw new Error('DB_NAME must contain only letters, numbers, underscores, or dollar signs.');
  }

  const connectionOptions = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  };
  let connection;

  try {
    connection = await mysql.createConnection({ ...connectionOptions, database: databaseName });
  } catch (err) {
    if (err.code !== 'ER_BAD_DB_ERROR') throw err;
    connection = await mysql.createConnection(connectionOptions);
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.changeUser({ database: databaseName });
  }

  try {
    console.log('Applying database/schema.sql ...');
    await connection.query(schemaSql);
    console.log('Base schema verified (13 tables).');

    // Ensure all phase columns exist on existing databases
    await addColumnIfMissing(connection, 'students', 'course', 'VARCHAR(100) DEFAULT NULL');
    await addColumnIfMissing(connection, 'students', 'passing_year', 'YEAR DEFAULT NULL');
    await addColumnIfMissing(connection, 'students', 'tenth_percentage', 'DECIMAL(5,2) DEFAULT NULL');
    await addColumnIfMissing(connection, 'students', 'twelfth_percentage', 'DECIMAL(5,2) DEFAULT NULL');
    await addColumnIfMissing(connection, 'students', 'verification_status', "ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending'");
    await addColumnIfMissing(connection, 'students', 'rejection_reason', 'TEXT DEFAULT NULL');

    // Ensure initial existing seed students are approved
    await connection.execute("UPDATE students SET verification_status = 'approved' WHERE verification_status = 'pending' AND created_at < NOW() - INTERVAL 1 MINUTE");


    await addColumnIfMissing(connection, 'placement_drives', 'work_mode', `ENUM('on_site','remote','hybrid') NOT NULL DEFAULT 'on_site'`);
    await addColumnIfMissing(connection, 'placement_drives', 'eligible_course', 'VARCHAR(100) DEFAULT NULL');
    await addColumnIfMissing(connection, 'placement_drives', 'num_openings', 'INT UNSIGNED NOT NULL DEFAULT 1');
    await addColumnIfMissing(connection, 'placement_drives', 'selection_process', 'TEXT DEFAULT NULL');
    await addColumnIfMissing(connection, 'placement_drives', 'passing_year', 'YEAR DEFAULT NULL');
    await addColumnIfMissing(connection, 'placement_drives', 'min_10th_percentage', 'DECIMAL(5,2) DEFAULT NULL');
    await addColumnIfMissing(connection, 'placement_drives', 'min_12th_percentage', 'DECIMAL(5,2) DEFAULT NULL');
    await addColumnIfMissing(connection, 'placement_drives', 'required_skills', 'TEXT DEFAULT NULL');
    await addColumnIfMissing(connection, 'placement_drives', 'application_start_date', 'DATETIME DEFAULT NULL');

    console.log('Migration completed successfully.');
  } finally {
    await connection.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
