const mysql = require('mysql2/promise');
const { getDatabaseConfig } = require('./databaseConfig');

const pool = mysql.createPool({
  ...getDatabaseConfig(),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

/**
 * Verifies the DB is reachable at boot time without crashing the server
 * if it isn't (useful during early development, before schema/seed exist).
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('MySQL connected successfully.');
    connection.release();
  } catch (err) {
    console.error('MySQL connection failed:', err.message);
    console.error('The API will keep running, but any DB-backed route will fail until this is resolved.');
  }
}

module.exports = { pool, testConnection };
