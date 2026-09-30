const defineSnippet = (id, name, description, content) => Object.freeze({ id, name, description, content });

export const ROUTINE_SNIPPETS = Object.freeze([
defineSnippet("ReadSeq", "ReadSeq", "Read sequential records from an OS file.", " Y.FILE.DIR  = ''\n FILE.NAME.1 = ''\n OPENSEQ Y.FILE.DIR,FILE.NAME.1 TO Y.FILE.POINTER LOCKED LOCK.ERR = 1 THEN OPEN.ERR =0 ELSE OPEN.ERR = 1\n IF OPEN.ERR THEN\n CRT \"FILE \" : FILE.NAME.1 : \" DOES NOT EXIST\"\n RETURN\n END\n ELSE\n LOOP\n READSEQ LST.DATA FROM Y.FILE.POINTER ELSE EOF = 1\n UNTIL EOF\n SEL.LIST.FT<-1> = Y.DATA\n REPEAT\n END"),
defineSnippet("Readlist", "Readlist", "Build and execute an EB.READLIST select.", " SEL.CMD.QRY = 'SELECT ' : \n CALL EB.READLIST(SEL.CMD.QRY,SEL.LIST,'',TOT.LIST,ERR.LIST)"),
defineSnippet("Fread", "Fread", "Read a record with F.READ; generator contextualizes FN/ID/record/file/error variables.", " CALL F.READ(FN,Y.ID,REC,F,E)"),
defineSnippet("Fwrite", "Fwrite", "Write a record with F.WRITE; generator contextualizes the record variable.", " CALL F.WRITE(FN,Y.ID,REC)\n CALL JOURNAL.UPDATE(Y.ID)"),
defineSnippet("WriteFile", "WriteFile", "Write a record to a sequential file.", " FILE.NAME = '.txt'\n FILE.PATH = 'YOUR.FOLDER'\n OPEN Y.FILE.PATH TO FIN.IN.PNTR ELSE\n GEN.ERR = 1\nABORT 201, Y.FILE.PATH\nEND\n\nWRITE Y.MSG.DATA ON FIN.IN.PNTR,Y.FILE.NAME ON ERROR\n WRITE.FAIL = 1\n END"),
defineSnippet("Locate", "Locate", "Locate a value in a dynamic array.", "LOCATE Y.VAR IN MY.DATA SETTING Y.POS THEN\n  Y.MID.RATE = MY.DATA<Y.POS>\n END"),
defineSnippet("GetLocalRef", "GetLocalRef", "Get a local reference position and read the value.", "CALL GET.LOC.REF(\"TABLE.NAME\",\"FIELD.NAME\",Y.POS)\nY.VAR  = R.CUS<PREFIX.LOCAL.REF><1,Y.POS>"),
defineSnippet("FindStr", "FindStr", "Find a string inside a value.", "FINDSTR \"MER\" IN VAR.DATA SETTING Ap, Vp THEN\n Y.TEMP2 =  \" Field \":Ap:\", value \":Vp\nCRT   Y.TEMP2\n END ELSE\n Y.TEMP2 = \" not found\"\n END"),
defineSnippet("CallCDD", "CallCDD", "Call the CDD date helper.", "RETDAYS = 'C'\nCALL CDD(\"\",'START.DATE','END.DATES',RETDAYS)"),
defineSnippet("CallCDT", "CallCDT", "Call the CDT date helper.", "  CALL CDT('REGION',Y.DATE,'+/- DAYS')"),
defineSnippet("SubString", "SubString", "Extract a field from a delimited string.", "FIELD(YOUR.STRING,\"SEPERATE CHAR\",VALUE POSITION)"),
defineSnippet("Trim", "Trim", "Trim a value using the legacy TRIM form.", "TRIM (YOUR VARIABLE,\"REMOVING CHAR\",\"A\")"),
defineSnippet("Convert", "Convert", "Convert field marks in a record variable.", "CONVERT '*' TO FM IN RECORD.VARIABLE\nCONVERT FM TO '*' IN RECORD.VARIABLE"),
defineSnippet("Change", "Change", "Replace one value with another.", "CHANGE(VARIABLE,\" OLD.VALUE\",\"NEW.VALUE\")")
]);

export const ROUTINE_SNIPPETS_BY_ID = Object.freeze(
  Object.fromEntries(ROUTINE_SNIPPETS.map((snippet) => [snippet.id, snippet])),
);

export function getRoutineSnippet(id) {
  return ROUTINE_SNIPPETS_BY_ID[id] || null;
}
