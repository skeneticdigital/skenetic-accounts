import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import multer from 'multer';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'fintrack-secret-key';

// Initialize Database Pool for TiDB
const pool = mysql.createPool({
  host: process.env.TIDB_HOST,
  port: Number(process.env.TIDB_PORT) || 4000,
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: false
  }
});

async function initDB() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      password VARCHAR(255),
      role VARCHAR(50) DEFAULT 'user'
    );
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
    );
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
    );
  `);

  // Seed admin user if not exists
  const [users]: any = await pool.execute('SELECT * FROM users WHERE email = ?', ['info@skeneticdigital.com']);
  if (users.length === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    await pool.execute('INSERT INTO users (email, password, role) VALUES (?, ?, ?)', ['info@skeneticdigital.com', hashedPassword, 'admin']);
    console.log('Admin user seeded.');
  }
}

async function startServer() {
  await initDB();

  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const upload = multer({ dest: 'uploads/' });

  // Auth Middleware
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'No token provided' });

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) {
        console.error('JWT Verification Error:', err.message, err.name);
        return res.status(401).json({ message: 'Session expired or invalid' });
      }
      req.user = user;
      next();
    });
  };

  // Auth Routes
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const [rows]: any = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
      const user = rows[0];

      if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Income Routes
  app.get('/api/income', authenticateToken, async (req: any, res) => {
    try {
      const [income] = await pool.execute('SELECT * FROM income WHERE userId = ? ORDER BY date DESC', [req.user.id]);
      res.json(income);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.post('/api/income', authenticateToken, async (req: any, res) => {
    try {
      const { date, source, amount, notes } = req.body;
      if (!date || !source || amount === undefined) {
        return res.status(400).json({ message: 'Date, Source, and Amount are required' });
      }
      const [result]: any = await pool.execute('INSERT INTO income (userId, date, source, amount, notes) VALUES (?, ?, ?, ?, ?)', [req.user.id, date, source, amount, notes]);
      res.json({ id: result.insertId });
    } catch (error) {
      console.error('Error saving income:', error);
      res.status(500).json({ message: 'Server error saving income' });
    }
  });

  app.put('/api/income', authenticateToken, async (req: any, res) => {
    try {
      const { id, date, source, amount, notes } = req.body;
      await pool.execute('UPDATE income SET date = ?, source = ?, amount = ?, notes = ? WHERE id = ? AND userId = ?', [date, source, amount, notes, id, req.user.id]);
      res.json({ message: 'Updated' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.delete('/api/income', authenticateToken, async (req: any, res) => {
    try {
      const { id } = req.query;
      await pool.execute('DELETE FROM income WHERE id = ? AND userId = ?', [id, req.user.id]);
      res.json({ message: 'Deleted' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Expense Routes
  app.get('/api/expenses', authenticateToken, async (req: any, res) => {
    try {
      const [expenses]: any = await pool.execute('SELECT * FROM expenses WHERE userId = ? ORDER BY date DESC', [req.user.id]);
      res.json(expenses);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.post('/api/expenses', authenticateToken, async (req: any, res) => {
    try {
      const { date, category, amount, description } = req.body;
      if (!date || !category || amount === undefined) {
        return res.status(400).json({ message: 'Date, Category, and Amount are required' });
      }
      const [result]: any = await pool.execute('INSERT INTO expenses (userId, date, category, amount, description) VALUES (?, ?, ?, ?, ?)', [req.user.id, date, category, amount, description]);
      res.json({ id: result.insertId });
    } catch (error) {
      console.error('Error saving expense:', error);
      res.status(500).json({ message: 'Server error saving expense' });
    }
  });

  app.put('/api/expenses', authenticateToken, async (req: any, res) => {
    try {
      const { id, date, category, amount, description } = req.body;
      await pool.execute('UPDATE expenses SET date = ?, category = ?, amount = ?, description = ? WHERE id = ? AND userId = ?', [date, category, amount, description, id, req.user.id]);
      res.json({ message: 'Updated' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.delete('/api/expenses', authenticateToken, async (req: any, res) => {
    try {
      const { id } = req.query;
      await pool.execute('DELETE FROM expenses WHERE id = ? AND userId = ?', [id, req.user.id]);
      res.json({ message: 'Deleted' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Bulk Upload
  app.post('/api/upload', authenticateToken, upload.single('file'), (req: any, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    res.json({ filename: req.file.filename, originalname: req.file.originalname });
  });

  app.post('/api/bulk-insert', authenticateToken, async (req: any, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      const { type, data } = req.body;
      
      let successCount = 0;
      for (const item of data) {
        try {
          // Robust date parsing (Handles DD.MM.YYYY, DD/MM/YYYY, etc.)
          let normalizedDate = item.date;
          if (normalizedDate && (normalizedDate.includes('.') || normalizedDate.includes('/'))) {
            const separator = normalizedDate.includes('.') ? '.' : '/';
            const parts = normalizedDate.split(separator);
            if (parts.length === 3) {
              // Assume DD.MM.YYYY if parts[2] is length 4
              if (parts[2].length === 4) {
                normalizedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
              } else if (parts[0].length === 4) {
                // Already YYYY.MM.DD
                normalizedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
              }
            }
          }
          
          const amount = parseFloat(item.amount);
          if (type === 'income') {
            await connection.execute(
              'INSERT INTO income (userId, date, source, amount, notes) VALUES (?, ?, ?, ?, ?)', 
              [req.user.id, normalizedDate || new Date().toISOString().split('T')[0], item.source || 'Unknown', amount || 0, item.notes || '']
            );
          } else {
            await connection.execute(
              'INSERT INTO expenses (userId, date, category, amount, description) VALUES (?, ?, ?, ?, ?)', 
              [req.user.id, normalizedDate || new Date().toISOString().split('T')[0], item.category || 'Miscellaneous', amount || 0, item.description || '']
            );
          }
          successCount++;
        } catch (rowError) {
          console.error(`Row insertion failed for ${type}:`, item, rowError);
          throw new Error(`Failed at record #${successCount + 1}: ${rowError instanceof Error ? rowError.message : String(rowError)}`);
        }
      }

      await connection.commit();
      res.json({ message: `Successfully uploaded ${successCount} records` });
    } catch (error) {
      await connection.rollback();
      console.error('Bulk insert failed:', error);
      res.status(500).json({ message: 'Bulk insert failed: ' + (error instanceof Error ? error.message : String(error)) });
    } finally {
      connection.release();
    }
  });

  // Dashboard Summary
  app.get('/api/summary', authenticateToken, async (req: any, res) => {
    try {
      const [incomeRows]: any = await pool.execute('SELECT SUM(amount) as total FROM income WHERE userId = ?', [req.user.id]);
      const [expenseRows]: any = await pool.execute('SELECT SUM(amount) as total FROM expenses WHERE userId = ?', [req.user.id]);
      
      const totalIncome = Number(incomeRows[0]?.total || 0);
      const totalExpenses = Number(expenseRows[0]?.total || 0);
      
      res.json({ totalIncome, totalExpenses, balance: totalIncome - totalExpenses });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
