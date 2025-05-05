import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import sqlScript from '../../../scripts/db/create_missing_tables.sql?raw';

export default function CreateTables() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [existingTables, setExistingTables] = useState<string[]>([]);
  const [missingTables, setMissingTables] = useState<string[]>([]);

  const tablesToCheck = [
    'delinquency',
    'expenses',
    'trailing_payments',
    'insurance',
    'loss_mitigation',
    'covid_19',
    'bankruptcy',
    'foreclosure',
    'loan_information'
  ];

  useEffect(() => {
    checkExistingTables();
  }, []);

  async function checkExistingTables() {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .in('table_name', tablesToCheck);

      if (error) throw error;

      const foundTables = data.map((t: any) => t.table_name);
      setExistingTables(foundTables);
      
      const missing = tablesToCheck.filter(t => !foundTables.includes(t));
      setMissingTables(missing);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function runMigration() {
    try {
      setIsLoading(true);
      setError(null);
      
      // Execute the SQL script directly against Supabase
      const { error } = await supabase.rpc('exec_sql', { sql: sqlScript });
      
      if (error) {
        throw new Error(`SQL execution failed: ${error.message}`);
      }
      
      setResult('Migration completed successfully');
      await checkExistingTables(); // Refresh the table list
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      
      // If the rpc method doesn't exist, show a helpful message
      if (err.message.includes('function exec_sql() does not exist')) {
        setError(`The exec_sql function doesn't exist in your Supabase project. 
          You'll need to run the SQL script manually in the Supabase SQL Editor.
          Go to https://app.supabase.io, select your project, 
          then go to SQL Editor and paste the script contents.`);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Database Table Creation</h1>
      
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Table Status</h2>
        {isLoading ? (
          <p>Checking tables...</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium mb-2">Existing Tables:</h3>
              {existingTables.length > 0 ? (
                <ul className="list-disc pl-5">
                  {existingTables.map(table => (
                    <li key={table} className="text-green-600">{table}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500">No tables found</p>
              )}
            </div>
            <div>
              <h3 className="font-medium mb-2">Missing Tables:</h3>
              {missingTables.length > 0 ? (
                <ul className="list-disc pl-5">
                  {missingTables.map(table => (
                    <li key={table} className="text-red-600">{table}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-green-500">All tables exist!</p>
              )}
            </div>
          </div>
        )}
      </div>
      
      {missingTables.length > 0 && (
        <div className="mb-6">
          <button
            onClick={runMigration}
            disabled={isLoading}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
          >
            {isLoading ? 'Creating Tables...' : 'Create Missing Tables'}
          </button>
        </div>
      )}
      
      {result && (
        <div className="mb-4 p-3 bg-green-100 border border-green-300 rounded">
          {result}
        </div>
      )}
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded">
          <h3 className="font-bold mb-1">Error:</h3>
          <div className="whitespace-pre-line">{error}</div>
        </div>
      )}

      <div className="bg-gray-100 p-4 rounded-lg">
        <h3 className="font-medium mb-2">SQL Preview:</h3>
        <div className="max-h-80 overflow-auto">
          <pre className="text-xs bg-gray-800 text-gray-200 p-4 rounded">
            {sqlScript}
          </pre>
        </div>
      </div>
    </div>
  );
}
