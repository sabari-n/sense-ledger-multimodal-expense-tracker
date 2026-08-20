import { useState, useEffect } from 'react';
import axios from 'axios';

export function useExpenses() {
  const [expenses, setExpenses] = useState([]);

  const fetchExpenses = async () => {
    try {
      const res = await axios.get('/api/expenses');
      setExpenses(res.data.data);
    } catch (err) {
      console.error('Error fetching expenses', err);
    }
  };

  useEffect(() => { fetchExpenses(); }, []);

  const createExpense = async (data) => {
    const res = await axios.post('/api/expenses', data);
    await fetchExpenses();
    return res.data.data;
  };

  const updateExpense = async (id, data) => {
    const res = await axios.put(`/api/expenses/${id}`, data);
    await fetchExpenses();
    return res.data.data;
  };

  const deleteExpense = async (id) => {
    await axios.delete(`/api/expenses/${id}`);
    await fetchExpenses();
  };

  const uploadAudio = async (blob, ext) => {
    const formData = new FormData();
    formData.append('audio', blob, `expense.${ext}`);
    const res = await axios.post('/api/expenses/upload-audio', formData);
    await fetchExpenses();
    return res.data.data;
  };

  return { expenses, fetchExpenses, createExpense, updateExpense, deleteExpense, uploadAudio };
}
