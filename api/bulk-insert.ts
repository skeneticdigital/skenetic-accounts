import type { VercelRequest, VercelResponse } from '@vercel/node';
import pool, { initDB } from './_lib/db.js';
import { verifyToken } from './_lib/auth.js';

// --- Helper for Fuzzy Field Mapping ---
function findValue(obj: any, keywords: string[]): any {
  const objKeys = Object.keys(obj);
  // 1st pass: Exact match (case insensitive)
  for (const k of objKeys) {
    const lowerK = k.toLowerCase().trim();
    if (keywords.some(kw => lowerK === kw.toLowerCase())) return obj[k];
  }
  // 2nd pass: Includes match (ignoring spaces/special chars)
  for (const k of objKeys) {
    const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (keywords.some(kw => cleanK.includes(kw.toLowerCase()) || kw.toLowerCase().includes(cleanK))) {
      return obj[k];
    }
  }
  return null;
}

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
      let normalizedDate = findValue(item, ['date', 'data', 'day', 'time', 'period']);
      if (normalizedDate) {
        let dateStr = String(normalizedDate).trim();
        // Handle common separators: . / - or space
        const separator = dateStr.includes('.') ? '.' : (dateStr.includes('/') ? '/' : (dateStr.includes('-') ? '-' : ' '));
        const parts = dateStr.split(separator);
        
        if (parts.length === 3) {
          // DD MM YYYY or YYYY MM DD
          let day = parts[0];
          let month = parts[1];
          let year = parts[2];

          if (day.length === 4) { // YYYY MM DD
            normalizedDate = `${day}-${month.padStart(2, '0')}-${year.padStart(2, '0')}`;
          } else { // DD MM YYYY
            // Handle 2-digit years (assume 20xx)
            if (year.length === 2) year = '20' + year;
            // Handle 2-digit months (if it's text like 'Mar', this won't help much, but Date.parse handles that)
            normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
        } else {
          // Fallback for formats like "Mar 27, 2026"
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) {
            normalizedDate = parsed.toISOString().split('T')[0];
          }
        }
      }

      // Amount: Handle currency symbols, commas, and various column names
      const rawAmount = findValue(item, ['amount', 'amt', 'total', 'credit', 'debit', 'received', 'paid', 'spent', 'value', 'price']);
      const rawAmountStr = String(rawAmount || '0');
      
      // Remove all characters except numbers, decimal point, and negative sign
      const cleanAmountStr = rawAmountStr.replace(/[^0-9.-]/g, '');
      const cleanAmount = parseFloat(cleanAmountStr) || 0;

      // Source / Category: Expand to common accountant terms
      const sourceOrCategory = findValue(item, ['source', 'category', 'particulars', 'particular', 'reason', 'type', 'mode', 'from', 'to']) || '';

      // Notes / Description: Expand to remarks, comments, etc.
      const notesOrDesc = findValue(item, ['notes', 'description', 'desc', 'memo', 'remarks', 'remark', 'comment', 'details', 'narrative', 'info']) || '';

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
