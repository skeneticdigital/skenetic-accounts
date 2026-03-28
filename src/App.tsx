/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  TrendingUp, 
  TrendingDown, 
  FileText, 
  Upload, 
  LogOut, 
  Menu, 
  X, 
  Sun, 
  Moon,
  Search,
  Plus,
  Filter,
  Download,
  Trash2,
  Edit2,
  ChevronLeft,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency, formatDate } from './lib/utils';
import type { User, Income, Expense, Summary } from './types';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- Components ---

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
          <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </motion.div>
    </div>
  );
};

const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={cn("bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-6 shadow-sm", className)}>
    {children}
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data States
  const [income, setIncome] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalIncome: 0, totalExpenses: 0, balance: 0 });

  // Auth States
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'income' | 'expense'>('income');
  const [editingItem, setEditingItem] = useState<any>(null);

  // Filter States
  const [filterMonth, setFilterMonth] = useState('All');
  const [filterYear, setFilterYear] = useState('2026');
  const [filteredIncome, setFilteredIncome] = useState<Income[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
  const [filteredSummary, setFilteredSummary] = useState<Summary>({ totalIncome: 0, totalExpenses: 0, balance: 0 });

  useEffect(() => {
    applyFilters();
  }, [income, expenses, filterMonth, filterYear]);

  const applyFilters = () => {
    let fIncome = [...income];
    let fExpense = [...expenses];

    const isValidDate = (dateStr: string) => {
      const d = new Date(dateStr);
      return !isNaN(d.getTime());
    };

    if (filterMonth !== 'All') {
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const monthIndex = monthNames.indexOf(filterMonth);
      fIncome = fIncome.filter(i => isValidDate(i.date) && new Date(i.date).getMonth() === monthIndex);
      fExpense = fExpense.filter(e => isValidDate(e.date) && new Date(e.date).getMonth() === monthIndex);
    }

    if (filterYear !== 'All') {
      fIncome = fIncome.filter(i => isValidDate(i.date) && new Date(i.date).getFullYear().toString() === filterYear);
      fExpense = fExpense.filter(e => isValidDate(e.date) && new Date(e.date).getFullYear().toString() === filterYear);
    }

    setFilteredIncome(fIncome);
    setFilteredExpenses(fExpense);
    
    const totalInc = fIncome.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const totalExp = fExpense.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    setFilteredSummary({
      totalIncome: totalInc,
      totalExpenses: totalExp,
      balance: totalInc - totalExp
    });
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [incomeRes, expenseRes, summaryRes] = await Promise.all([
        fetch('/api/income', { headers }),
        fetch('/api/expenses', { headers }),
        fetch('/api/summary', { headers })
      ]);

      if (incomeRes.ok && expenseRes.ok && summaryRes.ok) {
        const incomeData = await incomeRes.json();
        const expenseData = await expenseRes.json();
        const summaryData = await summaryRes.json();

        // Ensure amounts are numbers
        setIncome(incomeData.map((i: any) => ({ ...i, amount: Number(i.amount) })));
        setExpenses(expenseData.map((e: any) => ({ ...e, amount: Number(e.amount) })));
        setSummary({
          totalIncome: Number(summaryData.totalIncome),
          totalExpenses: Number(summaryData.totalExpenses),
          balance: Number(summaryData.balance)
        });
      } else if (incomeRes.status === 401) {
        handleLogout();
      } else {
        setError('Failed to fetch data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('token', data.token);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries());
    
    // Convert amount to number correctly for the database
    if (data.amount) {
      const parsedAmount = parseFloat(data.amount as string);
      if (isNaN(parsedAmount)) {
        setError("Invalid amount format.");
        setIsLoading(false);
        return;
      }
      data.amount = parsedAmount as any;
    }
    
    const url = (modalType === 'income' || modalType === 'income') ? '/api/income' : '/api/expenses';
    const method = editingItem ? 'PUT' : 'POST';
    const body = editingItem ? { ...data, id: editingItem.id } : data;

    try {
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        setIsModalOpen(false);
        setEditingItem(null);
        fetchData();
      } else {
        const errData = await res.json();
        setError(errData.message || 'Failed to save item');
      }
    } catch (err) {
      setError('Network error. Failed to save item');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async (type: 'income' | 'expense', id: number) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    try {
      const res = await fetch(`/api/${type === 'income' ? 'income' : 'expenses'}?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      setError('Failed to delete item');
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    
    // Add Logo (Placeholder - You can replace this with your actual base64 logo string)
    // Using a simple blue square as a placeholder for the logo
    doc.setFillColor(37, 99, 235); // Tailwind blue-600
    doc.rect(14, 10, 20, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('SD', 20, 22);
    
    // Company Info
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Skenetic Digital', 40, 20);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('137/24 bhagavathi bhavanam, sbi opposite, srivilliputtur', 40, 26);
    doc.text('Phone: 9080917850, 8300226818', 40, 31);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 35, 196, 35);
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Report', 14, 45);
    
    const tableData = [
      ...income.map(i => [i.date, 'Income', i.source, formatCurrency(i.amount)]),
      ...expenses.map(e => [e.date, 'Expense', e.category, formatCurrency(e.amount)])
    ].sort((a, b) => new Date(b[0] as string).getTime() - new Date(a[0] as string).getTime());

    autoTable(doc, {
      head: [['Date', 'Type', 'Category/Source', 'Amount']],
      body: tableData,
      startY: 50,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] }
    });

    doc.save('skenetic-digital-report.pdf');
  };

  const exportCSV = () => {
    const data = [
      ...income.map(i => ({ date: i.date, type: 'Income', category: i.source, amount: i.amount, notes: i.notes })),
      ...expenses.map(e => ({ date: e.date, type: 'Expense', category: e.category, amount: e.amount, notes: e.description }))
    ];
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'fintrack-data.csv';
    link.click();
  };

  const [uploadData, setUploadData] = useState<any[]>([]);
  const [uploadType, setUploadType] = useState<'income' | 'expense'>('income');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setUploadData(results.data);
      },
      error: (err) => {
        setError('Failed to parse CSV file');
      }
    });
  };

  const handleBulkInsert = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/bulk-insert', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type: uploadType, data: uploadData })
      });

      if (res.ok) {
        setUploadData([]);
        fetchData();
        setActiveTab('dashboard');
        alert('Bulk upload successful!');
      } else {
        const contentType = res.headers.get('content-type');
        let errorMessage = 'Failed to perform bulk insert';
        
        if (contentType && contentType.includes('application/json')) {
          const errData = await res.json();
          errorMessage = errData.message || errorMessage;
        } else {
          errorMessage = await res.text();
        }

        if (res.status === 413) {
          setError('File too large. Please upload a smaller CSV or increase server limits.');
        } else if (res.status === 401 || res.status === 403) {
          setError(`Session Error: ${errorMessage}. Please sign out and sign in again.`);
        } else {
          setError(`Upload Error: ${errorMessage}`);
        }
      }
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 border border-zinc-100 dark:border-zinc-800"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
              <TrendingUp className="text-white" size={32} />
            </div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Skenetic Digital</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-2">Manage your accounts with precision</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Email Address</label>
              <input 
                type="email" 
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="admin@fintrack.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Password</label>
              <input 
                type="password" 
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          

        </motion.div>
      </div>
    );
  }

  const chartData = [
    { name: 'Income', value: summary.totalIncome, color: '#10b981' },
    { name: 'Expenses', value: summary.totalExpenses, color: '#ef4444' },
  ];

  const monthlyData = [
    { name: 'Jan', income: 4000, expense: 2400 },
    { name: 'Feb', income: 3000, expense: 1398 },
    { name: 'Mar', income: 2000, expense: 9800 },
    { name: 'Apr', income: 2780, expense: 3908 },
    { name: 'May', income: 1890, expense: 4800 },
    { name: 'Jun', income: 2390, expense: 3800 },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 flex">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-zinc-950 border-r border-zinc-100 dark:border-zinc-900 transition-transform lg:translate-x-0",
        !isSidebarOpen && "-translate-x-full"
      )}>
        <div className="h-full flex flex-col p-6">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <TrendingUp className="text-white" size={20} />
            </div>
            <span className="text-xl font-bold tracking-tight">Skenetic Digital</span>
          </div>

          <nav className="flex-1 space-y-1">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'income', label: 'Income', icon: TrendingUp },
              { id: 'expenses', label: 'Expenses', icon: TrendingDown },
              { id: 'reports', label: 'Reports', icon: FileText },
              { id: 'upload', label: 'Bulk Upload', icon: Upload },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                  activeTab === item.id 
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" 
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                )}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="pt-6 border-t border-zinc-100 dark:border-zinc-900 space-y-2">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              {isDarkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "flex-1 transition-all duration-300",
        isSidebarOpen ? "lg:ml-64" : "ml-0"
      )}>
        <header className="h-16 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-900 sticky top-0 z-30 px-6 flex items-center justify-between">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-colors">
            <Menu size={20} />
          </button>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-full px-4 py-1.5 border border-zinc-200 dark:border-zinc-800">
              <Search size={16} className="text-zinc-400 mr-2" />
              <input type="text" placeholder="Search..." className="bg-transparent text-sm outline-none w-40" />
            </div>
            <div className="w-8 h-8 bg-zinc-200 dark:bg-zinc-800 rounded-full flex items-center justify-center text-xs font-bold">
              AD
            </div>
          </div>
        </header>

        <div className="p-6 max-w-7xl mx-auto space-y-6">
          {activeTab === 'dashboard' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-l-4 border-l-emerald-500">
                  <p className="text-sm text-zinc-500 mb-1">Total Income</p>
                  <h2 className="text-2xl font-bold text-emerald-600">{formatCurrency(summary.totalIncome)}</h2>
                </Card>
                <Card className="border-l-4 border-l-rose-500">
                  <p className="text-sm text-zinc-500 mb-1">Total Expenses</p>
                  <h2 className="text-2xl font-bold text-rose-600">{formatCurrency(summary.totalExpenses)}</h2>
                </Card>
                <Card className="border-l-4 border-l-blue-500">
                  <p className="text-sm text-zinc-500 mb-1">Current Balance</p>
                  <h2 className="text-2xl font-bold text-blue-600">{formatCurrency(summary.balance)}</h2>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <h3 className="text-lg font-semibold mb-6">Income vs Expenses</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="income" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card>
                  <h3 className="text-lg font-semibold mb-6">Budget Allocation</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              <Card>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-semibold">Recent Transactions</h3>
                  <button onClick={() => setActiveTab('reports')} className="text-sm text-blue-600 hover:underline">View All</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-sm text-zinc-500 border-b border-zinc-100 dark:border-zinc-800">
                        <th className="pb-4 font-medium">Date</th>
                        <th className="pb-4 font-medium">Description</th>
                        <th className="pb-4 font-medium">Category</th>
                        <th className="pb-4 font-medium text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {[...income, ...expenses].slice(0, 5).map((item: any, i) => (
                        <tr key={i} className="text-sm">
                          <td className="py-4">{formatDate(item.date)}</td>
                          <td className="py-4">{item.source || item.description}</td>
                          <td className="py-4">
                            <span className={cn(
                              "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                              item.source ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20" : "bg-rose-50 text-rose-600 dark:bg-rose-900/20"
                            )}>
                              {item.source ? 'Income' : 'Expense'}
                            </span>
                          </td>
                          <td className={cn("py-4 text-right font-semibold", item.source ? "text-emerald-600" : "text-rose-600")}>
                            {item.source ? '+' : '-'}{formatCurrency(item.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </motion.div>
          )}

          {(activeTab === 'income' || activeTab === 'expenses') && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-2xl font-bold capitalize">{activeTab} Management</h2>
                <button 
                  onClick={() => {
                    setModalType(activeTab.endsWith('s') ? activeTab.slice(0, -1) as 'income' | 'expense' : activeTab as 'income' | 'expense');
                    setEditingItem(null);
                    setIsModalOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                >
                  <Plus size={18} />
                  Add New {activeTab === 'income' ? 'Income' : 'Expense'}
                </button>
              </div>

              <Card>
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                    <input 
                      type="text" 
                      placeholder={`Search ${activeTab}...`} 
                      className="w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all">
                    <Filter size={18} />
                    Filter
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-sm text-zinc-500 border-b border-zinc-100 dark:border-zinc-800">
                        <th className="pb-4 font-medium">Date</th>
                        <th className="pb-4 font-medium">{activeTab === 'income' ? 'Source' : 'Category'}</th>
                        <th className="pb-4 font-medium">Amount</th>
                        <th className="pb-4 font-medium">Notes/Description</th>
                        <th className="pb-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {(activeTab === 'income' ? income : expenses).map((item: any) => (
                        <tr key={item.id} className="text-sm group hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                          <td className="py-4">{formatDate(item.date)}</td>
                          <td className="py-4 font-medium">{item.source || item.category}</td>
                          <td className="py-4 font-semibold text-blue-600">{formatCurrency(item.amount)}</td>
                          <td className="py-4 text-zinc-500 max-w-xs truncate">{item.notes || item.description}</td>
                          <td className="py-4 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => {
                                  setEditingItem(item);
                                  setModalType(activeTab.endsWith('s') ? activeTab.slice(0, -1) as any : activeTab as any);
                                  setIsModalOpen(true);
                                }}
                                className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button 
                                onClick={() => handleDeleteItem(activeTab as 'income' | 'expense', item.id)}
                                className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <p className="text-sm text-zinc-500">Showing {Math.min(1, (activeTab === 'income' ? income : expenses).length)} to {(activeTab === 'income' ? income : expenses).length} of {(activeTab === 'income' ? income : expenses).length} entries</p>
                  <div className="flex gap-2">
                    <button className="p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50">
                      <ChevronLeft size={16} />
                    </button>
                    <button className="p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'reports' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-2xl font-bold">Financial Reports</h2>
                <div className="flex gap-3">
                  <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all">
                    <Download size={18} />
                    Export CSV
                  </button>
                  <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl hover:opacity-90 transition-all">
                    <FileText size={18} />
                    Export PDF
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="md:col-span-1">
                  <h3 className="font-semibold mb-4">Report Filters</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Month</label>
                      <select 
                        value={filterMonth}
                        onChange={(e) => setFilterMonth(e.target.value)}
                        className="w-full p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent outline-none"
                      >
                        <option value="All">All Months</option>
                        <option>January</option>
                        <option>February</option>
                        <option>March</option>
                        <option>April</option>
                        <option>May</option>
                        <option>June</option>
                        <option>July</option>
                        <option>August</option>
                        <option>September</option>
                        <option>October</option>
                        <option>November</option>
                        <option>December</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Year</label>
                      <select 
                        value={filterYear}
                        onChange={(e) => setFilterYear(e.target.value)}
                        className="w-full p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent outline-none"
                      >
                        <option value="All">All Years</option>
                        <option>2026</option>
                        <option>2025</option>
                        <option>2024</option>
                      </select>
                    </div>
                    <button 
                      onClick={applyFilters}
                      className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium"
                    >
                      Apply Filters
                    </button>
                  </div>
                </Card>

                <Card className="md:col-span-3">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-semibold">Monthly Summary</h3>
                    <div className="flex gap-4 text-sm">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                        <span>Profit</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 bg-rose-500 rounded-full"></div>
                        <span>Loss</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl">
                        <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider mb-1">Total Income</p>
                        <p className="text-xl font-bold text-emerald-700">{formatCurrency(filteredSummary.totalIncome)}</p>
                      </div>
                      <div className="p-4 bg-rose-50 dark:bg-rose-900/10 rounded-2xl">
                        <p className="text-xs text-rose-600 font-bold uppercase tracking-wider mb-1">Total Expense</p>
                        <p className="text-xl font-bold text-rose-700">{formatCurrency(filteredSummary.totalExpenses)}</p>
                      </div>
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-2xl">
                        <p className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-1">Net Balance</p>
                        <p className="text-xl font-bold text-blue-700">{formatCurrency(filteredSummary.balance)}</p>
                      </div>
                    </div>

                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} />
                          <YAxis axisLine={false} tickLine={false} />
                          <Tooltip />
                          <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </Card>
              </div>
            </motion.div>
          )}

          {activeTab === 'upload' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <h2 className="text-2xl font-bold">Bulk Data Upload</h2>
              
              {error && (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 text-sm flex items-center gap-2 border border-red-100 dark:border-red-900/20">
                  <AlertCircle size={18} />
                  {error}
                </div>
              )}
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800">
                  <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-full flex items-center justify-center mb-4">
                    <Upload size={32} />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Upload your file</h3>
                  <p className="text-sm text-zinc-500 mb-6 text-center max-w-xs">
                    Drag and drop your CSV file here, or click to browse.
                  </p>
                  <div className="flex flex-col gap-4 items-center">
                    <select 
                      value={uploadType}
                      onChange={(e) => setUploadType(e.target.value as 'income' | 'expense')}
                      className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent outline-none"
                    >
                      <option value="income">Income Data</option>
                      <option value="expense">Expense Data</option>
                    </select>
                    <label className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all cursor-pointer shadow-lg shadow-blue-500/20">
                      Browse Files
                      <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
                    </label>
                  </div>
                </Card>

                <Card>
                  <h3 className="font-semibold mb-4">Instructions</h3>
                  <div className="space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
                    <div className="flex gap-3">
                      <div className="w-6 h-6 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</div>
                      <p>Ensure your CSV has headers: <strong>date, source, amount, notes</strong> (for Income) or <strong>date, category, amount, description</strong> (for Expenses).</p>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-6 h-6 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</div>
                      <p>Date format should be YYYY-MM-DD.</p>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-6 h-6 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-xs font-bold shrink-0">3</div>
                      <p>Upload the file and review the data preview before final insertion.</p>
                    </div>
                  </div>
                </Card>
              </div>

              <Card>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-semibold">Data Preview ({uploadData.length} records)</h3>
                  <button 
                    onClick={handleBulkInsert}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all disabled:opacity-50" 
                    disabled={uploadData.length === 0 || isLoading}
                  >
                    {isLoading ? 'Inserting...' : 'Confirm Upload'}
                  </button>
                </div>
                <div className="overflow-x-auto max-h-[400px]">
                  {uploadData.length > 0 ? (
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-sm text-zinc-500 border-b border-zinc-100 dark:border-zinc-800">
                          {Object.keys(uploadData[0]).map(key => (
                            <th key={key} className="pb-4 font-medium capitalize">{key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {uploadData.slice(0, 10).map((row, i) => (
                          <tr key={i} className="text-sm">
                            {Object.values(row).map((val: any, j) => (
                              <td key={j} className="py-3">{val}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="h-40 flex items-center justify-center text-zinc-400 border border-zinc-100 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-900/50">
                      No data to preview. Please upload a file.
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          )}
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {isModalOpen && (
          <Modal 
            isOpen={isModalOpen} 
            onClose={() => setIsModalOpen(false)} 
            title={editingItem ? `Edit ${modalType}` : `Add New ${modalType}`}
          >
            <form onSubmit={handleSaveItem} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Date</label>
                <input 
                  type="date" 
                  name="date"
                  defaultValue={editingItem?.date || new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  {modalType === 'income' ? 'Source' : 'Category'}
                </label>
                <input 
                  type="text" 
                  name={modalType === 'income' ? 'source' : 'category'}
                  defaultValue={editingItem?.source || editingItem?.category || ''}
                  placeholder={modalType === 'income' ? 'e.g. Salary' : 'e.g. Rent'}
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Amount</label>
                <input 
                  type="number" 
                  name="amount"
                  step="0.01"
                  defaultValue={editingItem?.amount || ''}
                  placeholder="0.00"
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  {modalType === 'income' ? 'Notes' : 'Description'}
                </label>
                <textarea 
                  name={modalType === 'income' ? 'notes' : 'description'}
                  defaultValue={editingItem?.notes || editingItem?.description || ''}
                  rows={3}
                  className="w-full px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                ></textarea>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all font-medium"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-medium shadow-lg shadow-blue-500/20"
                >
                  {isLoading ? 'Saving...' : (editingItem ? 'Update' : 'Save')} {modalType}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
