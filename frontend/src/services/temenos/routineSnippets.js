const defineSnippet = (id, name, description, content) =>
  Object.freeze({ id, name, description, content });

export const ROUTINE_SNIPPETS = Object.freeze([
  defineSnippet('ReadSeq', 'ReadSeq', 'Read a sequential file.', "OPENSEQ FILE.NAME TO SEQ.FILE ELSE STOP\nREADSEQ LINE FROM SEQ.FILE ELSE LINE = ''\nCLOSESEQ SEQ.FILE"),
  defineSnippet('Readlist', 'Readlist', 'Read the active select list.', 'READLIST ID.LIST'),
  defineSnippet('Fread', 'Fread', 'Read a T24 file through F.READ.', 'CALL F.READ(FN.FILE, ID, R.FILE, F.FILE, ERR)'),
  defineSnippet('Fwrite', 'Fwrite', 'Write a T24 record through F.WRITE.', 'CALL F.WRITE(FN.FILE, ID, R.FILE, F.FILE)'),
  defineSnippet('WriteFile', 'WriteFile', 'Write an opened file record.', 'WRITE R.FILE ON F.FILE, ID'),
  defineSnippet('Locate', 'Locate', 'Locate a value in a dynamic array.', 'LOCATE(VALUE, ARRAY, 1; POS) THEN\n    * found\nEND ELSE\n    * not found\nEND'),
  defineSnippet('GetLocalRef', 'GetLocalRef', 'Retrieve a local reference.', 'CALL GET.LOC.REF(FN.FILE, FIELD.NAME, LOCAL.REF, R.FILE)'),
  defineSnippet('FindStr', 'FindStr', 'Find a substring.', 'POS = INDEX(TEXT, SEARCH.TEXT, 1)'),
  defineSnippet('CallCDD', 'CallCDD', 'Call the CDD helper.', 'CALL CDD(CDD.NAME, CDD.ARGS, CDD.RESULT)'),
  defineSnippet('CallCDT', 'CallCDT', 'Call the CDT helper.', 'CALL CDT(CDT.NAME, CDT.ARGS, CDT.RESULT)'),
  defineSnippet('SubString', 'SubString', 'Extract a substring.', 'VALUE = TEXT[START, LENGTH]'),
  defineSnippet('Trim', 'Trim', 'Trim a value.', 'VALUE = TRIM(TEXT)'),
  defineSnippet('Convert', 'Convert', 'Apply a T24 conversion.', 'VALUE = OCONV(TEXT, CONVERSION)'),
  defineSnippet('Change', 'Change', 'Replace occurrences of a value.', 'VALUE = CHANGE(TEXT, OLD.VALUE, NEW.VALUE)'),
]);

export const ROUTINE_SNIPPETS_BY_ID = Object.freeze(
  Object.fromEntries(ROUTINE_SNIPPETS.map((snippet) => [snippet.id, snippet])),
);

export function getRoutineSnippet(id) {
  return ROUTINE_SNIPPETS_BY_ID[id] || null;
}
