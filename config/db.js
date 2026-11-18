const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'placement_management',
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
