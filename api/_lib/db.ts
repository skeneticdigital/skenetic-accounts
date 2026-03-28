import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.TIDB_HOST,
  port: Number(process.env.TIDB_PORT) || 4000,
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE,
  waitForConnections: true,
  connectionLimit: 1, // Reduced for serverless environment
  maxIdle: 1, 
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: false
  }
});

export async function initDB() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      password VARCHAR(255),
      role VARCHAR(50) DEFAULT 'user'
    )
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS income (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT,
      date VARCHAR(50),
      source VARCHAR(255),
      amount DECIMAL(10,2),
      notes TEXT,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT,
      date VARCHAR(50),
      category VARCHAR(255),
      amount DECIMAL(10,2),
      description TEXT,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

export default pool;
