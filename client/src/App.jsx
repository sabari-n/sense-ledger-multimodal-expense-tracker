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
const INITIAL_TRANSFER = { from_account: '', to_account: '', amount: '', description: '', date: '' };

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
  // Transfers move money between your own accounts, so they are neither income nor spend.
  let totalIncome = 0, totalSpend = 0;
  expenses.forEach(e => {
    if (e.transaction_type === 'income') totalIncome += parseFloat(e.amount);
    else if (e.transaction_type === 'expense') totalSpend += parseFloat(e.amount);
  });

  // ==================== EXPENSE HANDLERS ====================
  const openExpenseModal = (exp = null) => {
    if (exp) {
      setExpenseModalData({
        id: exp.id, type: exp.transaction_type || 'expense', amount: exp.amount,
        category: exp.category, subcategory: exp.subcategory || '',
        account: exp.account || '', to_account: exp.to_account || '', desc: exp.original_text,
        date: exp.date,
      });
    } else {
      setExpenseModalData(INITIAL_EXPENSE_MODAL);
    }
    setShowExpenseModal(true);
  };

  const handleExpenseSave = async (e) => {
    e.preventDefault();
    const { id, type } = expenseModalData;
    try {
      if (type === 'transfer' && !id) {
        await transferFunds({
          from_account: expenseModalData.account,
          to_account: expenseModalData.to_account,
          amount: expenseModalData.amount,
          description: expenseModalData.desc,
          date: expenseModalData.date || undefined,
        });
        fetchExpenses();
      } else {
        // Editing an existing transfer updates it in place instead of creating a new one.
        const payload = {
          transaction_type: type, amount: expenseModalData.amount,
          category: type === 'transfer' ? 'Transfer' : expenseModalData.category,
          subcategory: type === 'transfer' ? '' : expenseModalData.subcategory,
          account: expenseModalData.account, original_text: expenseModalData.desc,
          date: expenseModalData.date || undefined, // unset on a new entry -> saved as now
          ...(type === 'transfer' ? { to_account: expenseModalData.to_account } : {}),
        };
        if (id) await updateExpense(id, payload);
        else await createExpense(payload);
        fetchAccounts();
      }
      setShowExpenseModal(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not save the transaction.');
    }
  };

  // Returns true when the transaction was deleted (false if the user cancelled).
  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Delete transaction?')) return false;
    try {
      await deleteExpense(id);
      fetchAccounts();
      return true;
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete the transaction.');
      return false;
    }
  };

  const handleUploadAudio = async (blob, ext) => {
    const result = await uploadAudio(blob, ext);
    fetchAccounts();
    return result;
  };

  // ==================== ACCOUNT HANDLERS ====================
  const openAccountModal = (acc = null) => {
    if (acc) {
      setAccountModalData({ id: acc.id, name: acc.name, account_type: acc.account_type, balance: acc.balance, icon: acc.icon, color: acc.color, is_default: acc.is_default });
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
      // A balance change is recorded as an adjustment transaction — refresh the list.
      fetchExpenses();
    } catch (err) { alert(err.response?.data?.error || 'Failed to save account.'); }
  };

  const handleDeleteAccount = async (id) => {
    if (!window.confirm('Delete account? Transactions will be moved to the default account.')) return;
    try {
      await deleteAccount(id);
      setShowAccountModal(false);
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

        {/* Add FAB (mobile only shows via CSS). Transactions and Accounts render their own
            buttons in the same spot; showing this one there too would cover them, so on
            Accounts the + would open "Add Transaction" instead of "Add Account". */}
        {(activeScreen === 'analytics' || activeScreen === 'record') && (
          <div className="app-fab-mobile">
            <button className="fab-btn primary" onClick={() => openExpenseModal()}>
              <i className="fa-solid fa-plus"></i>
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {showExpenseModal && (
        <ExpenseModal
          data={expenseModalData}
          accounts={accounts}
          onChange={setExpenseModalData}
          onSave={handleExpenseSave}
          onClose={() => setShowExpenseModal(false)}
          onDelete={async () => { if (await handleDeleteExpense(expenseModalData.id)) setShowExpenseModal(false); }}
          currencySymbol={currencySymbol}
        />
      )}
      {showAccountModal && (
        <AccountModal
          data={accountModalData}
          onChange={setAccountModalData}
          onSave={handleAccountSave}
          onDelete={handleDeleteAccount}
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
