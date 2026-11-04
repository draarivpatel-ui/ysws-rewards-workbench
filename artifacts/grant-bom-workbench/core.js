// Exact USD arithmetic over user-entered quotes. No vendor data is invented,
// fetched or represented as independently verified.
const ROW_KEYS = ['partNumber', 'description', 'quantity', 'unitPrice', 'supplier', 'quoteUrl', 'quotedOn'];
const SUPPLIERS = { DigiKey: 'digikey.com', Mouser: 'mouser.com', 'OSH Park': 'oshpark.com' };
const PRIVATE = [
  /\b[A-Z0-9._%+-]+@(?:gmail|outlook|hotmail|yahoo|icloud)\.com\b/i,
  /\b\d{2,5}\s+[a-z]+(?:\s+[a-z]+){0,3}\s+(?:street|road|drive|avenue|lane|court)\b/i,
  /\b(?:[A-Z][a-z]+[ \t]){1,5}(?:High School|Middle School|Elementary School)\b/,
  /(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)/i,
  /\b(?:password|secret|token|api[_ -]?key)["']?\s*[:=]/i,
  /\b(?:ghp_|github_pat_|sk-|sk_|xoxb-|AKIA|AIza|tskey-)[a-z0-9_-]{12,}/i
];

function objectKeys(value, allowed) {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new TypeError('Expected a structured object');
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError('Unknown fields are not accepted');
  for (const key of allowed) if (!Object.hasOwn(value, key)) throw new TypeError('A required field is missing');
}

function publicText(value, maximum = 180) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) throw new TypeError('Invalid public text field');
  if (PRIVATE.some((pattern) => pattern.test(value))) throw new TypeError('Personal or credential-like data is not accepted');
  return value.trim();
}

export function cents(value) {
  if (typeof value !== 'string' || !/^\d{1,6}(?:\.\d{1,2})?$/.test(value)) throw new TypeError('Enter a nonnegative USD amount with at most two decimal places');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function dollars(value) {
  if (typeof value !== 'bigint') throw new TypeError('Money must use integer cents');
  const sign = value < 0n ? '-' : '';
  const magnitude = value < 0n ? -value : value;
  return sign + magnitude / 100n + '.' + String(magnitude % 100n).padStart(2, '0');
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function validateRow(row, today = new Date().toISOString().slice(0, 10)) {
  objectKeys(row, ROW_KEYS);
  const partNumber = publicText(row.partNumber, 80);
  const description = publicText(row.description);
  if (!Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > 10000) throw new TypeError('Quantity must be a whole number from 1 through 10000');
  cents(row.unitPrice);
  if (!Object.hasOwn(SUPPLIERS, row.supplier)) throw new TypeError('Use DigiKey, Mouser or OSH Park');
  const quoteUrl = publicText(row.quoteUrl, 1000);
  let url;
  try { url = new URL(quoteUrl); } catch { throw new TypeError('Use a public supplier HTTPS quote URL'); }
  const domain = SUPPLIERS[row.supplier];
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !(url.hostname === domain || url.hostname.endsWith('.' + domain))) throw new TypeError('The quote URL must belong to the selected supplier');
  if ([...url.searchParams.keys()].some((key) => /token|secret|auth|password|key|email/i.test(key))) throw new TypeError('Do not include account or secret query parameters');
  if (!validDate(today) || !validDate(row.quotedOn) || row.quotedOn > today) throw new TypeError('Quote date must be a real calendar date, not in the future');
  return { partNumber, description, quantity: row.quantity, unitPrice: dollars(cents(row.unitPrice)), supplier: row.supplier, quoteUrl: url.href, quotedOn: row.quotedOn };
}

export function budget(input, today = new Date().toISOString().slice(0, 10)) {
  objectKeys(input, ['rows', 'shipping', 'tax', 'cap']);
  if (!Array.isArray(input.rows) || !input.rows.length || input.rows.length > 200) throw new TypeError('Add between 1 and 200 quoted items');
  const rows = input.rows.map((row) => validateRow(row, today));
  const shipping = cents(input.shipping), tax = cents(input.tax), cap = cents(input.cap);
  if (cap <= 0n) throw new TypeError('Budget cap must be positive');
  const parts = rows.reduce((total, row) => total + cents(row.unitPrice) * BigInt(row.quantity), 0n);
  const total = parts + shipping + tax;
  const staleQuotes = rows.map((row, index) => ({ index, ageDays: (Date.parse(today + 'T00:00:00Z') - Date.parse(row.quotedOn + 'T00:00:00Z')) / 86400000 })).filter((quote) => quote.ageDays > 30).map((quote) => quote.index);
  return {
    inputs: { rows, shipping: dollars(shipping), tax: dollars(tax), cap: dollars(cap) },
    parts: dollars(parts), total: dollars(total), remaining: dollars(cap - total),
    withinBudget: total <= cap, staleQuotes,
    quoteVerification: 'User-entered quotes, not independently verified. A budget result is not grant approval.'
  };
}

export function exportBudget(input, today) {
  const result = budget(input, today);
  return JSON.stringify({ schemaVersion: 1, ...result.inputs }, null, 2) + '\n';
}

export function importBudget(raw, today) {
  if (typeof raw !== 'string' || raw.length > 250000) throw new TypeError('Budget file exceeds the text limit');
  const parsed = JSON.parse(raw);
  objectKeys(parsed, ['schemaVersion', 'rows', 'shipping', 'tax', 'cap']);
  if (parsed.schemaVersion !== 1) throw new TypeError('Unsupported budget schema version');
  const { schemaVersion, ...inputs } = parsed;
  return budget(inputs, today).inputs;
}
