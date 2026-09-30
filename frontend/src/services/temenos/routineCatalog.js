export const TABLE_SUFFIXES = Object.freeze(['', '$HIS', '$NAU']);

const definitions = [
  ['ACCOUNT', 'AC', 'AC', true],
  ['ACCOUNT.CLOSURE', 'AC.CLOSURE', 'AC.CLOSURE', true],
  ['CUSTOMER', 'CUSTOMER', 'EB.CUS', true],
  ['DRAWINGS', 'DRAWINGS', 'DRAWINGS', true],
  ['FOREX', 'FOREX', 'FOREX', true],
  ['FUNDS.TRANSFER', 'FT', 'FT', true],
  ['LD.LOANS.AND.DEPOSITS', 'LD', 'LD', true],
  ['MG.MORTGAGE', 'MG', 'MG', true],
  ['MM.MONEY.MARKET', 'MM', 'MM', true],
  ['REPO', 'REPO', 'REPO', true],
  ['SEC.TRADE', 'SEC.TRADE', 'SEC.TRADE', true],
  ['STMT.ENTRY', 'STMT.ENTRY', 'STMT', true],
  ['STMT.ENTRY.DETAIL', 'STMT.ENTRY.DETAIL', 'STMT.DETAIL', true],
  ['STMT.PRINTED', 'STMT.PRINTED', 'STMT.PRINT', true],
  ['TELLER', 'TT', 'TT', true],
  ['USER', 'USER', 'USER', true],
];

export const ROUTINE_APPLICATIONS = Object.freeze(
  Object.fromEntries(
    definitions.map(([name, alias, fieldPrefix, hasLayoutInsert]) => [
      name,
      Object.freeze({ name, alias, fieldPrefix, recordVar: `R.${alias}`, hasLayoutInsert }),
    ]),
  ),
);

export function getApplication(name) {
  return ROUTINE_APPLICATIONS[name] || null;
}

export function normalizeTableSpec(table) {
  if (typeof table === 'string') {
    const value = table.trim();
    const match = /^(.*?)(\$HIS|\$NAU)?$/.exec(value);
    const name = match?.[1] || '';
    const suffix = match?.[2] || '';
    const application = getApplication(name);
    return application && TABLE_SUFFIXES.includes(suffix)
      ? { application, suffix, table: name + suffix }
      : null;
  }

  if (!table || typeof table !== 'object') return null;
  const name = String(table.name || table.application || '').trim();
  const suffix = table.suffix || '';
  const application = getApplication(name);
  return application && TABLE_SUFFIXES.includes(suffix)
    ? { application, suffix, table: name + suffix }
    : null;
}
