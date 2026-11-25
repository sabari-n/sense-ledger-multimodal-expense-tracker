/**
 * Sample ledger data for development and demos.
 *
 *   npm run seed:sample          replace sample data with a fresh set (6 months up to today)
 *   npm run seed:sample:clear    remove sample data only
 *
 * Rows are marked source = 'sample', and their opening balances are adjustment rows with a
 * fixed description, so clearing never touches real transactions. Generation is
 * deterministic: the same month always gets the same transactions.
 *
 * Refuses to run with NODE_ENV=production unless --force is given.
 */
import { Op } from 'sequelize';
import sequelize, { Expense, Account, Category } from '../models/index.js';
import { env } from '../config/env.js';
import { TRANSACTION_TYPES as T, TRANSACTION_SOURCES } from '../utils/enums.js';
import { localToday, shiftMonth, monthRange } from '../agent/dates.js';

const MONTHS = 6;
const OPENING_BALANCE_TEXT = 'Opening balance (sample data)';
const OPENING_BALANCES = { 'Union Bank': 120000, ICICI: 45000, Cash: 2000, UPI: 1500 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Small deterministic PRNG (mulberry32) so every run produces the same ledger. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The UTC instant of a wall-clock time in `timeZone`. */
function zonedTime(dateStr, hour, minute, timeZone) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(guess)).map((p) => [p.type, Number(p.value)]));
  const asZone = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return new Date(guess - (asZone - guess));
}

const pad = (n) => String(n).padStart(2, '0');

// ─── Generation ───────────────────────────────────────────────────────────────

/**
 * One month of plausible transactions. Returns plain descriptors; names are resolved to ids later.
 * `cardBillDue` is last month's credit-card spend, paid off from Union Bank this month.
 */
function generateMonth(month, cardBillDue) {
  const r = rng(Number(month.replace('-', '')));
  const int = (min, max) => Math.round(min + r() * (max - min));
  const amt = (min, max, step = 10) => Math.round(int(min, max) / step) * step;
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const chance = (p) => r() < p;
  const { end } = monthRange(month);
  const lastDay = Number(end.slice(8));
  const day = (d) => `${month}-${pad(Math.min(d, lastDay))}`;
  const anyDay = () => day(int(1, lastDay));
  const monthNo = Number(month.slice(5));

  const rows = [];
  const add = (type, amount, account, category, subcategory, text, date, hour = int(9, 21), extra = {}) =>
    rows.push({ type, amount, account, category, subcategory, text, date, hour, minute: int(0, 59), ...extra });
  const spend = (...a) => add(T.EXPENSE, ...a);
  const earn = (...a) => add(T.INCOME, ...a);
  const transfer = (amount, from, to, text, date) =>
    add(T.TRANSFER, amount, from, 'Transfer', '', text, date, 10, { toAccount: to });

  // Income
  earn(85000, 'Union Bank', 'Salary', 'Salary', 'Salary credited', day(1), 9);
  earn(2200, 'Sodexo', 'Other Income', 'Misc', 'Sodexo meal card top-up', day(1), 10);
  if (monthNo % 3 === 0) earn(amt(380, 640, 1), 'ICICI', 'Bonus', 'Interest Earned', 'Savings account interest', day(30), 8);
  if (monthNo === 10) earn(25000, 'Union Bank', 'Bonus', 'Bonus', 'Diwali bonus', day(20), 11);

  // Transfers between own accounts
  transfer(18000, 'Union Bank', 'UPI', 'Top up UPI wallet', day(2));
  transfer(2500, 'Union Bank', 'Cash', 'ATM withdrawal', day(6));
  if (cardBillDue > 0) transfer(cardBillDue, 'Union Bank', 'Credit Card', 'Credit card bill payment', day(18));

  // Fixed monthly bills
  spend(18000, 'Union Bank', 'Rent,Waterbill,Maintenance', 'Rent', 'House rent', day(3), 10);
  spend(2500, 'Union Bank', 'Rent,Waterbill,Maintenance', 'Maintenance', 'Apartment maintenance', day(5), 11);
  spend(amt(350, 600), 'UPI', 'Rent,Waterbill,Maintenance', 'Water Bill', 'Water bill', day(8));
  spend(12500, 'Union Bank', 'Car', 'Car EMI', 'Car loan EMI', day(7), 9);
  spend(10000, 'Union Bank', 'Relatives', 'Parents', 'Sent to parents', day(5), 19);
  spend(amt(1400, 2600), 'UPI', 'Household', 'Electricity', 'Electricity bill (BESCOM)', day(10));
  spend(799, 'Credit Card', 'Internet', 'Broadband', 'Airtel broadband', day(12), 8);
  spend(299, 'Credit Card', 'Culture', 'Amazon Prime', 'Amazon Prime subscription', day(15), 6);
  spend(1500, 'UPI', 'Sports', 'Gym', 'Gym membership', day(2), 7);
  if (chance(0.5)) spend(amt(900, 1100), 'UPI', 'Household', 'Gas', 'Gas cylinder refill', anyDay());

  // Food
  for (let i = int(4, 8); i > 0; i--) spend(amt(220, 680), 'UPI', 'Food', 'Swiggy', pick(['Swiggy order', 'Swiggy - biryani', 'Swiggy - pizza', 'Swiggy dinner']), anyDay(), int(19, 22));
  for (let i = int(10, 13); i > 0; i--) spend(amt(90, 210), 'Sodexo', 'Food', 'Lunch', pick(['Office canteen lunch', 'Lunch near office', 'Meals']), anyDay(), 13);
  for (let i = int(3, 5); i > 0; i--) spend(amt(600, 2200), 'UPI', 'Food', 'Fruit and Vegetables and Groceries', pick(['Vegetables and fruits', 'Groceries - local store', 'BigBasket order', 'Milk and vegetables']), anyDay());
  for (let i = int(1, 3); i > 0; i--) spend(amt(900, 3200), 'Credit Card', 'Food', 'Restaurant', pick(['Dinner at Meghana Foods', 'Lunch at Truffles', 'Family dinner out', 'Dinner at Empire']), anyDay(), int(13, 21));
  for (let i = int(4, 8); i > 0; i--) spend(amt(40, 180, 5), 'Cash', 'Food', pick(['Snacks', 'Beverages']), pick(['Tea and snacks', 'Coffee', 'Juice', 'Bakery']), anyDay(), int(10, 18));
  for (let i = int(1, 2); i > 0; i--) spend(amt(1800, 4200), pick(['UPI', 'Credit Card']), 'Dmart', 'Dmart Household', 'Dmart monthly groceries', anyDay(), int(11, 19));

  // Transport
  for (let i = int(2, 3); i > 0; i--) spend(amt(1500, 2500), 'Credit Card', 'Transport', 'Petrol', 'Petrol', anyDay(), int(8, 20));
  for (let i = int(3, 6); i > 0; i--) spend(amt(80, 450), pick(['Cash', 'UPI']), 'Transport', pick(['Auto', 'Taxi']), pick(['Auto ride', 'Uber ride', 'Ola to airport', 'Rapido']), anyDay());
  if (chance(0.6)) spend(amt(40, 120), 'Cash', 'Transport', 'Parking', 'Parking', anyDay());

  // Personal and occasional
  spend(250, 'Cash', 'Beauty', 'Hair Cut', 'Haircut', anyDay(), 11);
  for (let i = int(0, 2); i > 0; i--) spend(amt(200, 900), 'UPI', 'Health', 'Medicine', pick(['Apollo Pharmacy', 'Medicines', 'MedPlus']), anyDay());
  if (chance(0.3)) spend(600, 'UPI', 'Health', 'Doctor', 'Doctor consultation', anyDay(), 18);
  for (let i = int(1, 2); i > 0; i--) spend(pick([101, 201, 501]), 'Cash', 'Temple', 'Offerings', 'Temple offering', anyDay(), 7);
  if (chance(0.6)) spend(amt(600, 900), 'Credit Card', 'Culture', 'Movie', 'Movie tickets (PVR)', anyDay(), 19);
  if (chance(0.3)) spend(amt(1200, 4500), 'Credit Card', 'Apparel', pick(['Clothing', 'Shoes']), pick(['Myntra order', 'Clothes shopping', 'Shoes - Decathlon']), anyDay());

  // Festival month
  if (monthNo === 10) {
    spend(6500, 'Credit Card', 'Apparel', 'Clothing', 'Diwali clothes', day(15), 17);
    spend(3000, 'UPI', 'Gift', 'Gift', 'Diwali gifts', day(18), 18);
    spend(1800, 'Cash', 'Food', 'Snacks', 'Diwali sweets', day(19), 16);
    spend(15000, 'Union Bank', 'Asset', 'Gold', 'Gold coin (Dhanteras)', day(17), 12);
  }

  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function clearSample(transaction) {
  return Expense.destroy({
    where: {
      [Op.or]: [
        { source: TRANSACTION_SOURCES.SAMPLE },
        { source: TRANSACTION_SOURCES.ADJUSTMENT, original_text: OPENING_BALANCE_TEXT },
      ],
    },
    transaction,
  });
}

async function seed(transaction) {
  const accounts = new Map((await Account.findAll({ raw: true, transaction })).map((a) => [a.name, a.id]));
  const categories = new Map((await Category.findAll({ raw: true, transaction })).map((c) => [c.name, c.id]));
  const need = (map, name, kind) => {
    if (!map.has(name)) throw new Error(`Sample data needs the ${kind} "${name}". Start the API once so defaults are seeded.`);
    return map.get(name);
  };

  const now = new Date();
  const tz = env.timezone;
  const thisMonth = localToday(tz, now).slice(0, 7);
  const firstMonth = shiftMonth(thisMonth, -(MONTHS - 1));

  const rows = [];
  const openingDate = zonedTime(monthRange(shiftMonth(firstMonth, -1)).end, 9, 0, tz);
  for (const [account, amount] of Object.entries(OPENING_BALANCES)) {
    rows.push({
      transaction_type: T.INCOME, amount, account_id: need(accounts, account, 'account'),
      category_id: need(categories, 'Other Income', 'category'), subcategory: '',
      original_text: OPENING_BALANCE_TEXT, source: TRANSACTION_SOURCES.ADJUSTMENT, date: openingDate,
    });
  }

  let cardBillDue = 0;
  for (let month = firstMonth; month <= thisMonth; month = shiftMonth(month, 1)) {
    const generated = generateMonth(month, cardBillDue);
    cardBillDue = 0;
    for (const g of generated) {
      const date = zonedTime(g.date, g.hour, g.minute, tz);
      if (date > now) continue; // the current month only runs up to today
      if (g.account === 'Credit Card' && g.type === T.EXPENSE) cardBillDue += g.amount;
      rows.push({
        transaction_type: g.type,
        amount: g.amount,
        account_id: need(accounts, g.account, 'account'),
        to_account_id: g.toAccount ? need(accounts, g.toAccount, 'account') : null,
        category_id: need(categories, g.category, 'category'),
        subcategory: g.subcategory,
        original_text: g.text,
        source: TRANSACTION_SOURCES.SAMPLE,
        date,
      });
    }
  }

  await Expense.bulkCreate(rows, { transaction });
  return { count: rows.length, firstMonth, thisMonth };
}

async function main() {
  const clearOnly = process.argv.includes('--clear');
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    console.error('Refusing to touch sample data with NODE_ENV=production (pass --force to override).');
    process.exit(1);
  }

  const result = await sequelize.transaction(async (transaction) => {
    const removed = await clearSample(transaction);
    return { removed, ...(clearOnly ? {} : await seed(transaction)) };
  });

  console.log(`Removed ${result.removed} sample row(s).`);
  if (!clearOnly) {
    console.log(`Inserted ${result.count} sample row(s) for ${result.firstMonth} … ${result.thisMonth} (${env.timezone}).`);
  }
}

main()
  .catch((err) => {
    console.error('Sample data failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
