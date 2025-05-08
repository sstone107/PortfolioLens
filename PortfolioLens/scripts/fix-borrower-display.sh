#!/bin/bash
# Script to run the migration and add test borrower data

# Navigate to the project directory
cd "$(dirname "$0")/.." || exit 1

echo "=== Fixing Borrower Display Issues ==="
echo "1. Running migration to add missing borrower fields..."
node ./scripts/run-borrower-migration.js

echo ""
echo "2. Adding test borrower data with detailed information..."
node ./scripts/add-test-borrower-data.js

echo ""
echo "3. Updating LoanDetailView component is already done."

echo ""
echo "=== All steps completed. ==="
echo "The borrower display in the loan detail view should now work correctly."
echo "You may need to restart your development server to see the changes."