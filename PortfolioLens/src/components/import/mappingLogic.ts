import { SheetInfo, TableInfo, ColumnMapping, TableColumn, ColumnType } from './types';

const stringSimilarity = {
  compareTwoStrings: (str1: string, str2: string): number => {
    const lcsLength = (s1: string, s2: string) => {
        let l = 0; while(l < s1.length && l < s2.length && s1[l] === s2[l]) l++; return l;
    }
    const commonPrefix = lcsLength(str1, str2);
    const commonSuffix = lcsLength(str1.split('').reverse().join(''), str2.split('').reverse().join(''));
    if (str1.length + str2.length === 0) return 1;
    return (commonPrefix + commonSuffix) / (str1.length + str2.length);
  },
  findBestMatch: (mainString: string, targetStrings: string[]): { bestMatch: { target: string; rating: number }, ratings: {target: string, rating: number}[] } => {
    if (!targetStrings || targetStrings.length === 0) {
      return { bestMatch: { target: '', rating: 0 }, ratings: [] };
    }
    const ratings = targetStrings.map(target => ({ target, rating: stringSimilarity.compareTwoStrings(mainString, target) }));
    const bestMatch = ratings.reduce((best, current) => (current.rating > best.rating ? current : best), ratings[0]);
    return { bestMatch, ratings };
  }
};

const MIN_CONFIDENCE_THRESHOLD = 0.6; 

/**
 * Generates initial column mappings by matching Excel headers to table column names.
 * Uses fuzzy matching to find the best fit.
 * @param sheetInfo Information about the Excel sheet.
 * @param tableInfo Information about the target database table.
 * @param inferDataTypes Flag to control data type inference (currently basic).
 * @returns A record mapping Excel column names to suggested database columns and types.
 */
export function generateColumnMappings(
  sheetInfo: SheetInfo,
  tableInfo: TableInfo,
  inferDataTypes: boolean 
): Record<string, ColumnMapping> {
  const mappings: Record<string, ColumnMapping> = {};
  
  const dbColumnNames = tableInfo.columns.map(col => col.columnName);
  const dbColumnDetails = new Map<string, TableColumn>();
  tableInfo.columns.forEach(col => dbColumnDetails.set(col.columnName, col));

  const normalizeHeader = (header: string): string => {
    return header.toLowerCase().replace(/[\s_\-]+/g, '').trim();
  };

  sheetInfo.columns.forEach(excelCol => {
    const normalizedExcelCol = normalizeHeader(excelCol);
    if (dbColumnNames.length === 0) return; 

    const normalizedDbColumnNames = dbColumnNames.map(normalizeHeader);
    const bestMatchResult = stringSimilarity.findBestMatch(normalizedExcelCol, normalizedDbColumnNames);
    const bestDbNormalizedName = bestMatchResult.bestMatch.target;
    const confidenceScore = bestMatchResult.bestMatch.rating;

    let originalDbColName = '';
    for(let i=0; i<normalizedDbColumnNames.length; i++){
        if(normalizedDbColumnNames[i] === bestDbNormalizedName){
            originalDbColName = dbColumnNames[i];
            break;
        }
    }
    
    const matchedDbColDetails = originalDbColName ? dbColumnDetails.get(originalDbColName) : null;

    if (matchedDbColDetails && confidenceScore >= MIN_CONFIDENCE_THRESHOLD) {
       let type: ColumnType = 'string'; 
       
       const dbDataType = matchedDbColDetails.dataType.toLowerCase();
       if (['integer', 'bigint', 'numeric', 'real', 'double precision', 'decimal', 'float', 'money'].some(t => dbDataType.includes(t))) {
           type = 'number';
       } else if (dbDataType.includes('boolean') || dbDataType.includes('bit')) {
           type = 'boolean';
       } else if (['date', 'timestamp', 'time'].some(t => dbDataType.includes(t))) {
           type = 'date';
       }

      mappings[excelCol] = {
        excelColumn: excelCol,
        dbColumn: matchedDbColDetails.columnName,
        type: type,
        confidenceScore: parseFloat(confidenceScore.toFixed(2)) 
      };
    } else {
        mappings[excelCol] = {
            excelColumn: excelCol,
            dbColumn: null, 
            type: 'string', 
            confidenceScore: 0 
        };
    }
  });
  console.log("Generated Initial Fuzzy Mappings:", mappings);
  return mappings;
}
