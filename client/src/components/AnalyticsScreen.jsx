import React, { useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { formatIndian } from '../utils/format';

ChartJS.register(ArcElement, Tooltip, Legend);

const CATEGORY_COLORS = {
  Apparel: '#ff6b6b',
  Household: '#ff922b',
  Education: '#fcc419',
  Transportation: '#ffd43b',
  Gift: '#a9e34b',
  Health: '#51cf66',
  Culture: '#339af0'
};
const FALLBACK_COLORS = ['#f97316', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function AnalyticsScreen({ expenses, currencySymbol = '₹' }) {
  const [activeTab, setActiveTab] = useState('expense');
  
  // Basic calculations (for now, using all expenses)
  let totalIncome = 0;
  let totalExpense = 0;
  
  expenses.forEach(e => {
    if (e.transaction_type === 'income') totalIncome += parseFloat(e.amount);
    else if (e.transaction_type === 'expense') totalExpense += parseFloat(e.amount);
  });

  const filteredExpenses = expenses.filter(e => e.transaction_type === activeTab);
  
  const categoryTotals = {};
  filteredExpenses.forEach(e => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + parseFloat(e.amount);
  });

  const totalFiltered = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

  // Sort by highest amount
  const sortedCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amount], index) => {
       const color = CATEGORY_COLORS[cat] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
       const percentage = totalFiltered > 0 ? ((amount / totalFiltered) * 100) : 0;
       return { cat, amount, color, percentage };
    });

  const chartData = {
    labels: sortedCategories.map(c => c.cat),
    datasets: [{
      data: sortedCategories.map(c => c.amount),
      backgroundColor: sortedCategories.map(c => c.color),
      borderWidth: 2,
      borderColor: '#ffffff',
      hoverOffset: 4
    }]
  };
  
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: {
        display: false
      }
    }
  };

  return (
    <div className="analytics-screen fade-in screen-content">
      <div className="stats-top-bar">
         <div className="stats-tab-group">
            <button className="active">Stats</button>
            <button>Budget</button>
            <button>Note</button>
         </div>
         <button className="stats-month-dropdown">M <i className="fa-solid fa-chevron-down"></i></button>
      </div>

      <div className="stats-month-nav">
         <button><i className="fa-solid fa-chevron-left"></i></button>
         <span>Jul 2020</span>
         <button><i className="fa-solid fa-chevron-right"></i></button>
      </div>

      <div className="stats-type-tabs">
         <button className={`stats-type-tab ${activeTab === 'income' ? 'active income' : ''}`} onClick={() => setActiveTab('income')}>
           Income {currencySymbol} {formatIndian(totalIncome)}
         </button>
         <button className={`stats-type-tab ${activeTab === 'expense' ? 'active expense' : ''}`} onClick={() => setActiveTab('expense')}>
           Expenses {currencySymbol} {formatIndian(totalExpense)}
         </button>
      </div>

      <div className="stats-chart-wrapper">
         <Doughnut data={chartData} options={chartOptions} />
      </div>

      <div className="stats-category-list">
         {sortedCategories.map(item => (
            <div className="stats-cat-row" key={item.cat}>
               <div className="stats-cat-left">
                  <span className="stats-cat-badge" style={{backgroundColor: item.color}}>
                     {Math.round(item.percentage)}%
                  </span>
                  <span className="stats-cat-name">{item.cat}</span>
               </div>
               <div className="stats-cat-amount">
                  {currencySymbol} {formatIndian(item.amount)}
               </div>
            </div>
         ))}
      </div>
    </div>
  );
}
