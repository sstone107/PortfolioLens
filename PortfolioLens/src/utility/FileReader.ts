/**
 * File reading utility for different file formats
 */
export class FileReader {
  /**
   * Read a CSV file and parse its contents
   * @param file The CSV file to read
   * @returns Promise resolving to parsed data
   */
  static async readCsvFile(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const reader = new window.FileReader();
      
      reader.onload = (event) => {
        try {
          const csvText = event.target?.result as string;
          const lines = csvText.split(/\r\n|\n/);
          const headers = lines[0].split(',').map(h => h.trim());
          
          const data = [];
          for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = lines[i].split(',');
            const row: Record<string, any> = {};
            
            headers.forEach((header, index) => {
              row[header] = values[index]?.trim() || '';
            });
            
            data.push(row);
          }
          
          resolve(data);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = (error) => {
        reject(error);
      };
      
      reader.readAsText(file);
    });
  }
  
  /**
   * Read an Excel file and extract basic information
   * @param file The Excel file to read
   * @returns Promise resolving to workbook info
   */
  static async readFile(file: File): Promise<any> {
    throw new Error('Excel file reading not implemented - please use CSV format');
  }
  
  /**
   * Get data from a specific sheet in an Excel file
   * @param file The Excel file
   * @param sheetName The name of the sheet to read
   * @returns Promise resolving to sheet data
   */
  static async getSheetData(file: File, sheetName: string): Promise<any[]> {
    throw new Error('Excel sheet reading not implemented - please use CSV format');
  }
}