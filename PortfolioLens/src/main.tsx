// Entry point for the application
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initSupabaseMcp, SAMPLE_TABLES } from './utility/supabaseMcp';
import { initMcpBridge, createTableIfNotExists } from './utility/mcpBridge';
import { initializeErrorSuppression } from './utility/errorSuppressionUtils';

// Initialize error suppression first to catch any React/MUI warnings
console.log('Initializing error suppression...');
initializeErrorSuppression();

// Initialize the Supabase MCP integration
initSupabaseMcp();

// Initialize the MCP bridge to connect MCP Server functions
initMcpBridge();

// Wait for DOM to be ready before initializing database
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing database...');
  ensureDatabaseSetup();
});

// Setup database tables for the application
async function ensureDatabaseSetup() {
  try {
    console.log('Setting up database tables...');
    
    // Create the tables_list table if it doesn't exist
    await createTableIfNotExists('tables_list', {
      id: 'SERIAL PRIMARY KEY',
      table_name: 'TEXT NOT NULL UNIQUE',
      display_name: 'TEXT',
      category: 'TEXT',
      description: 'TEXT',
      created_at: 'TIMESTAMP WITH TIME ZONE DEFAULT now()',
      updated_at: 'TIMESTAMP WITH TIME ZONE DEFAULT now()'
    });
    
    // Insert sample tables into tables_list if it's empty
    await window.supabaseMcp?.executeSql({
      project_id: 'kukfbbaevndujnodafnk',
      query: `
        INSERT INTO tables_list (table_name, display_name, category)
        VALUES 
          ('loan_information', 'Loan Information', 'Loans'),
          ('borrowers', 'Borrowers', 'Customers'),
          ('payments', 'Payments', 'Transactions'),
          ('properties', 'Properties', 'Assets'),
          ('users', 'Users', 'System')
        ON CONFLICT (table_name) DO NOTHING;
      `
    });
    
    console.log('Database setup completed successfully');
  } catch (error) {
    console.warn('Database setup encountered issues:', error);
    console.log('Using mock data instead');
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
