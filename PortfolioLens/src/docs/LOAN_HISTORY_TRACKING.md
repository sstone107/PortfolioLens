# Loan History Tracking Strategy

*This document supplements Task 9.9: "Implement Hybrid History Tracking System" in TaskMaster*

## Overview

This document outlines the strategy for implementing a hybrid history tracking system for loan data, combining transaction-based payment tracking with attribute change history for other loan properties.

## Hybrid Approach

Our approach uses two complementary tracking methods:

1. **Transaction Table**: Records all payment events with dedicated fields for payment-specific attributes
2. **Change History Table**: Tracks changes to all other relevant loan attributes over time

## Field Selection Process

**IMPORTANT**: Before implementation, conduct a thorough review of loan fields to determine which ones should be tracked in the change history table. Not all fields need change tracking, and careful selection will prevent the history table from growing too large.

### Field Review Methodology

1. **Categorize fields by importance**:
   - **Essential fields** (always track changes): loan status, interest rate, principal balance, etc.
   - **Important fields** (track significant changes): property value, credit score, etc.
   - **Optional fields** (only track if specifically requested): minor details, calculated fields, etc.

2. **Consider change frequency**:
   - High-frequency changes might need a different approach or sampling
   - Fields that rarely change but are important when they do (like loan terms)
   - Fields that change regularly as part of normal operation (like current balance)

3. **Evaluate business impact**:
   - Regulatory/compliance requirements for specific fields
   - Fields used in reporting and analytics
   - Fields that affect loan performance metrics

4. **Storage and performance considerations**:
   - Estimate growth rate of the history table based on field selection
   - Consider compression or summarization strategies for high-volume changes
   - Evaluate indexing needs for efficient querying

5. **Define materiality thresholds**:
   - Set thresholds for numeric fields (e.g., only track balance changes > $100)
   - Define meaningful changes for categorical fields
   - Consider time-based aggregation for frequent small changes

## Implementation Guidelines

### Change History Table Design

```sql
CREATE TABLE loan_attribute_changes (
    id SERIAL PRIMARY KEY,
    loan_id UUID NOT NULL REFERENCES loans(id),
    field_name VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    change_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    source VARCHAR(100),  -- 'SYSTEM', 'USER', 'IMPORT', etc.
    user_id UUID REFERENCES auth.users(id),
    change_reason TEXT,
    materiality_score INTEGER,  -- Optional: indicate importance of change
    CONSTRAINT loan_attribute_changes_loan_id_fkey FOREIGN KEY (loan_id)
        REFERENCES loans(id) ON DELETE CASCADE
);

-- Indexes for efficient querying
CREATE INDEX idx_loan_attribute_changes_loan_id ON loan_attribute_changes(loan_id);
CREATE INDEX idx_loan_attribute_changes_field_name ON loan_attribute_changes(field_name);
CREATE INDEX idx_loan_attribute_changes_change_date ON loan_attribute_changes(change_date);
```

### Transaction Table Design

```sql
CREATE TABLE loan_payments (
    id SERIAL PRIMARY KEY,
    loan_id UUID NOT NULL REFERENCES loans(id),
    transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
    effective_date DATE NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    payment_type VARCHAR(50) NOT NULL,  -- 'REGULAR', 'EXTRA_PRINCIPAL', 'ESCROW', etc.
    allocation JSONB,  -- Breakdown of payment allocation
    status VARCHAR(50),  -- 'PENDING', 'COMPLETED', 'RETURNED', etc.
    source VARCHAR(100),  -- 'IMPORT', 'MANUAL', 'ACH', etc.
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT loan_payments_loan_id_fkey FOREIGN KEY (loan_id)
        REFERENCES loans(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_loan_payments_loan_id ON loan_payments(loan_id);
CREATE INDEX idx_loan_payments_transaction_date ON loan_payments(transaction_date);
CREATE INDEX idx_loan_payments_effective_date ON loan_payments(effective_date);
```

## UI Presentation Guidelines

1. **Unified Timeline**: Present both payment events and attribute changes in a single chronological view
2. **Visual Differentiation**: Use different styling for different types of events
3. **Filtering Controls**: Allow filtering by date range, change type, materiality, etc.
4. **Grouping Options**: Enable grouping related changes (e.g., all changes from a loan modification)
5. **Detail Expansion**: Allow expanding entries to see full details of changes
6. **Export Capability**: Provide options to export the history for compliance needs

## Maintenance Considerations

1. **Archiving Strategy**: Define a strategy for archiving older history records
2. **Performance Monitoring**: Regularly review query performance on history tables
3. **Field Review Updates**: Periodically review the tracked fields list to adjust as needed
4. **Data Compression**: Consider compressed storage for older history data

This strategy balances comprehensive history tracking with performance and storage efficiency considerations.