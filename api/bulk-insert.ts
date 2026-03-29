import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool, { initDB } from './_lib/db.js';
import { verifyToken } from './_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });

  if (req.method === 'OPTIONS') return res.status(200).end(); if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { type, data } = req.body;

  if (!type || !data || !Array.isArray(data)) {
    return res.status(400).json({ message: 'Invalid request data' });
  }

  const connection = await pool.getConnection();
  try {
    await initDB();
    await connection.beginTransaction();

    for (const item of data) {
      // Robust date parsing (Handles DD.MM.YYYY, DD/MM/YYYY, etc.)
      let normalizedDate = item.date;
      if (normalizedDate && (normalizedDate.includes('.') || normalizedDate.includes('/'))) {
        const separator = normalizedDate.includes('.') ? '.' : '/';
        const parts = normalizedDate.split(separator);
        if (parts.length === 3) {
          if (parts[2].length === 4) {
            normalizedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          } else if (parts[0].length === 4) {
            normalizedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          }
        }
      }

      if (type === 'income') {
        await connection.execute(
          'INSERT INTO income (userId, date, source, amount, notes) VALUES (?, ?, ?, ?, ?)',
          [user.id, normalizedDate || item.date, item.source, parseFloat(item.amount), item.notes || '']
        );
      } else if (type === 'expense') {
        await connection.execute(
          'INSERT INTO expenses (userId, date, category, amount, description) VALUES (?, ?, ?, ?, ?)',
          [user.id, normalizedDate || item.date, item.category, parseFloat(item.amount), item.description || '']
        );
      }
    }

    await connection.commit();
    res.json({ message: `Successfully uploaded ${data.length} records` });
  } catch (error) {
    await connection.rollback();
    console.error('Bulk insert error:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to perform bulk insert' });
  } finally {
    connection.release();
  }
}
