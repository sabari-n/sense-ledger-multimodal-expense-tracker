import React, { useState } from 'react';
import './App.css';

// Hooks
import { useExpenses } from './hooks/useExpenses';
import { useAccounts } from './hooks/useAccounts';
import { useConfig } from './hooks/useConfig';

// Screens
import RecordScreen from './components/RecordScreen';
import TransactionsScreen from './components/TransactionsScreen';
import AccountsScreen from './components/AccountsScreen';
import AnalyticsScreen from './components/AnalyticsScreen';
import BottomNav from './components/BottomNav';
import SideNav from './components/SideNav';

// Modals
import ExpenseModal from './components/modals/ExpenseModal';
import AccountModal from './components/modals/AccountModal';
import TransferModal from './components/modals/TransferModal';

const INITIAL_EXPENSE_MODAL = { id: '', type: 'expense', amount: '', category: '', subcategory: '', account: '', to_account: '', desc: '' };
const INITIAL_ACCOUNT_MODAL = { id: '', name: '', account_type: 'general', balance: '0', icon: 'fa-wallet', color: '#10a37a' };
const INITIAL_TRANSFER = { from_account: '', to_account: '', amount: '', description: '' };

function App() {
  const [activeScreen, setActiveScreen] = useState('transactions');

  // Config hook
  const { currencySymbol } = useConfig();

  // Data hooks
  const { expenses, fetchExpenses, createExpense, updateExpense, deleteExpense, uploadAudio } = useExpenses();
  const { accounts, fetchAccounts, createAccount, updateAccount, deleteAccount, transferFunds } = useAccounts();

  // Modal visibility
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  // Modal data
  const [expenseModalData, setExpenseModalData] = useState(INITIAL_EXPENSE_MODAL);
  const [accountModalData, setAccountModalData] = useState(INITIAL_ACCOUNT_MODAL);
  const [transferData, setTransferData] = useState(INITIAL_TRANSFER);

  // ==================== CALCULATIONS ====================
  let totalIncome = 0, totalSpend = 0;
  expenses.forEach(e => {
    if (e.transaction_type === 'income') totalIncome += parseFloat(e.amount);
    else totalSpend += parseFloat(e.amount);
  });

  // ==================== EXPENSE HANDLERS ====================
  const openExpenseModal = (exp = null) => {
    if (exp) {
      setExpenseModalData({
        id: exp.id, type: exp.transaction_type || 'expense', amount: exp.amount,
        category: exp.category, subcategory: exp.subcategory || '',
        account: exp.account || 'Cash', to_account: exp.to_account || 'Bank', desc: exp.original_text,
      });
    } else {
      setExpenseModalData(INITIAL_EXPENSE_MODAL);
    }
    setShowExpenseModal(true);
  };

  const handleExpenseSave = async (e) => {
    e.preventDefault();
    if (expenseModalData.type === 'transfer') {
      try {
        await transferFunds({
          from_account: expenseModalData.account,
          to_account: expenseModalData.to_account,
          amount: expenseModalData.amount,
          description: expenseModalData.desc
        });
        setShowExpenseModal(false);
        fetchExpenses();
        return;
      } catch (err) {
        alert(err.response?.data?.error || 'Transfer failed.');
        return;
      }
    }
    const payload = {
      transaction_type: expenseModalData.type, amount: expenseModalData.amount,
      category: expenseModalData.category, subcategory: expenseModalData.subcategory,
      account: expenseModalData.account, original_text: expenseModalData.desc,
    };
    try {
      if (expenseModalData.id) await updateExpense(expenseModalData.id, payload);
      else await createExpense(payload);
      setShowExpenseModal(false);
      fetchAccounts();
    } catch (err) { console.error(err); }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Delete transaction?')) return;
    await deleteExpense(id);
    fetchAccounts();
  };

  const handleUploadAudio = async (blob, ext) => {
    const result = await uploadAudio(blob, ext);
    fetchAccounts();
    return result;
  };

  // ==================== ACCOUNT HANDLERS ====================
  const openAccountModal = (acc = null) => {
    if (acc) {
      setAccountModalData({ id: acc.id, name: acc.name, account_type: acc.account_type, balance: acc.balance, icon: acc.icon, color: acc.color });
    } else {
      setAccountModalData(INITIAL_ACCOUNT_MODAL);
    }
    setShowAccountModal(true);
  };

  const handleAccountSave = async (e) => {
    e.preventDefault();
    try {
      if (accountModalData.id) await updateAccount(accountModalData.id, accountModalData);
      else await createAccount(accountModalData);
      setShowAccountModal(false);
    } catch (err) { alert(err.response?.data?.error || 'Failed to save account.'); }
  };

  const handleDeleteAccount = async (id) => {
    if (!window.confirm('Delete account? Transactions will be moved to the default account.')) return;
    try {
      await deleteAccount(id);
      fetchExpenses();
    } catch (err) { alert(err.response?.data?.error || 'Failed to delete account.'); }
  };

  // ==================== TRANSFER HANDLER ====================
  const handleTransfer = async (e) => {
    e.preventDefault();
    try {
      await transferFunds(transferData);
      setShowTransferModal(false);
      setTransferData(INITIAL_TRANSFER);
      fetchExpenses();
    } catch (err) { alert(err.response?.data?.error || 'Transfer failed.'); }
  };

  // ==================== RENDER ====================
  return (
    <div className="app-shell">
      {/* Desktop Sidebar — hidden on mobile via CSS */}
      <SideNav
        activeScreen={activeScreen}
        onNavigate={setActiveScreen}
        netBalance={totalIncome - totalSpend}
        totalIncome={totalIncome}
        totalSpend={totalSpend}
        currencySymbol={currencySymbol}
      />

      {/* Main content area */}
      <div className="app-main">
        <main className="app-content">
          {activeScreen === 'record' && (
            <RecordScreen
              netBalance={totalIncome - totalSpend}
              totalIncome={totalIncome}
              totalSpend={totalSpend}
              onUploadAudio={handleUploadAudio}
              currencySymbol={currencySymbol}
            />
          )}
          {activeScreen === 'transactions' && (
            <TransactionsScreen
              expenses={expenses}
              onAdd={openExpenseModal}
              onEdit={openExpenseModal}
              onDelete={handleDeleteExpense}
              onUploadAudio={handleUploadAudio}
              currencySymbol={currencySymbol}
            />
          )}
          {activeScreen === 'accounts' && (
            <AccountsScreen
              accounts={accounts}
              onAdd={openAccountModal}
              onEdit={openAccountModal}
              onDelete={handleDeleteAccount}
              onTransfer={() => setShowTransferModal(true)}
              currencySymbol={currencySymbol}
            />
          )}
          {activeScreen === 'analytics' && (
            <AnalyticsScreen
              expenses={expenses}
              currencySymbol={currencySymbol}
            />
          )}
        </main>

        {/* Mobile bottom nav — hidden on desktop via CSS */}
        <BottomNav activeScreen={activeScreen} onNavigate={setActiveScreen} />

        {/* Add FAB (mobile only shows via CSS) */}
        <div className="app-fab-mobile">
          <button className="fab-btn primary" onClick={() => openExpenseModal()}>
            <i className="fa-solid fa-plus"></i>
          </button>
        </div>
      </div>

      {/* Modals */}
      {showExpenseModal && (
        <ExpenseModal
          data={expenseModalData}
          accounts={accounts}
          onChange={setExpenseModalData}
          onSave={handleExpenseSave}
          onClose={() => setShowExpenseModal(false)}
          onDelete={() => { handleDeleteExpense(expenseModalData.id); setShowExpenseModal(false); }}
          currencySymbol={currencySymbol}
        />
      )}
      {showAccountModal && (
        <AccountModal
          data={accountModalData}
          onChange={setAccountModalData}
          onSave={handleAccountSave}
          onClose={() => setShowAccountModal(false)}
          currencySymbol={currencySymbol}
        />
      )}
      {showTransferModal && (
        <TransferModal
          data={transferData}
          accounts={accounts}
          onChange={setTransferData}
          onSave={handleTransfer}
          onClose={() => setShowTransferModal(false)}
          currencySymbol={currencySymbol}
        />
      )}
    </div>
  );
}

export default App;
