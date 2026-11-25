import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeQuestion } from '../src/services/telegram.service.js';

test('questions go to the ledger agent', () => {
  for (const q of [
    'How much did I spend on food in October compared with September?',
    'Which account is running low?',
    "what's my balance in ICICI",
    'Did I pay rent this month',
    'show my biggest expenses last month',
    'Spent too much on Swiggy?',
  ]) assert.equal(looksLikeQuestion(q), true, q);
});

test('transactions still go to the extraction pipeline', () => {
  for (const t of [
    'Spent 250 on lunch',
    'paid 1200 rent from union bank',
    'Received salary 80000',
    'transfer 1000 from Union Bank to ICICI',
    'Swiggy 450 via UPI',
    'Showroom bill 3000', // starts with "show" but not the word "show"
  ]) assert.equal(looksLikeQuestion(t), false, t);
});
