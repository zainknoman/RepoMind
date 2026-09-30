const defineSnippet = (id, name, description, content) =>
  Object.freeze({ id, name, description, content });

export const ROUTINE_SNIPPETS = Object.freeze([
  defineSnippet(
    'ReadSeq',
    'ReadSeq',
    'Open and read a sequential OS file with OPENSEQ/READSEQ; replace the directory, file name, output variable, and EOF handling for the target routine.',
    ' Y.FILE.DIR  = \'\'\n FILE.NAME.1 = \'\'\n OPENSEQ Y.FILE.DIR,FILE.NAME.1 TO Y.FILE.POINTER LOCKED LOCK.ERR = 1 THEN OPEN.ERR=0 ELSE OPEN.ERR = 1\n IF OPEN.ERR THEN\n CRT "FILE " : FILE.NAME.1 : " DOES NOT EXIST"\n RETURN\n END\n ELSE\n LOOP\n READSEQ LST.DATA FROM Y.FILE.POINTER ELSE EOF = 1\n UNTIL EOF\n SEL.LIST.FT<-1> = Y.DATA\n REPEAT\n END',
  ),
  defineSnippet(
    'Readlist',
    'Readlist',
    'Build and execute an EB.READLIST SELECT statement; provide the selection expression and handle the returned list, count, and error values.',
    " SEL.CMD.QRY = 'SELECT ' : \n CALL EB.READLIST(SEL.CMD.QRY,SEL.LIST,'',TOT.LIST,ERR.LIST)",
  ),
  defineSnippet(
    'Fread',
    'Fread',
    'Read a T24 record with F.READ; the generator contextualizes file name, record ID, record, file handle, and error variables.',
    ' CALL F.READ(FN,Y.ID,REC,F,E)',
  ),
  defineSnippet(
    'Fwrite',
    'Fwrite',
    'Write a T24 record with F.WRITE and journal the update; the generator contextualizes the file, ID, and record variables.',
    ' CALL F.WRITE(FN,Y.ID,REC)\n CALL JOURNAL.UPDATE(Y.ID)',
  ),
  defineSnippet(
    'WriteFile',
    'WriteFile',
    'Write data to a sequential OS file using OPEN/WRITE with explicit file and write error handling.',
    " FILE.NAME = '.txt'\n FILE.PATH = 'YOUR.FOLDER'\n OPEN Y.FILE.PATH TO FIN.IN.PNTR ELSE\n GEN.ERR = 1\nABORT 201, Y.FILE.PATH\nEND\n\nWRITE Y.MSG.DATA ON FIN.IN.PNTR,Y.FILE.NAME ON ERROR\n WRITE.FAIL = 1\n END",
  ),
  defineSnippet(
    'Locate',
    'Locate',
    'Locate a value in a dynamic array and return the matching field position through the SETTING variable.',
    'LOCATE Y.VAR IN MY.DATA SETTING Y.POS THEN\n  Y.MID.RATE = MY.DATA<Y.POS>\n END',
  ),
  defineSnippet(
    'GetLocalRef',
    'GetLocalRef',
    'Resolve a local-reference field position with GET.LOC.REF, then read the corresponding value from the record.',
    'CALL GET.LOC.REF("TABLE.NAME","FIELD.NAME",Y.POS)\nY.VAR  = R.CUS<PREFIX.LOCAL.REF><1,Y.POS>',
  ),
  defineSnippet(
    'FindStr',
    'FindStr',
    'Search for a string with FINDSTR and capture the matching field/value location.',
    'FINDSTR "MER" IN VAR.DATA SETTING Ap, Vp THEN\n Y.TEMP2 =  " Field ":Ap:", value ":Vp\nCRT   Y.TEMP2\n END ELSE\n Y.TEMP2 = "not found"\n END',
  ),
  defineSnippet(
    'CallCDD',
    'CallCDD',
    'Calculate the calendar-day difference between two dates with the legacy CDD API.',
    "RETDAYS = 'C'\nCALL CDD(\"\",'START.DATE','END.DATES',RETDAYS)",
  ),
  defineSnippet(
    'SubString',
    'SubString',
    'Extract a value from a delimited string with FIELD using the separator and field position.',
    'FIELD(YOUR.STRING,"SEPERATE CHAR",VALUE POSITION)',
  ),
  defineSnippet(
    'Trim',
    'Trim',
    'Trim or remove characters from a value using the legacy three-argument TRIM form.',
    'TRIM (YOUR VARIABLE,"REMOVING CHAR","A")',
  ),
  defineSnippet(
    'CallCDT',
    'CallCDT',
    'Add or subtract calendar days with the legacy CDT API; supply the region, date variable, and day expression.',
    "  CALL CDT('REGION',Y.DATE,'+/- DAYS')",
  ),
  defineSnippet(
    'Convert',
    'Convert',
    'Convert between a literal character and the T24 field-mark delimiter in a dynamic-array record.',
    "CONVERT '*' TO FM IN RECORD.VARIABLE\nCONVERT FM TO '*' IN RECORD.VARIABLE",
  ),
  defineSnippet(
    'Change',
    'Change',
    'Replace occurrences of one value with another using the legacy CHANGE function.',
    'CHANGE(VARIABLE," OLD.VALUE","NEW.VALUE")',
  ),
]);

export const ROUTINE_SNIPPETS_BY_ID = Object.freeze(
  Object.fromEntries(ROUTINE_SNIPPETS.map((snippet) => [snippet.id, snippet])),
);

export function getRoutineSnippet(id) {
  return ROUTINE_SNIPPETS_BY_ID[id] || null;
}
