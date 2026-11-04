import { validateRow, budget, exportBudget, importBudget } from './core.js';
const el = (id) => document.getElementById(id);
let rows = [], approvedInputs = null;
const status = (text) => { el('status').textContent = text; };
const invalidate = () => { approvedInputs = null; el('download').disabled = true; el('result').textContent = ''; };

function renderRows() {
  el('rows').replaceChildren();
  rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    for (const value of [row.partNumber, row.description, row.quantity, row.unitPrice, row.supplier]) {
      const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
    }
    const td = document.createElement('td'), remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', 'Remove ' + row.partNumber);
    remove.addEventListener('click', () => { rows.splice(index, 1); invalidate(); renderRows(); status('Item removed. Recalculate your budget.'); });
    td.append(remove); tr.append(td); el('rows').append(tr);
  });
}

el('row-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    if (rows.length >= 200) throw new Error('At most 200 items are supported');
    const row = validateRow({ partNumber: el('part-number').value, description: el('description').value, quantity: Number(el('quantity').value), unitPrice: el('unit-price').value, supplier: el('supplier').value, quoteUrl: el('quote-url').value, quotedOn: el('quoted-on').value });
    rows.push(row); invalidate(); renderRows(); el('row-form').reset(); status('Quote added as user-entered data. Complete shipping and tax, then calculate.');
  } catch (error) { status(error.message); }
});

for (const id of ['shipping', 'tax', 'cap']) el(id).addEventListener('input', invalidate);
el('budget-form').addEventListener('submit', (event) => {
  event.preventDefault(); invalidate();
  try {
    const result = budget({ rows, shipping: el('shipping').value, tax: el('tax').value, cap: el('cap').value });
    approvedInputs = result.inputs;
    el('result').textContent = `Order USD ${result.total}. Remaining USD ${result.remaining}. ${result.withinBudget ? 'Within the entered budget cap.' : 'Over the entered budget cap.'}`;
    status(result.quoteVerification + (result.staleQuotes.length ? ' Some quotes are over 30 days old; recheck them.' : ''));
    el('download').disabled = false;
  } catch (error) { status(error.message); }
});

el('download').addEventListener('click', () => {
  if (!approvedInputs) return;
  const url = URL.createObjectURL(new Blob([exportBudget(approvedInputs)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'bom-budget.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

el('import-file').addEventListener('change', async () => {
  const file = el('import-file').files[0];
  if (!file) return;
  try {
    if (file.size > 250000) throw new Error('Budget file exceeds the text limit');
    const input = importBudget(await file.text());
    rows = input.rows;
    for (const id of ['shipping', 'tax', 'cap']) el(id).value = input[id];
    invalidate(); renderRows(); status('Imported validated inputs. Recalculate; stored totals are never trusted.');
  } catch (error) { status(error.message); }
  finally { el('import-file').value = ''; }
});
