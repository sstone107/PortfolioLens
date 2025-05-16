# Template Matching Workflow Improvement

## Current Behavior
Currently, when a file is uploaded that matches a template (either automatically or by manual selection), the application still requires users to go through all the steps of the import process:
1. Upload File
2. Map Tables
3. Map Columns
4. Review & Import

This creates unnecessary friction when the user is importing a file that perfectly matches an existing template. The user has to click through several screens even though we already know exactly how the data should be mapped.

## Proposed Improvement
When a template is matched (or selected), we should:
1. Apply the template mapping automatically
2. Skip directly to the Review & Import step 
3. Show a clear notification that a template was applied
4. Still allow the user to go back to modify the mapping if needed

## Implementation Plan

### 1. Modify BatchImporter.tsx

Update the `FileUploadStep` component to handle template application and trigger automatic advancement:

```jsx
// In FileUploadStep.tsx:
const FileUploadStep = ({ onHeaderRowChange, onTemplateApplied }) => {
  // ... existing code

  // Auto-match template based on file name pattern
  useEffect(() => {
    const autoMatchTemplate = async () => {
      if (fileName && !selectedTemplateId && templates.length > 0) {
        try {
          const matchedTemplate = await findMatchingTemplate(fileName, templates);
          
          if (matchedTemplate) {
            // Set the template in the store
            setSelectedTemplateId(matchedTemplate.id);
            
            // Update local state to show notification
            setAutoMatchedTemplate(matchedTemplate.name);
            setShowAutoMatchNotification(true);
            
            // Notify parent that template was applied
            onTemplateApplied(matchedTemplate);
          }
        } catch (error) {
          console.error('Error auto-matching template:', error);
        }
      }
    };
    
    autoMatchTemplate();
  }, [fileName, selectedTemplateId, templates, setSelectedTemplateId, onTemplateApplied]);

  // Handle template selection
  const handleTemplateChange = (e: SelectChangeEvent) => {
    const templateId = e.target.value || null;
    setSelectedTemplateId(templateId);
    
    // Find the selected template
    if (templateId) {
      const selectedTemplate = templates.find(t => t.id === templateId);
      if (selectedTemplate) {
        // Notify parent that template was applied
        onTemplateApplied(selectedTemplate);
      }
    }
    
    // Clear auto-matched notification if user manually changes the template
    setAutoMatchedTemplate(null);
  };

  // ... rest of component
}
```

### 2. Update BatchImporter.tsx

Modify the main importer component to handle template application:

```jsx
// In BatchImporter.tsx
export const BatchImporter = ({ onComplete, onCancel }) => {
  // ... existing code
  const [templateApplied, setTemplateApplied] = useState(false);
  
  // ...

  const handleTemplateApplied = (template) => {
    console.log(`Template "${template.name}" applied, skipping to review step...`);
    
    // Apply the template to the current sheets
    applyTemplateToSheets(template);
    
    // Set flag to indicate template was applied
    setTemplateApplied(true);
    
    // Move directly to review step
    setActiveStep(3); // Review step index
    
    // Update progress
    setProgress({
      stage: 'review',
      message: `Template "${template.name}" applied automatically`,
      percent: 90
    });
  };
  
  // New function to apply template mapping to sheets
  const applyTemplateToSheets = (template) => {
    // Get the template's sheet mappings
    const templateMappings = template.sheetMappings || [];
    
    // Update sheets in store with template mappings
    const updatedSheets = sheets.map(sheet => {
      // Find matching sheet in template by name or similar name
      const matchingTemplateSheet = templateMappings.find(
        ts => ts.originalName === sheet.originalName ||
             ts.originalName.toLowerCase() === sheet.originalName.toLowerCase()
      );
      
      if (matchingTemplateSheet) {
        // Apply template mapping to this sheet
        return {
          ...sheet,
          mappedName: matchingTemplateSheet.mappedName,
          approved: true,
          needsReview: false,
          status: 'approved',
          // Copy column mappings
          columns: sheet.columns.map(col => {
            // Find matching column in template
            const matchingTemplateColumn = matchingTemplateSheet.columns.find(
              tc => tc.originalName === col.originalName ||
                   tc.originalName.toLowerCase() === col.originalName.toLowerCase()
            );
            
            if (matchingTemplateColumn) {
              // Apply template column mapping
              return {
                ...col,
                mappedName: matchingTemplateColumn.mappedName,
                dataType: matchingTemplateColumn.dataType,
                skip: matchingTemplateColumn.skip || false,
                confidence: 100, // High confidence since it's from template
                needsReview: false
              };
            }
            
            return col;
          })
        };
      }
      
      return sheet;
    });
    
    // Update sheets in store
    setSheets(updatedSheets);
  };
  
  // Modify the getStepContent to pass the template handler
  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <FileUploadStep 
            onHeaderRowChange={setHeaderRow}
            onTemplateApplied={handleTemplateApplied}
            onError={setError}
          />
        );
      // ... other steps
    }
  };

  // ... rest of component
}
```

### 3. Add a Skip Back Option

Add a prominent way for users to go back and adjust the mapping if needed:

```jsx
// In ReviewImportStep.tsx
const ReviewImportStep = ({ onComplete, onError, fromTemplate }) => {
  return (
    <Box>
      {fromTemplate && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <AlertTitle>Template Applied</AlertTitle>
          Mapping was automatically applied from a matching template. 
          You can review the data or go back to adjust the mapping if needed.
          
          <Button 
            color="primary" 
            variant="outlined" 
            sx={{ mt: 1 }}
            onClick={() => navigateToStep(1)} // Go back to table mapping
          >
            Adjust Mapping
          </Button>
        </Alert>
      )}
      
      {/* Rest of component */}
    </Box>
  );
};
```

## Benefits
1. **Efficiency**: Reduces the number of clicks needed to import a familiar file format
2. **Usability**: Makes the system feel more intelligent and responsive
3. **Consistency**: Ensures data is mapped consistently when using templates
4. **Flexibility**: Still allows users to modify mapping if needed

## Implementation Notes
- This approach maintains backward compatibility with the existing mapping flow
- The approach emphasizes providing clear feedback when a template is applied
- We should track metrics on how often templates are applied automatically to measure value