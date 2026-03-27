import { Type } from "@google/genai";

export interface User {
  id: number;
  email: string;
  role: 'admin' | 'user';
}

export interface Income {
  id: number;
  date: string;
  source: string;
  amount: number;
  notes: string;
}

export interface Expense {
  id: number;
  date: string;
  category: string;
  amount: number;
  description: string;
}

export interface Summary {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
}
