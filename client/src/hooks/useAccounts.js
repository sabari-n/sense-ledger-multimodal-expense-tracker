import { useState, useEffect } from 'react';
import axios from 'axios';

export function useAccounts() {
  const [accounts, setAccounts] = useState([]);

  const fetchAccounts = async () => {
    try {
      const res = await axios.get('/api/accounts');
      setAccounts(res.data.data);
    } catch (err) {
      console.error('Error fetching accounts', err);
    }
  };

  useEffect(() => { fetchAccounts(); }, []);

  const createAccount = async (data) => {
    const res = await axios.post('/api/accounts', data);
    await fetchAccounts();
    return res.data.data;
  };

  const updateAccount = async (id, data) => {
    const res = await axios.put(`/api/accounts/${id}`, data);
    await fetchAccounts();
    return res.data.data;
  };

  const deleteAccount = async (id) => {
    await axios.delete(`/api/accounts/${id}`);
    await fetchAccounts();
  };

  const transferFunds = async (data) => {
    const res = await axios.post('/api/accounts/transfer', data);
    await fetchAccounts();
    return res.data;
  };

  return { accounts, fetchAccounts, createAccount, updateAccount, deleteAccount, transferFunds };
}
