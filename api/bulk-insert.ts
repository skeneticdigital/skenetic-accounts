import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool, { initDB } from './_lib/db.js';
import { verifyToken } from './_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });

  const { type, data } = req.body;
  if (!type || !data || !Array.isArray(data)) {
    return res.status(400).json({ message: 'Invalid request format' });
  }

  const connection = await pool.getConnection();
  try {
    await initDB();
    await connection.beginTransaction();

    for (const item of data) {
      // Skip completely empty rows
      if (Object.values(item).every(val => !val)) continue;

      // --- Flexible Field Mapping ---
      // Date: Look for variations of Date
      let normalizedDate = item.date || item.Date || item.DATE || item.Data || item.data || item.DATA;
      if (normalizedDate && typeof normalizedDate === 'string' && (normalizedDate.includes('.') || normalizedDate.includes('/') || normalizedDate.includes('-'))) {
        const separator = normalizedDate.includes('.') ? '.' : (normalizedDate.includes('/') ? '/' : '-');
        const parts = normalizedDate.split(separator);
        if (parts.length === 3) {
          if (parts[2].length === 4) { // DD.MM.YYYY
            normalizedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          } else if (parts[0].length === 4) { // YYYY.MM.DD
            normalizedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          }
        }
      }

      // Amount: Handle currency symbols, commas, and various column names
      const rawAmountStr = String(
        item.amount || item.Amount || item.AMOUNT || 
        item.paid || item.Paid || item.spent || item.Spent || 
        item.received || item.Received || item.value || item.Value || '0'
      );
      // Remove all characters except numbers, decimal point, and negative sign
      const cleanAmountStr = rawAmountStr.replace(/[^0-9.-]/g, '');
      const cleanAmount = parseFloat(cleanAmountStr) || 0;

      // Source / Category: Expand to common accountant terms
      const sourceOrCategory = 
        item.source || item.Source || item.category || item.Category || 
        item['Source/Category'] || item.particulars || item.Particulars || 
        item.particular || item.Particular || item.Type || item.type || '';

      // Notes / Description: Expand to remarks, comments, etc.
      const notesOrDesc = 
        item.notes || item.Notes || item.description || item.Description || 
        item.memo || item.remarks || item.Remarks || item.remark || 
        item.Comment || item.comment || item.details || '';

      // Fallbacks to null to prevent "undefined" error in bind parameters
      const sqlDate = normalizedDate || null;
      const sqlSource = sourceOrCategory || null;
      const sqlAmount = isNaN(cleanAmount) ? 0 : cleanAmount;
      const sqlNotes = notesOrDesc || null;

      if (type === 'income') {
        await connection.execute(
          'INSERT INTO income (userId, date, source, amount, notes) VALUES (?, ?, ?, ?, ?)',
          [user.id, sqlDate, sqlSource, sqlAmount, sqlNotes]
        );
      } else if (type === 'expense') {
        await connection.execute(
          'INSERT INTO expenses (userId, date, category, amount, description) VALUES (?, ?, ?, ?, ?)',
          [user.id, sqlDate, sqlSource, sqlAmount, sqlNotes]
        );
      }
    }

    await connection.commit();
    res.json({ message: `Successfully uploaded ${data.length} records` });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Bulk insert error:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Database error during bulk upload' });
  } finally {
    if (connection) connection.release();
  }
}
