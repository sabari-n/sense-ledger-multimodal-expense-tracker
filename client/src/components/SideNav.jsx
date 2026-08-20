import React from 'react';
import { formatIndian } from '../utils/format';

const NAV_ITEMS = [
  { id: 'transactions', icon: 'fa-list-ul',   label: 'Transactions' },
  { id: 'analytics',   icon: 'fa-chart-pie',  label: 'Analytics' },
  { id: 'accounts',    icon: 'fa-wallet',      label: 'Accounts' },
  { id: 'record',      icon: 'fa-microphone',  label: 'Voice Record' },
];

export default function SideNav({ activeScreen, onNavigate, netBalance, totalIncome, totalSpend, currencySymbol }) {
  return (
    <aside className="side-nav">
      {/* Brand */}
      <div className="side-nav-brand">
        <div className="side-nav-logo">
          <i className="fa-solid fa-coins"></i>
        </div>
        <div>
          <span className="side-nav-brand-name">Spend<span className="brand-gold">Sync</span></span>
          <span className="side-nav-brand-tagline">Money Manager</span>
        </div>
      </div>

      {/* Balance Card */}
      <div className="side-balance-card">
        <span className="side-balance-label">Net Balance</span>
        <span className="side-balance-amount">
          {netBalance >= 0 ? '+' : '-'}{currencySymbol}&nbsp;{formatIndian(Math.abs(netBalance))}
        </span>
        <div className="side-balance-row">
          <div className="side-balance-stat">
            <span className="side-stat-label">Income</span>
            <span className="side-stat-value income">+{currencySymbol}&nbsp;{formatIndian(totalIncome)}</span>
          </div>
          <div className="side-balance-stat">
            <span className="side-stat-label">Expense</span>
            <span className="side-stat-value expense">-{currencySymbol}&nbsp;{formatIndian(totalSpend)}</span>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="side-nav-items">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`side-nav-item ${activeScreen === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <i className={`fa-solid ${item.icon}`}></i>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="side-nav-footer">
        <i className="fa-solid fa-shield-halved"></i>
        <span>End-to-end encrypted</span>
      </div>
    </aside>
  );
}
