import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function testConnection() {
  console.log("Testing connection...");
  const pool = mysql.createPool({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT) || 4000,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
  });

  try {
    const connection = await pool.getConnection();
    console.log("Connection successful!");
    
    const [rows]: any = await connection.execute('SHOW TABLES');
    console.log("Tables in database:", rows);
    
    connection.release();
  } catch (err) {
    console.error("Connection failed:", err);
  } finally {
    pool.end();
  }
}

testConnection();
