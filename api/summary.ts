import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool from '../_lib/db.ts';
import { verifyToken } from '../_lib/auth.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const [incomeRows]: any = await pool.execute('SELECT SUM(amount) as total FROM income WHERE userId = ?', [user.id]);
    const [expenseRows]: any = await pool.execute('SELECT SUM(amount) as total FROM expenses WHERE userId = ?', [user.id]);

    const totalIncome = Number(incomeRows[0]?.total || 0);
    const totalExpenses = Number(expenseRows[0]?.total || 0);

    res.json({ totalIncome, totalExpenses, balance: totalIncome - totalExpenses });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
}
