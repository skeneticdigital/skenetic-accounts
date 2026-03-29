import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool, { initDB } from '../_lib/db.js';
import { verifyToken } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });

  try {
    await initDB();

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method === 'GET') {
      const [expenses] = await pool.execute('SELECT * FROM expenses WHERE userId = ? ORDER BY date DESC', [user.id]);
      return res.json(expenses);
    }

    if (req.method === 'POST') {
      const { date, category, amount, description } = req.body;
      if (!date || !category || amount === undefined) {
        return res.status(400).json({ message: 'Date, Category, and Amount are required' });
      }
      const [result]: any = await pool.execute(
        'INSERT INTO expenses (userId, date, category, amount, description) VALUES (?, ?, ?, ?, ?)',
        [user.id, date, category, amount, description]
      );
      return res.json({ id: result.insertId });
    }

    if (req.method === 'PUT') {
      const { id, date, category, amount, description } = req.body;
      await pool.execute(
        'UPDATE expenses SET date = ?, category = ?, amount = ?, description = ? WHERE id = ? AND userId = ?',
        [date, category, amount, description, id, user.id]
      );
      return res.json({ message: 'Updated' });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await pool.execute('DELETE FROM expenses WHERE id = ? AND userId = ?', [id, user.id]);
      return res.json({ message: 'Deleted' });
    }

    res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('API Error (expenses):', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Server error' });
  }
}
