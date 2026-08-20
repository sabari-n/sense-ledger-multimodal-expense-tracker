import React from 'react';

const NAV_ITEMS = [
  { id: 'transactions', icon: 'fa-list-ul', label: 'Trans.' },
  { id: 'analytics', icon: 'fa-chart-pie', label: 'Stats' },
  { id: 'accounts', icon: 'fa-wallet', label: 'Accounts' },
  { id: 'record', icon: 'fa-microphone', label: 'Record' },
];

export default function BottomNav({ activeScreen, onNavigate }) {
  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map(item => {
        const isActive = activeScreen === item.id;
        return (
          <div
            key={item.id}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <i className={`fa-solid ${item.icon}`}></i>
            <span>{item.label}</span>
          </div>
        );
      })}
    </nav>
  );
}
