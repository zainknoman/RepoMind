export const TABLE_SUFFIXES = Object.freeze(['', '$HIS', '$NAU']);

export const ROUTINE_APPLICATIONS = Object.freeze({
  "ACCOUNT": Object.freeze({ name: "ACCOUNT", alias: "ACC", fieldPrefix: "AC.", recordVar: "R.ACC", hasLayoutInsert: true }),
  "ACCOUNT.CLOSURE": Object.freeze({ name: "ACCOUNT.CLOSURE", alias: "ACL", fieldPrefix: "AC.ACL.", recordVar: "R.ACL", hasLayoutInsert: true }),
  "CUSTOMER": Object.freeze({ name: "CUSTOMER", alias: "CUS", fieldPrefix: "EB.CUS.", recordVar: "R.CUS", hasLayoutInsert: true }),
  "DRAWINGS": Object.freeze({ name: "DRAWINGS", alias: "DRA", fieldPrefix: "TF.DR.", recordVar: "R.DRA", hasLayoutInsert: true }),
  "FOREX": Object.freeze({ name: "FOREX", alias: "FX", fieldPrefix: "FX.", recordVar: "R.FX", hasLayoutInsert: true }),
  "FUNDS.TRANSFER": Object.freeze({ name: "FUNDS.TRANSFER", alias: "FN", fieldPrefix: "FT.", recordVar: "R.FT", hasLayoutInsert: true }),
  "LD.LOANS.AND.DEPOSITS": Object.freeze({ name: "LD.LOANS.AND.DEPOSITS", alias: "LND", fieldPrefix: "LD.", recordVar: "R.LND", hasLayoutInsert: true }),
  "MG.MORTGAGE": Object.freeze({ name: "MG.MORTGAGE", alias: "MG", fieldPrefix: "MG.", recordVar: "R.MG", hasLayoutInsert: true }),
  "MM.MONEY.MARKET": Object.freeze({ name: "MM.MONEY.MARKET", alias: "MM", fieldPrefix: "MM.", recordVar: "R.MM", hasLayoutInsert: true }),
  "REPO": Object.freeze({ name: "REPO", alias: "REPO", fieldPrefix: "RP.", recordVar: "R.REPO", hasLayoutInsert: true }),
  "SEC.TRADE": Object.freeze({ name: "SEC.TRADE", alias: "SEC", fieldPrefix: "SC.SBS.", recordVar: "R.SEC", hasLayoutInsert: true }),
  "STMT.ENTRY": Object.freeze({ name: "STMT.ENTRY", alias: "STMT", fieldPrefix: "AC.STE.", recordVar: "R.STMT", hasLayoutInsert: true }),
  "STMT.ENTRY.DETAIL": Object.freeze({ name: "STMT.ENTRY.DETAIL", alias: "ST.DT", fieldPrefix: "", recordVar: "R.ST.DT", hasLayoutInsert: false }),
  "STMT.PRINTED": Object.freeze({ name: "STMT.PRINTED", alias: "STPR", fieldPrefix: "", recordVar: "R.STPR", hasLayoutInsert: false }),
  "TELLER": Object.freeze({ name: "TELLER", alias: "TT", fieldPrefix: "TT.TE.", recordVar: "R.TT", hasLayoutInsert: true }),
  "USER": Object.freeze({ name: "USER", alias: "USR", fieldPrefix: "EB.USE.", recordVar: "R.USR", hasLayoutInsert: true }),
});

export function getApplication(name) {
  return typeof name === 'string' ? ROUTINE_APPLICATIONS[name] || null : null;
}

export function normalizeTableSpec(table) {
  if (typeof table === 'string') {
    const value = table.trim();
    const suffix = value.endsWith('$HIS') ? '$HIS' : value.endsWith('$NAU') ? '$NAU' : '';
    const name = suffix ? value.slice(0, -suffix.length) : value;
    const application = getApplication(name);
    return application && TABLE_SUFFIXES.includes(suffix)
      ? { application, suffix, table: name + suffix }
      : null;
  }
  if (!table || typeof table !== 'object') return null;
  const name = String(table.name || table.application || '').trim();
  const suffix = String(table.suffix || '');
  const application = getApplication(name);
  return application && TABLE_SUFFIXES.includes(suffix)
    ? { application, suffix, table: name + suffix }
    : null;
}
