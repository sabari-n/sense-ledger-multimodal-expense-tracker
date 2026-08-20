import React, { useState, useEffect } from 'react';
import { useCategories } from '../../hooks/useCategories';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';

const TYPE_TABS = ['Income', 'Expense', 'Transfer'];
const EMOJI_OPTIONS = ['📋','🍜','🚗','🏠','💊','📚','🎁','💰','👗','💄','🎭','🐶','👫','📶','🚕','💻','📈','↩️','🎮','✈️','🏋️','🧴','🛒','⚡','📱'];

function formatDate(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

const selectSx = {
  flex: 1,
  background: 'transparent',
  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
  '& .MuiSelect-select': {
    padding: '0 !important',
    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  '& .MuiSvgIcon-root': { color: 'var(--text-muted)', fontSize: '1.1rem' },
};

const menuProps = {
  PaperProps: {
    sx: {
      borderRadius: '14px',
      boxShadow: 'var(--shadow-lg)',
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

export default function ExpenseModal({ data, accounts, onChange, onSave, onClose, onDelete, currencySymbol = '₹' }) {
  const { categories, fetchCategories, createCategory, updateCategory, deleteCategory } = useCategories();

  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);

  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('📋');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingCatId, setEditingCatId] = useState(null);
  const [newSubName, setNewSubName] = useState('');

  const activeType = data.type || 'expense';

  useEffect(() => {
    fetchCategories(activeType);
  }, [activeType]);

  const filteredCategories = categories.filter(c => c.transaction_type === activeType);

  const setType = (t) => {
    onChange({ ...data, type: t, category: '', subcategory: '' });
    setExpandedCategory(null);
    setIsEditMode(false);
  };

  const selectCategory = (cat) => {
    if (isEditMode) {
      setEditingCatId(editingCatId === cat.id ? null : cat.id);
      return;
    }
    if (expandedCategory === cat.id) {
      setExpandedCategory(null);
    } else {
      setExpandedCategory(cat.id);
      onChange({ ...data, category: cat.name, subcategory: '' });
    }
  };

  const selectSubcategory = (sub) => {
    onChange({ ...data, subcategory: sub });
    setShowCategoryPicker(false);
    setExpandedCategory(null);
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    await createCategory({ name: newCatName.trim(), emoji: newCatEmoji, transaction_type: activeType, subcategories: [] });
    setNewCatName('');
    setNewCatEmoji('📋');
  };

  const handleDeleteCategory = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this category?')) return;
    await deleteCategory(id);
  };

  const handleAddSubcategory = async (cat) => {
    if (!newSubName.trim()) return;
    const updatedSubs = [...(cat.subcategories || []), newSubName.trim()];
    await updateCategory(cat.id, { subcategories: updatedSubs });
    setNewSubName('');
  };

  const handleDeleteSubcategory = async (cat, sub) => {
    const updatedSubs = (cat.subcategories || []).filter(s => s !== sub);
    await updateCategory(cat.id, { subcategories: updatedSubs });
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (activeType !== 'transfer' && !data.category) {
      alert('Please select a category.');
      return;
    }
    if (activeType === 'transfer' && (!data.account || !data.to_account)) {
      alert('Please select both from and to accounts.');
      return;
    }
    if (activeType === 'transfer' && data.account === data.to_account) {
      alert('Cannot transfer to the same account.');
      return;
    }
    onSave(e);
  };

  const selectedCat = filteredCategories.find(c => c.name === data.category);

  return (
    <div className="expense-page">
      {/* Header */}
      <div className="expense-page-header">
        <button className="expense-back-btn" onClick={onClose} type="button">
          <i className="fa-solid fa-chevron-left"></i> Trans.
        </button>
        <span className="expense-page-title">
          {data.id ? 'Edit Transaction' : (activeType === 'income' ? 'Add Income' : activeType === 'transfer' ? 'Transfer' : 'Add Expense')}
        </span>
        {data.id ? (
          <button className="expense-fav-btn" onClick={onDelete} type="button" style={{ color: '#ff8a8a' }}>
            <i className="fa-solid fa-trash"></i>
          </button>
        ) : (
          <button className="expense-fav-btn" type="button"><i className="fa-regular fa-star"></i></button>
        )}
      </div>

      {/* Type Tabs */}
      <div className="expense-type-tabs">
        {TYPE_TABS.map(tab => {
          const val = tab.toLowerCase();
          return (
            <button
              key={tab}
              className={`expense-type-tab ${activeType === val ? 'active' : ''}`}
              onClick={() => setType(val)}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Form */}
      <form className="expense-form" onSubmit={handleSave}>
        {/* Date */}
        <div className="expense-form-row">
          <span className="expense-form-label">Date</span>
          <span className="expense-form-value">{formatDate(data.date)}</span>
        </div>

        {/* Amount */}
        <div className="expense-form-row">
          <span className="expense-form-label">Amount ({currencySymbol})</span>
          <input
            className="expense-form-input"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={data.amount}
            onChange={e => onChange({ ...data, amount: e.target.value })}
            required
          />
        </div>

        {/* Category (Hidden for Transfer) */}
        {activeType !== 'transfer' && (
          <div className="expense-form-row category-row" onClick={() => { setShowCategoryPicker(true); setIsEditMode(false); }}>
            <span className="expense-form-label">Category</span>
            <span className={`expense-form-value ${data.category ? 'selected-category' : ''}`}>
              {data.category
                ? `${selectedCat?.emoji || '📋'} ${data.category}${data.subcategory ? ' › ' + data.subcategory : ''}`
                : 'Select category'}
            </span>
            <span className="expense-form-chevron"><i className="fa-solid fa-chevron-right"></i></span>
          </div>
        )}

        {/* Account / From Account — MUI Select */}
        <div className="expense-form-row">
          <span className="expense-form-label">{activeType === 'transfer' ? 'From' : 'Account'}</span>
          <Select
            value={data.account || ''}
            onChange={e => onChange({ ...data, account: e.target.value })}
            displayEmpty
            required
            sx={selectSx}
            MenuProps={menuProps}
          >
            {accounts.length === 0 && <MenuItem value="Cash">Cash</MenuItem>}
            {accounts.map(acc => (
              <MenuItem key={acc.id} value={acc.name}>{acc.name}</MenuItem>
            ))}
          </Select>
        </div>

        {/* To Account (Only for Transfer) — MUI Select */}
        {activeType === 'transfer' && (
          <div className="expense-form-row">
            <span className="expense-form-label">To Account</span>
            <Select
              value={data.to_account || ''}
              onChange={e => onChange({ ...data, to_account: e.target.value })}
              displayEmpty
              required
              sx={selectSx}
              MenuProps={menuProps}
            >
              {accounts.length === 0 && <MenuItem value="Bank">Bank</MenuItem>}
              {accounts.map(acc => (
                <MenuItem key={acc.id} value={acc.name}>{acc.name}</MenuItem>
              ))}
            </Select>
          </div>
        )}

        {/* Note */}
        <div className="expense-form-row">
          <span className="expense-form-label">Note</span>
          <input
            className="expense-form-input"
            type="text"
            value={data.desc}
            placeholder="Add a note..."
            onChange={e => onChange({ ...data, desc: e.target.value })}
          />
        </div>

        <button type="submit" className="expense-save-btn">
          {data.id ? 'Update Transaction' : 'Save Transaction'}
        </button>
      </form>

      {/* ===== CATEGORY PICKER BOTTOM SHEET ===== */}
      {showCategoryPicker && (
        <div className="category-picker-overlay" onClick={() => { setShowCategoryPicker(false); setIsEditMode(false); }}>
          <div className="category-picker-sheet" onClick={e => e.stopPropagation()}>

            {/* Sheet Header */}
            <div className="category-picker-header">
              <span>Choose Category</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className={`cat-picker-icon-btn ${isEditMode ? 'cat-edit-active' : ''}`}
                  onClick={() => { setIsEditMode(e => !e); setExpandedCategory(null); setEditingCatId(null); }}
                >
                  <i className="fa-solid fa-pen"></i>
                </button>
                <button className="cat-picker-icon-btn" onClick={() => { setShowCategoryPicker(false); setIsEditMode(false); }}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>

            {/* Add new category row (edit mode only) */}
            {isEditMode && (
              <div className="cat-add-row">
                <button className="cat-emoji-trigger" onClick={() => setShowEmojiPicker(e => !e)}>
                  {newCatEmoji}
                </button>
                {showEmojiPicker && (
                  <div className="emoji-picker-popup">
                    {EMOJI_OPTIONS.map(em => (
                      <button key={em} className="emoji-opt" onClick={() => { setNewCatEmoji(em); setShowEmojiPicker(false); }}>{em}</button>
                    ))}
                  </div>
                )}
                <input
                  className="cat-add-input"
                  placeholder="New category name..."
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
                />
                <button className="cat-add-confirm" onClick={handleAddCategory}>
                  <i className="fa-solid fa-check"></i>
                </button>
              </div>
            )}

            {/* Category Grid */}
            <div className="category-grid">
              {filteredCategories.map(cat => (
                <div key={cat.id}>
                  <div
                    className={`category-grid-item ${(expandedCategory === cat.id || editingCatId === cat.id) ? 'active' : ''}`}
                    onClick={() => selectCategory(cat)}
                  >
                    {isEditMode && !cat.is_system && (
                      <button className="cat-delete-btn" onClick={(e) => handleDeleteCategory(e, cat.id)}>
                        <i className="fa-solid fa-minus"></i>
                      </button>
                    )}
                    <span className="cat-emoji">{cat.emoji}</span>
                    <span className="cat-name">{cat.name}</span>
                    {!isEditMode && cat.subcategories?.length > 0 && (
                      <span className="cat-chevron"><i className="fa-solid fa-chevron-down"></i></span>
                    )}
                  </div>

                  {/* Subcategory expansion (select mode) */}
                  {!isEditMode && expandedCategory === cat.id && cat.subcategories?.length > 0 && (
                    <div className="subcategory-row">
                      {cat.subcategories.map(sub => (
                        <button
                          key={sub}
                          className={`sub-chip ${data.subcategory === sub ? 'active' : ''}`}
                          onClick={() => selectSubcategory(sub)}
                        >
                          {sub}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Subcategory edit panel (edit mode) */}
                  {isEditMode && editingCatId === cat.id && (
                    <div className="subcategory-edit-panel">
                      <div className="sub-edit-chips">
                        {(cat.subcategories || []).map(sub => (
                          <div key={sub} className="sub-edit-chip">
                            <span>{sub}</span>
                            <button className="sub-delete-btn" onClick={() => handleDeleteSubcategory(cat, sub)}>
                              <i className="fa-solid fa-xmark"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="sub-add-row">
                        <input
                          className="sub-add-input"
                          placeholder="Add subcategory..."
                          value={newSubName}
                          onChange={e => setNewSubName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubcategory(cat); } }}
                        />
                        <button className="cat-add-confirm" onClick={() => handleAddSubcategory(cat)}>
                          <i className="fa-solid fa-check"></i>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
