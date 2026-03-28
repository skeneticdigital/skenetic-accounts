import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../_lib/db.ts';
import { verifyToken } from '../_lib/auth.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { type, data } = req.body;

  if (!type || !data || !Array.isArray(data)) {
    return res.status(400).json({ message: 'Invalid request data' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const item of data) {
      if (type === 'income') {
        await connection.execute(
          'INSERT INTO income (userId, date, source, amount, notes) VALUES (?, ?, ?, ?, ?)',
          [user.id, item.date, item.source, parseFloat(item.amount), item.notes || '']
        );
      } else if (type === 'expense') {
        await connection.execute(
          'INSERT INTO expenses (userId, date, category, amount, description) VALUES (?, ?, ?, ?, ?)',
          [user.id, item.date, item.category, parseFloat(item.amount), item.description || '']
        );
      }
    }

    await connection.commit();
    res.json({ message: `Successfully uploaded ${data.length} records` });
  } catch (error) {
    await connection.rollback();
    console.error('Bulk insert error:', error);
    res.status(500).json({ message: 'Failed to perform bulk insert' });
  } finally {
    connection.release();
  }
}
