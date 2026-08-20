import React from 'react';
import { formatIndian } from '../utils/format';

// Group accounts by their account_type
const TYPE_LABELS = {
  cash: 'Cash',
  bank: 'Accounts',
  credit_card: 'Card',
  digital_wallet: 'Debit Card',
  savings: 'Savings',
  investment: 'Investment',
  general: 'General',
};

const TYPE_ORDER = ['cash', 'bank', 'credit_card', 'digital_wallet', 'savings', 'investment', 'general'];

function groupByType(accounts) {
  const groups = {};
  accounts.forEach(acc => {
    const type = acc.account_type || 'general';
    if (!groups[type]) groups[type] = { accounts: [], total: 0 };
    groups[type].accounts.push(acc);
    groups[type].total += parseFloat(acc.computed_balance || 0);
  });
  // Sort by TYPE_ORDER
  return TYPE_ORDER
    .filter(t => groups[t])
    .map(t => ({ type: t, label: TYPE_LABELS[t] || t, ...groups[t] }));
}

export default function AccountsScreen({ accounts, onAdd, onEdit, onDelete, onTransfer, currencySymbol = '₹' }) {
  const totalAssets = accounts.reduce(
    (sum, acc) => {
      const bal = parseFloat(acc.computed_balance || 0);
      return bal > 0 ? sum + bal : sum;
    }, 0
  );
  const totalLiabilities = accounts.reduce(
    (sum, acc) => {
      const bal = parseFloat(acc.computed_balance || 0);
      return bal < 0 ? sum + Math.abs(bal) : sum;
    }, 0
  );
  const totalNet = totalAssets - totalLiabilities;

  const grouped = groupByType(accounts);

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Top Header */}
      <div className="top-header">
        <div className="top-header-left">
          <h1>Accounts</h1>
        </div>
        <div className="top-header-right">
          <button className="desktop-add-btn" onClick={() => onAdd()}>
            <i className="fa-solid fa-plus"></i> Add Account
          </button>
          <button className="icon-btn" onClick={onTransfer} title="Transfer">
            <i className="fa-solid fa-arrow-right-arrow-left"></i>
          </button>
        </div>
      </div>

      {/* Summary Row */}
      <div className="summary-row">
        <div className="summary-item">
          <span className="summary-label">Account</span>
          <span className="summary-value income">{currencySymbol} {formatIndian(totalAssets)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Liabilities</span>
          <span className="summary-value expense">{currencySymbol} {formatIndian(totalLiabilities)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Total</span>
          <span className="summary-value total">{totalNet < 0 ? '-' : ''}{currencySymbol} {formatIndian(Math.abs(totalNet))}</span>
        </div>
      </div>

      {/* Grouped Account List */}
      <div className="acct-groups screen-content">
        {grouped.map(group => (
          <div key={group.type} className="acct-type-group">
            {/* Group Header Row */}
            <div className="acct-type-header">
              <span className="acct-type-label">{group.label}</span>
              <span className={`acct-type-total ${group.total < 0 ? 'negative' : group.total > 0 ? 'positive' : ''}`}>
                {group.total < 0 ? '-' : ''}{currencySymbol} {formatIndian(Math.abs(group.total))}
              </span>
            </div>

            {/* Individual Accounts */}
            {group.accounts.map(acc => {
              const bal = parseFloat(acc.computed_balance || 0);
              let balClass = '';
              if (bal < 0) balClass = 'negative';
              else if (bal > 0) balClass = 'positive';
              
              return (
                <div key={acc.id} className="acct-row" onClick={() => onEdit(acc)}>
                  <span className="acct-row-name">{acc.name}</span>
                  <span className={`acct-row-balance ${balClass}`}>
                    {bal < 0 ? '-' : ''}{currencySymbol} {formatIndian(Math.abs(bal))}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Transfer FAB */}
      <div className="fab-container">
        <button className="fab-btn" onClick={onTransfer}>
          <i className="fa-solid fa-arrow-right-arrow-left"></i>
        </button>
        <button className="fab-btn primary" onClick={() => onAdd()}>
          <i className="fa-solid fa-plus"></i>
        </button>
      </div>
    </div>
  );
}
