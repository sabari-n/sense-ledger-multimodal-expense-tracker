import React from 'react';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';

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

export default function TransferModal({ data, accounts, onChange, onSave, onClose, currencySymbol = '₹' }) {
  return (
    <div className="modal show" onClick={(e) => { if (e.target.className.includes('modal show')) onClose(); }}>
      <div className="modal-content">
        <span className="close-modal" onClick={onClose}>&times;</span>
        <h2>Transfer Between Accounts</h2>
        <form onSubmit={onSave}>
          <label>From Account</label>
          <Select
            value={data.from_account}
            onChange={e => onChange({ ...data, from_account: e.target.value })}
            displayEmpty
            required
            sx={muiSelectSx}
            MenuProps={menuProps}
          >
            <MenuItem value="" disabled>Select account...</MenuItem>
            {accounts.map(acc => (
              <MenuItem key={acc.id} value={acc.name}>{acc.name}</MenuItem>
            ))}
          </Select>

          <label>To Account</label>
          <Select
            value={data.to_account}
            onChange={e => onChange({ ...data, to_account: e.target.value })}
            displayEmpty
            required
            sx={muiSelectSx}
            MenuProps={menuProps}
          >
            <MenuItem value="" disabled>Select account...</MenuItem>
            {accounts.map(acc => (
              <MenuItem key={acc.id} value={acc.name}>{acc.name}</MenuItem>
            ))}
          </Select>

          <label>Amount ({currencySymbol})</label>
          <input
            type="number"
            step="0.01"
            value={data.amount}
            onChange={e => onChange({ ...data, amount: e.target.value })}
            required
            placeholder="0.00"
          />

          <label>Note (optional)</label>
          <input
            type="text"
            value={data.description}
            onChange={e => onChange({ ...data, description: e.target.value })}
            placeholder="e.g. ATM withdrawal"
          />

          <button type="submit" className="submit-btn">
            <i className="fa-solid fa-arrow-right-arrow-left" style={{ marginRight: 8 }}></i>
            Transfer Funds
          </button>
        </form>
      </div>
    </div>
  );
}
