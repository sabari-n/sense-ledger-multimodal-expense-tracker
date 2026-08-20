import { useState, useEffect } from 'react';
import axios from 'axios';

const DEFAULT_CURRENCY = import.meta.env.VITE_CURRENCY_SYMBOL || '₹';

export function useConfig() {
  const [config, setConfig] = useState({
    currencySymbol: DEFAULT_CURRENCY,
    defaultAccount: 'Union Bank',
    defaultExpenseCategory: 'Other',
    defaultIncomeCategory: 'Other Income',
  });

  const fetchConfig = async () => {
    try {
      const res = await axios.get('/api/config');
      if (res.data?.data) {
        setConfig(res.data.data);
      } else if (res.data?.currencySymbol) {
        setConfig(res.data);
      }
    } catch {
      // Gracefully fall back to build-time or default environment variables
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  return {
    config,
    currencySymbol: config.currencySymbol || DEFAULT_CURRENCY,
    fetchConfig,
  };
}
