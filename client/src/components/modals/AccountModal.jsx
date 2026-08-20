import React from 'react';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';

const ICON_OPTIONS = [
  { value: 'fa-money-bill-wave', label: '💵 Cash' },
  { value: 'fa-building-columns', label: '🏦 Bank' },
  { value: 'fa-credit-card', label: '💳 Card' },
  { value: 'fa-wallet', label: '👛 Wallet' },
  { value: 'fa-piggy-bank', label: '🐷 Savings' },
  { value: 'fa-sack-dollar', label: '💰 Investment' },
  { value: 'fa-mobile-screen', label: '📱 UPI/Mobile' },
];

const COLOR_OPTIONS = ['#10b981', '#0d7a5c', '#f4c542', '#8b5cf6', '#ef4444', '#ec4899', '#14b8a6', '#f97316'];

const muiSelectSx = {
  width: '100%',
  borderRadius: '12px',
  background: 'var(--surface-alt)',
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--border)',
    borderWidth: '1.5px',
  },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary-light)' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--primary-light)',
    boxShadow: '0 0 0 3px var(--primary-glow)',
  },
  '& .MuiSelect-select': {
    padding: '13px 14px',
    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
    fontSize: '0.9rem',
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  '& .MuiSvgIcon-root': { color: 'var(--text-secondary)' },
};

const menuProps = {
  PaperProps: {
    sx: {
      borderRadius: '14px',
      boxShadow: '0 12px 40px rgba(10,92,68,0.16), 0 4px 16px rgba(0,0,0,0.08)',
      border: '1px solid var(--border)',
      mt: '4px',
      '& .MuiMenuItem-root': {
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
        fontSize: '0.88rem',
        fontWeight: 500,
        color: 'var(--text-primary)',
        borderRadius: '8px',
        mx: '6px',
        px: '12px',
        py: '9px',
        '&.Mui-selected': {
          background: 'var(--primary-glow)',
          color: 'var(--primary)',
          fontWeight: 700,
        },
        '&:hover': { background: 'var(--surface-alt)' },
      },
    },
  },
};

export default function AccountModal({ data, onChange, onSave, onClose, currencySymbol = '₹' }) {
  return (
    <div className="modal show" onClick={(e) => { if (e.target.className.includes('modal show')) onClose(); }}>
      <div className="modal-content">
        <span className="close-modal" onClick={onClose}>&times;</span>
        <h2>{data.id ? 'Edit' : 'New'} Account</h2>
        <form onSubmit={onSave}>
          <label>Account Name</label>
          <input
            type="text"
            value={data.name}
            onChange={e => onChange({ ...data, name: e.target.value })}
            required
            placeholder="e.g. SBI Savings"
          />

          <label>Type</label>
          <Select
            value={data.account_type}
            onChange={e => onChange({ ...data, account_type: e.target.value })}
            sx={muiSelectSx}
            MenuProps={menuProps}
          >
            <MenuItem value="general">General</MenuItem>
            <MenuItem value="cash">Cash</MenuItem>
            <MenuItem value="bank">Bank Account</MenuItem>
            <MenuItem value="credit_card">Credit Card</MenuItem>
            <MenuItem value="digital_wallet">Digital Wallet</MenuItem>
            <MenuItem value="savings">Savings</MenuItem>
            <MenuItem value="investment">Investment</MenuItem>
          </Select>

          <label>Initial Balance ({currencySymbol})</label>
          <input
            type="number"
            step="0.01"
            value={data.balance}
            onChange={e => onChange({ ...data, balance: e.target.value })}
          />

          <label>Icon</label>
          <Select
            value={data.icon}
            onChange={e => onChange({ ...data, icon: e.target.value })}
            sx={muiSelectSx}
            MenuProps={menuProps}
          >
            {ICON_OPTIONS.map(opt => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </Select>

          <label>Color</label>
          <div className="color-picker-row">
            {COLOR_OPTIONS.map(c => (
              <div
                key={c}
                className={`color-swatch ${data.color === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => onChange({ ...data, color: c })}
              />
            ))}
          </div>

          <button type="submit" className="submit-btn">Save Account</button>
        </form>
      </div>
    </div>
  );
}
