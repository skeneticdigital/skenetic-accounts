import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../_lib/db.js';
import { verifyToken } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });

  try {
    if (req.method === 'OPTIONS') return res.status(200).end(); if (req.method === 'GET') {
      const [income] = await pool.execute('SELECT * FROM income WHERE userId = ? ORDER BY date DESC', [user.id]);
      return res.json(income);
    }

    if (req.method === 'POST') {
      const { date, source, amount, notes } = req.body;
      const [result]: any = await pool.execute(
        'INSERT INTO income (userId, date, source, amount, notes) VALUES (?, ?, ?, ?, ?)',
        [user.id, date, source, amount, notes]
      );
      return res.json({ id: result.insertId });
    }

    if (req.method === 'PUT') {
      const { id, date, source, amount, notes } = req.body;
      await pool.execute(
        'UPDATE income SET date = ?, source = ?, amount = ?, notes = ? WHERE id = ? AND userId = ?',
        [date, source, amount, notes, id, user.id]
      );
      return res.json({ message: 'Updated' });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await pool.execute('DELETE FROM income WHERE id = ? AND userId = ?', [id, user.id]);
      return res.json({ message: 'Deleted' });
    }

    res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
}
