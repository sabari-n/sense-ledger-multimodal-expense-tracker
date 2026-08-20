import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useRecorder } from '../hooks/useRecorder';
import { useCategories } from '../hooks/useCategories';
import { formatIndian } from '../utils/format';

function getCategoryEmoji(category, categories) {
  if (!category) return '📋';
  const found = categories.find(c => c.name.toLowerCase() === category.toLowerCase());
  return found ? found.emoji : '📋';
}

function groupByDate(expenses) {
  const grouped = {};
  expenses.forEach(exp => {
    const d = new Date(exp.date);
    const key = d.toISOString().split('T')[0];
    if (!grouped[key]) grouped[key] = { date: d, income: 0, expense: 0, items: [] };
    grouped[key].items.push(exp);
    if (exp.transaction_type === 'income') grouped[key].income += parseFloat(exp.amount);
    else if (exp.transaction_type === 'expense') grouped[key].expense += parseFloat(exp.amount);
  });
  return Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));
}

function filterByMonth(expenses, year, month) {
  return expenses.filter(exp => {
    const d = new Date(exp.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const VIEW_TABS = ['Daily', 'Calendar', 'Monthly', 'Summary'];

export default function TransactionsScreen({ expenses, onAdd, onEdit, onDelete, onUploadAudio, currencySymbol = '₹' }) {
  const { categories, fetchCategories } = useCategories();

  useEffect(() => {
    fetchCategories();
  }, []);

  const now = new Date();
  const [year, setYear]       = useState(now.getFullYear());
  const [month, setMonth]     = useState(now.getMonth());
  const [activeTab, setActiveTab] = useState('Daily');

  const [statusText, setStatusText]   = useState('Tap mic to record');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRecordingComplete = useCallback(async (blob, ext) => {
    setStatusText('Processing...');
    setIsProcessing(true);
    try {
      const result = await onUploadAudio(blob, ext);
      if (result?.success) {
        setStatusText('Recorded!');
        setTimeout(() => setStatusText('Tap mic to record'), 3000);
      } else { setStatusText('Failed. Try again.'); }
    } catch { setStatusText('Failed. Try again.'); }
    finally  { setIsProcessing(false); }
  }, [onUploadAudio]);

  const { isRecording, toggleRecording } = useRecorder(handleRecordingComplete);

  const filtered = useMemo(() => filterByMonth(expenses, year, month), [expenses, year, month]);
  const grouped  = useMemo(() => groupByDate(filtered), [filtered]);

  const totalIncome  = filtered.reduce((s, e) => e.transaction_type === 'income'  ? s + parseFloat(e.amount) : s, 0);
  const totalExpense = filtered.reduce((s, e) => e.transaction_type !== 'income'  ? s + parseFloat(e.amount) : s, 0);
  const total        = totalIncome - totalExpense;

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11){ setMonth(0);  setYear(y => y + 1); } else setMonth(m => m + 1); };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Top Header */}
      <div className="top-header">
        <div className="top-header-left">
          <button className="icon-btn"><i className="fa-solid fa-magnifying-glass"></i></button>
          <h1>Transactions</h1>
        </div>
        <div className="top-header-right">
          {/* Desktop add button — shown via CSS on ≥768px */}
          <button className="desktop-add-btn" onClick={() => onAdd()}>
            <i className="fa-solid fa-plus"></i> Add Transaction
          </button>
          <button className="icon-btn"><i className="fa-solid fa-sliders"></i></button>
        </div>
      </div>

      {/* Month Navigator */}
      <div className="month-navigator">
        <button onClick={prevMonth}><i className="fa-solid fa-chevron-left"></i> Prev</button>
        <span>{MONTHS[month]} {year}</span>
        <button onClick={nextMonth}>Next <i className="fa-solid fa-chevron-right"></i></button>
      </div>

      {/* Inline Mic Recorder */}
      <div className="inline-mic-bar">
        <button className={`inline-mic-btn ${isRecording ? 'recording' : ''}`} onClick={toggleRecording}>
          <i className={`fa-solid ${isRecording ? 'fa-stop' : 'fa-microphone'}`}></i>
        </button>
        <span className={`inline-mic-status ${isProcessing ? 'processing' : ''}`}>{statusText}</span>
      </div>

      {/* View Tabs */}
      <div className="view-tabs">
        {VIEW_TABS.map(tab => (
          <button key={tab} className={`view-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {/* Summary Row */}
      <div className="summary-row">
        <div className="summary-item">
          <span className="summary-label">Income</span>
          <span className="summary-value income">{currencySymbol}&nbsp;{formatIndian(totalIncome)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Expenses</span>
          <span className="summary-value expense">{currencySymbol}&nbsp;{formatIndian(totalExpense)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Total</span>
          <span className="summary-value total">{total < 0 ? '-' : ''}{currencySymbol}&nbsp;{formatIndian(Math.abs(total))}</span>
        </div>
      </div>

      {/* Transaction List */}
      <div className="screen-content">
        {grouped.length === 0 ? (
          <div className="empty-state">
            <i className="fa-solid fa-receipt"></i>
            <h3>No transactions yet</h3>
            <p>Add your first transaction using the <strong>+ Add Transaction</strong> button<br />or tap the mic to record with your voice.</p>
          </div>
        ) : grouped.map(([dateKey, group]) => {
          const d       = new Date(group.date);
          const dayNum  = d.getDate().toString().padStart(2, '0');
          const dayName = DAYS[d.getDay()];

          return (
            <div key={dateKey} className="date-group">
              <div className="date-group-header">
                <span className="date-day-number">{dayNum}</span>
                <span className="date-day-badge">{dayName}</span>
                <div className="date-totals">
                  <span className="date-total-income">{currencySymbol}&nbsp;{formatIndian(group.income)}</span>
                  <span className="date-total-expense">{currencySymbol}&nbsp;{formatIndian(group.expense)}</span>
                </div>
              </div>

              {group.items.map(exp => {
                const isIncome   = exp.transaction_type === 'income';
                const isTransfer = exp.transaction_type === 'transfer' || exp.category?.toLowerCase().includes('transfer');
                const emoji      = isTransfer ? '🔄' : getCategoryEmoji(exp.category, categories);
                const amountClass= isTransfer ? 'transfer' : isIncome ? 'income' : 'expense';

                return (
                  <div key={exp.id} className="transaction-row" onClick={() => onEdit(exp)}>
                    <div className="txn-category-col">
                      <span className="txn-category-icon">{emoji} {exp.category || 'Other'}</span>
                      <span className="txn-subcategory">{exp.subcategory || ''}</span>
                    </div>
                    <div className="txn-details-col">
                      <span className="txn-description">{exp.original_text || exp.category}</span>
                      <span className="txn-account">{exp.account || 'Cash'}{isTransfer ? ` → ${exp.to_account || ''}` : ''}</span>
                    </div>
                    <div className="txn-amount-col">
                      <span className={`txn-amount ${amountClass}`}>
                        {isIncome ? '+' : isTransfer ? '' : '-'}{currencySymbol}&nbsp;{formatIndian(parseFloat(exp.amount))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* FABs — mobile only (hidden on desktop via CSS) */}
      <div className="fab-container">
        <button className="fab-btn" onClick={() => {}}><i className="fa-solid fa-clipboard-list"></i></button>
        <button className="fab-btn primary" onClick={() => onAdd()}><i className="fa-solid fa-plus"></i></button>
      </div>
    </div>
  );
}
