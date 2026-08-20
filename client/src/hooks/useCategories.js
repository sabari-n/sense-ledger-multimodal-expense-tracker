import { useState, useEffect } from 'react';
import axios from 'axios';

export function useCategories() {
  const [categories, setCategories] = useState([]);

  const fetchCategories = async (type) => {
    try {
      const url = type ? `/api/categories?type=${type}` : '/api/categories';
      const res = await axios.get(url);
      setCategories(res.data.data);
    } catch (err) {
      console.error('Error fetching categories', err);
    }
  };

  useEffect(() => { fetchCategories(); }, []);

  const createCategory = async (data) => {
    const res = await axios.post('/api/categories', data);
    await fetchCategories();
    return res.data.data;
  };

  const updateCategory = async (id, data) => {
    const res = await axios.put(`/api/categories/${id}`, data);
    await fetchCategories();
    return res.data.data;
  };

  const deleteCategory = async (id) => {
    await axios.delete(`/api/categories/${id}`);
    await fetchCategories();
  };

  return { categories, fetchCategories, createCategory, updateCategory, deleteCategory };
}
