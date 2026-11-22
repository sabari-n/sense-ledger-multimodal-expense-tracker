export function formatIndian(num) {
  const n = Math.abs(Number(num) || 0);
  const str = n.toFixed(2);
  const [intPart, decPart] = str.split('.');
  const lastThree = intPart.slice(-3);
  const remaining = intPart.slice(0, -3);
  const formatted = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (formatted ? formatted + ',' : '') + lastThree + '.' + decPart;
}

// "Recorded: -₹350.00 Food › Lunch (Cash)" for a transaction saved from voice.
export function describeSaved(t, currencySymbol = '₹') {
  const sign = t.transaction_type === 'income' ? '+' : t.transaction_type === 'transfer' ? '' : '-';
  const what = t.transaction_type === 'transfer'
    ? `${t.account} → ${t.to_account}`
    : `${t.category}${t.subcategory ? ' › ' + t.subcategory : ''} (${t.account})`;
  return `Recorded: ${sign}${currencySymbol}${formatIndian(t.amount)} ${what}`;
}

// Local calendar day key (YYYY-MM-DD). toISOString() would use UTC and put
// transactions made after midnight IST (before 05:30) on the previous day.
export function localDateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Move a transaction to the picked day ("YYYY-MM-DD" from <input type="date">) while
// keeping its time of day, so its order within that day stays sensible. New
// transactions (no current date) use the current time. Returns an ISO string.
export function withPickedDay(dayKey, current) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const t = current ? new Date(current) : new Date();
  return new Date(y, m - 1, d, t.getHours(), t.getMinutes(), t.getSeconds()).toISOString();
}
