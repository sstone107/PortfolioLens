# Fix TableMappingStepVirtualized Component

I need to fix the following issues in the TableMappingStepVirtualized.tsx component:

1. The DOM nesting error where TableCell components are incorrectly nested within a div from react-window
2. Improve the visual layout with fixed-width cells similar to ColumnMappingStepVirtualized
3. Make sure the table has a consistent, balanced appearance

## Current Implementation Issues

The current implementation has these problems:
- In the `renderTableRow` function, `TableCell` components are directly inside a `div` from react-window
- The layout is unbalanced with inconsistent widths
- Tables with match below 95% confidence are incorrectly auto-mapping (this was fixed in useAutoTableMatch.ts)
- LinearProgress was missing from the imports (this was also fixed)

## Required Changes

For the DOM nesting issue:
1. Replace all `<TableCell>` components in the virtualized rows with appropriately styled `<div>` elements
2. Make each cell a fixed width with flex properties:
   - Sheet Name: ~20% width
   - Database Table: ~30% width
   - Header Row: fixed 100px width
   - Skip Toggle: fixed 100px width
   - Status: fixed 140px width
   - Actions: fixed 100px width

3. Apply proper styling to each cell:
   - Padding: 16px (consistent across all cells)
   - Border-bottom: '1px solid rgba(224, 224, 224, 1)'
   - Content alignment and vertical centering

Example structure:

```jsx
<div className="ReactWindowRow" style={{...style, display: 'flex', width: '100%', ...}}>
  {/* Sheet Name */}
  <div style={{ flex: '1 1 20%', padding: '16px', ...}}>
    {/* Sheet name content */}
  </div>
  
  {/* Database Table */}
  <div style={{ flex: '1 1 30%', padding: '16px', ...}}>
    {/* Database table content */}
  </div>
  
  {/* Header Row */}
  <div style={{ flex: '0 0 100px', padding: '16px', ...}}>
    {/* Header row content */}
  </div>
  
  {/* Skip Toggle */}
  <div style={{ flex: '0 0 100px', padding: '16px', ...}}>
    {/* Skip toggle content */}
  </div>
  
  {/* Status */}
  <div style={{ flex: '0 0 140px', padding: '16px', ...}}>
    {/* Status content */}
  </div>
  
  {/* Actions */}
  <div style={{ flex: '0 0 100px', padding: '16px', ...}}>
    {/* Actions content */}
  </div>
</div>
```

## Additional Code Context

The virtualization is implemented using react-window's FixedSizeList. The current structure in the file that needs updating is:

```jsx
<Box sx={{ mb: 2, height: 400, overflow: 'hidden' }}>
  <TableContainer component={Paper} sx={{ mb: 0 }}>
    <Table size="small" stickyHeader>
      <TableHead>
        <TableRow>
          <TableCell>Sheet Name</TableCell>
          <TableCell>Database Table</TableCell>
          <TableCell>Header Row</TableCell>
          <TableCell sx={{
            pr: 2,
            pl: 2,
            textAlign: 'center',
            backgroundColor: 'transparent',
            width: 100
          }}>
            Skip
          </TableCell>
          <TableCell>Status</TableCell>
          <TableCell>Actions</TableCell>
        </TableRow>
      </TableHead>
    </Table>
  </TableContainer>
  
  {/* Virtualized body for performance with large datasets */}
  <Box 
    component="div" 
    sx={{ 
      height: 350, 
      overflow: 'auto',
      '& .ReactWindowRow': {
        display: 'flex',
        width: '100%',
        borderBottom: '1px solid rgba(224, 224, 224, 1)'
      }
    }}
  >
    <List
      height={350}
      width="100%"
      itemCount={sortedSheets.length}
      itemSize={60} // Adjust based on your row height
      overscanCount={5} // Number of items to render outside of the visible area
      innerElementType="div"
    >
      {renderTableRow}
    </List>
  </Box>
</Box>
```

Please update the entire `renderTableRow` function to match this styling approach.