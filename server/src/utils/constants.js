import * as accountRepo from '../repositories/account.repository.js';
import * as categoryRepo from '../repositories/category.repository.js';

export const TRANSACTION_TYPES = Object.freeze({
    EXPENSE: 'expense',
    INCOME: 'income',
    TRANSFER: 'transfer',
});

export const DEFAULT_FALLBACK_CATEGORIES = Object.freeze({
    EXPENSE: 'Other',
    INCOME: 'Other Income',
    TRANSFER: 'Transfer',
});

export const GENERIC_CATEGORY_PLACEHOLDERS = Object.freeze([
    'other',
    'expense',
    'income',
]);

/**
 * Build the LLM prompt for expense extraction dynamically from DB.
 *
 * Optimized for Llama 3.1 8B and similar instruction-tuned models.
 *
 * @param {string} text The transcribed or raw text to analyse
 * @returns {Promise<string>} Full prompt string
 */
export async function EXPENSE_PROMPT(text) {
    const [categories, accounts] = await Promise.all([
        categoryRepo.findAll(),
        accountRepo.findAll(),
    ]);

    const defaultAccount =
        accounts.find(a => a.is_default)?.name || 'Union Bank';

    const accountNames = accounts.length
        ? accounts.map(a => `"${a.name}"`).join(', ')
        : `"${defaultAccount}"`;

    /*
     * Keep expense and income categories separate.
     * This reduces the classification space for the LLM.
     */
    const expenseCategories = categories
        .filter(
            cat =>
                cat.transaction_type !== 'income' &&
                cat.name !== 'Transfer'
        )
        .map(cat => {
            const subs =
                Array.isArray(cat.subcategories) &&
                    cat.subcategories.length > 0
                    ? ` → ${cat.subcategories.join(', ')}`
                    : '';

            return `- "${cat.name}"${subs}`;
        })
        .join('\n');

    const incomeCategories = categories
        .filter(cat => cat.transaction_type === 'income')
        .map(cat => {
            const subs =
                Array.isArray(cat.subcategories) &&
                    cat.subcategories.length > 0
                    ? ` → ${cat.subcategories.join(', ')}`
                    : '';

            return `- "${cat.name}"${subs}`;
        })
        .join('\n');

    return `You are a financial transaction parser.

Your job is to convert the user's sentence into ONE flat JSON transaction object.

IMPORTANT:
- Output ONLY one valid JSON object.
- Do NOT output markdown.
- Do NOT output explanations.
- Do NOT output a schema definition.
- Do NOT add extra fields.
- Use exact category, subcategory, and account names from the lists below.
- If the input is a greeting, chit-chat, or does not contain a financial transaction, return: {"amount": null, "error": "No transaction detected"}

USER TEXT:
"${text}"

==================================================
STEP 1: DETERMINE TRANSACTION TYPE
==================================================

Choose exactly one:

"expense"
"income"
"transfer"

EXPENSE:
Use when money is spent on a product, service, bill, food,
travel, shopping, entertainment, or any other purchase.

Strong expense indicators:
- spent
- spend
- paid
- pay
- bought
- purchase
- purchased
- cost
- paid for

Examples:

"spent 1000 on dinner" = expense
"paid 500 for lunch" = expense
"bought shoes for 2000" = expense

IMPORTANT:
A normal purchase or payment is NEVER a transfer.

INCOME:
Use when money is received or earned.

Strong income indicators:
- income
- salary
- credited
- received
- earned
- bonus
- refund
- cashback
- deposit
- adding money into an account

Examples:

"salary 50000 credited" = income
"received 1000 cashback" = income

TRANSFER:
Use ONLY when money is moved between two accounts owned by the user.

Strong transfer indicators:
- transfer
- trf
- move money
- moved money
- from X to Y

Examples:

"transfer 1000 from Union Bank to ICICI" = transfer
"trf 500 from ICICI to Union Bank" = transfer

IMPORTANT:

"spent 1000 on food" = expense, NOT transfer.
"paid 1000 for dinner" = expense, NOT transfer.
"spent 1000 from Union Bank" = expense, NOT transfer.

Do NOT classify a transaction as transfer merely because
a bank account name appears in the sentence.

==================================================
STEP 2: DETERMINE ACCOUNT
==================================================

ACCOUNT RULES:

- If an account is explicitly mentioned, use that exact account name.
- If no account is mentioned, use the default account "${defaultAccount}".
- NEVER invent an account name.
- Account must exactly match one of the Accounts listed below.

TO_ACCOUNT RULES:

- to_account is ONLY used for transfers.
- For an expense, to_account MUST be null.
- For income, to_account MUST be null.
- For a transfer, to_account is the destination account.
- For a transfer, account is the source account.

==================================================
STEP 3: DETERMINE CATEGORY
==================================================

For EXPENSE transactions:

- Category MUST come from EXPENSE CATEGORIES.
- Classify based on WHAT the money was spent on.
- Do NOT classify based on merchant/store name.
- NEVER use a merchant, shop, restaurant, or store name as category.

IMPORTANT FOOD RULE:

Words such as:

food
dinner
lunch
breakfast
meal
restaurant
groceries
vegetables
fruits
snacks
coffee
tea
dining

normally indicate the "Food" category IF "Food" exists
in the EXPENSE CATEGORIES list.

Examples:

"spent 1000 on food for dinner" → Food
"paid 500 for lunch" → Food
"had dinner for 800" → Food
"bought vegetables for 300" → Food

IMPORTANT TRANSPORT RULE:

Words such as:

petrol
diesel
fuel
taxi
uber
ola
bus
train
metro
parking
toll

normally indicate the "Transport" category IF "Transport"
exists in the EXPENSE CATEGORIES list.

Examples:

"petrol 1500" → Transport
"paid 300 for uber" → Transport
"spent 500 on petrol" → Transport

CATEGORY RULE:

Always use the exact category name from the provided lists.

NEVER invent a category.

For INCOME transactions:

- Category MUST come from INCOME CATEGORIES.
- Use the closest matching income category.

For TRANSFER transactions:

- category MUST be "Transfer".
- subcategory MUST be "".

==================================================
STEP 4: DETERMINE SUBCATEGORY
==================================================

SUBCATEGORY RULES:

- Use ONLY an exact subcategory from the selected category.
- NEVER invent a subcategory.
- NEVER use a subcategory belonging to another category.
- If there is no suitable matching subcategory, return "".
- For transfers, always return "".

Examples:

"dinner" → Food → Dinner, IF Dinner exists.
"lunch" → Food → Lunch, IF Lunch exists.
"petrol" → Transport → Petrol, IF Petrol exists.

If the exact subcategory does not exist:

"dinner" → Food → ""

Do NOT create new subcategories.

==================================================
STEP 5: DETERMINE AMOUNT
==================================================

Return amount as a number only. Strip any commas or currency symbols.

Examples:

"1000 rupees" → 1000
"30,000" → 30000
"a thousand rupees" → 1000
"₹1,500" → 1500
"500" → 500

Never include:

₹
Rs
rupees
currency symbols
commas

If no amount can be identified or if the input is not a financial transaction (such as a greeting or chit-chat), return null for amount and include "error": "No transaction detected".

==================================================
AVAILABLE EXPENSE CATEGORIES
==================================================

${expenseCategories || '- No expense categories configured'}

==================================================
AVAILABLE INCOME CATEGORIES
==================================================

${incomeCategories || '- No income categories configured'}

==================================================
AVAILABLE ACCOUNTS
==================================================

${accountNames}

Default account:

"${defaultAccount}"

==================================================
EXAMPLES
==================================================

Example 1:

Input:
"Bharath Vegetables 60"

Output:
{"amount":60,"category":"Food","subcategory":"Fruit and Vegetables and Groceries","account":"${defaultAccount}","to_account":null,"transaction_type":"expense"}

Example 2:

Input:
"I have spent a thousand rupees on food for dinner today night."

Output:
{"amount":1000,"category":"Food","subcategory":"Dinner","account":"${defaultAccount}","to_account":null,"transaction_type":"expense"}

Example 3:

Input:
"I spent 1000 on dinner"

Output:
{"amount":1000,"category":"Food","subcategory":"Dinner","account":"${defaultAccount}","to_account":null,"transaction_type":"expense"}

Example 4:

Input:
"I paid 500 for lunch"

Output:
{"amount":500,"category":"Food","subcategory":"Lunch","account":"${defaultAccount}","to_account":null,"transaction_type":"expense"}

Example 5:

Input:
"petrol 1500 union bank"

Output:
{"amount":1500,"category":"Transport","subcategory":"Petrol","account":"Union Bank","to_account":null,"transaction_type":"expense"}

Example 6:

Input:
"Income 5000 add to icici"

Output:
{"amount":5000,"category":"Salary","subcategory":"Salary","account":"ICICI","to_account":null,"transaction_type":"income"}

Example 7:

Input:
"Add amount 1000 rupees to union bank"

Output:
{"amount":1000,"category":"Salary","subcategory":"Salary","account":"Union Bank","to_account":null,"transaction_type":"income"}

Example 8:

Input:
"trf 1000 from union bank to icici"

Output:
{"amount":1000,"category":"Transfer","subcategory":"","account":"Union Bank","to_account":"ICICI","transaction_type":"transfer"}

Example 9:

Input:
"I transferred 2000 from ICICI to Union Bank"

Output:
{"amount":2000,"category":"Transfer","subcategory":"","account":"ICICI","to_account":"Union Bank","transaction_type":"transfer"}

Example 10:

Input:
"spent 30,000 on rent"

Output:
{"amount":30000,"category":"Rent,Waterbill,Maintenance","subcategory":"Rent","account":"${defaultAccount}","to_account":null,"transaction_type":"expense"}

Example 11:

Input:
"I spent 1000 from Union Bank"

Output:
{"amount":1000,"category":"Other","subcategory":"","account":"Union Bank","to_account":null,"transaction_type":"expense"}

Example 12:

Input:
"Hello"

Output:
{"amount":null,"error":"No transaction detected"}

Example 13:

Input:
"Good morning, how are you?"

Output:
{"amount":null,"error":"No transaction detected"}

==================================================
FINAL VALIDATION BEFORE OUTPUT
==================================================

Before returning the JSON, verify:

1. transaction_type is exactly one of:
   "expense", "income", "transfer"

2. amount is a number or null.

3. category exactly matches a category from the available lists.

4. subcategory exactly matches a subcategory belonging to the
   selected category, or is "".

5. account exactly matches one of the available account names.

6. to_account is null unless transaction_type is transfer.

7. If transaction_type is transfer:
   - account is the source account.
   - to_account is the destination account.
   - category is "Transfer".
   - subcategory is "".

8. If the text describes spending on food/dinner/lunch/meal,
   transaction_type MUST be "expense", not "transfer".

9. If the text describes spending on transport/petrol/taxi/etc.,
   transaction_type MUST be "expense", not "transfer".

10. Do not infer a transfer merely because an account name is mentioned.

FINAL OUTPUT:

Return ONLY the JSON object.
`;
}

export { SILENCE_PATTERNS } from './heuristics.js';