import React, { useState, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Chip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  useTheme,
  alpha,
  Tooltip,
  LinearProgress,
  Tab,
  Tabs,
  Menu,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Description as DescriptionIcon,
  PictureAsPdf as PdfIcon,
  Image as PictureIcon,
  InsertDriveFile as FileIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  Visibility as ViewIcon,
  MoreVert as MoreVertIcon,
  FilterList as FilterIcon,
  Share as ShareIcon,
  FileCopy as FileCopyIcon,
  History as HistoryIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useList, useCreate, useDelete, useGetIdentity } from "@refinedev/core";
import { Document as PdfDoc, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Configure the PDF.js worker.
// Vite will serve files from the 'public' directory at the root path.
// So, '/pdf.worker.mjs' will correctly point to 'public/pdf.worker.mjs'.
pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.mjs`;
console.log('[DEBUG DocumentsTab] pdfjs.GlobalWorkerOptions.workerSrc set to:', pdfjs.GlobalWorkerOptions.workerSrc);

// Renamed prop from 'document' to 'doc' to avoid shadowing global document
const DocumentViewerDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  doc: Document | null;
}> = ({ open, onClose, doc }) => {
  const [numPages, setNumPages] = React.useState<number>(1);

  console.log('[DEBUG DocumentViewerDialog] Rendering. Open:', open);
  if (doc) {
    console.log('[DEBUG DocumentViewerDialog] doc object:', JSON.stringify(doc, null, 2));
    console.log('[DEBUG DocumentViewerDialog] doc.file_path:', doc.file_path);
    console.log('[DEBUG DocumentViewerDialog] doc.mime_type:', doc.mime_type);
  }

  // Download handler
  const handleDownload = () => {
    if (!doc) return;
    const url = doc.file_path;
    const fileName = doc.file_name || 'document.pdf';
    // Use window.document to avoid shadowing
    const link = window.document.createElement('a');
    link.href = url;
    link.download = fileName;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          height: '80vh',
          maxHeight: '800px',
        },
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" noWrap sx={{ maxWidth: '70%' }}>
            {doc?.file_name}
          </Typography>
          <Box>
            <Tooltip title="Download">
              <IconButton onClick={handleDownload}>
                <DownloadIcon />
              </IconButton>
            </Tooltip>
            <IconButton onClick={onClose}>
              <DeleteIcon />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', justifyContent: 'center', p: 0 }}>
        {doc?.mime_type?.includes('pdf') ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', p: 4 }}>
            <PdfDoc
              file={doc.file_path} // Ensure this is a string URL or { url: string }
              onLoadSuccess={({ numPages }) => {
                console.log('[DEBUG DocumentViewerDialog] PDF Load Success. Num pages:', numPages);
                setNumPages(numPages);
              }}
              loading={<Typography>Loading PDF...</Typography>}
              error={
                <Typography color="error">
                  Could not load PDF preview. Please check console for details.
                </Typography>
              }
            >
              {Array.from(new Array(numPages), (el, index) => (
                <Page key={`page_${index + 1}`} pageNumber={index + 1} width={600} />
              ))}
            </PdfDoc>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              sx={{ mt: 2 }}
              onClick={handleDownload}
            >
              Download PDF
            </Button>
          </Box>
        ) : doc?.mime_type?.includes('image') ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}>
            <img
              src={doc.file_path}
              alt={doc.file_name}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', p: 4 }}>
            {getFileIcon(doc?.mime_type || '')}
            <Typography variant="body1" sx={{ mt: 2 }}>
              Preview not available. Please download the file to view it.
            </Typography>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              sx={{ mt: 2 }}
              onClick={handleDownload}
            >
              Download
            </Button>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

// Document categories/types
const documentCategories = [
  'Note',
  'Deed',
  'Mortgage',
  'Title Policy',
  'Insurance',
  'Pay History',
  'Modification',
  'Correspondence',
  'Other'
];

// Document sources
const documentSources = [
  'Loan Origination',
  'Servicing',
  'Investor',
  'Property',
  'Borrower',
  'Internal',
  'Other'
];

// Interface for component props
interface DocumentsTabProps {
  loanId: string;
}

// Interface for document object
interface Document {
  id: string;
  loan_id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by: {
    id: string;
    full_name: string;
  };
  tags?: string[];
  source?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Get file icon based on mimetype
 */
const getFileIcon = (mimeType: string) => {
  if (mimeType?.includes('pdf')) {
    return <PdfIcon fontSize="large" color="error" />;
  } else if (mimeType?.includes('image')) {
    return <PictureIcon fontSize="large" color="primary" />;
  } else if (mimeType?.includes('word')) {
    return <DescriptionIcon fontSize="large" color="info" />;
  } else {
    return <FileIcon fontSize="large" color="action" />;
  }
};

/**
 * Format file size to readable string
 */
const formatFileSize = (sizeInBytes: number) => {
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`;
  } else if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
};

/**
 * File uploader component
 */
const DocumentUploader: React.FC<{
  onUpload: (file: File, metadata: any) => void;
  isUploading: boolean;
}> = ({ onUpload, isUploading }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('');
  const [docSource, setDocSource] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Handle file selection
  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setIsDialogOpen(true);
  };

  // Handle file change from input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, []);

  // Handle click on upload area
  const handleUploadClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  // Handle dialog close
  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setSelectedFile(null);
    setDocType('');
    setDocSource('');
  };

  // Handle upload submission
  const handleUploadSubmit = () => {
    if (selectedFile && docType) {
      // Simulate progress
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          const newProgress = prev + 10;
          if (newProgress >= 100) {
            clearInterval(interval);
            
            // Call the parent upload handler with file and metadata
            onUpload(selectedFile, {
              document_type: docType,
              source: docSource,
            });
            
            // Reset state
            setTimeout(() => {
              setUploadProgress(0);
              handleDialogClose();
            }, 500);
            
            return 100;
          }
          return newProgress;
        });
      }, 200);
    }
  };

  return (
    <>
      <Paper
        elevation={2}
        sx={{
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '180px',
          border: '2px dashed',
          borderColor: isDragging ? 'primary.main' : 'divider',
          borderRadius: 2,
          backgroundColor: isDragging ? 'action.hover' : 'background.paper',
          cursor: isUploading ? 'default' : 'pointer',
          transition: 'all 0.2s ease-in-out',
        }}
        onDragEnter={!isUploading ? handleDragEnter : undefined}
        onDragLeave={!isUploading ? handleDragLeave : undefined}
        onDragOver={!isUploading ? handleDragOver : undefined}
        onDrop={!isUploading ? handleDrop : undefined}
        onClick={!isUploading ? handleUploadClick : undefined}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: 'none' }}
          disabled={isUploading}
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx,.txt"
        />
        
        {isUploading ? (
          <Box sx={{ width: '100%', textAlign: 'center' }}>
            <CircularProgress size={40} />
            <Typography variant="body1" sx={{ mt: 2, mb: 1 }}>
              Uploading Document...
            </Typography>
          </Box>
        ) : (
          <>
            <CloudUploadIcon color="primary" sx={{ fontSize: 48, mb: 1 }} />
            <Typography variant="h6" color="textPrimary">
              Drag & Drop File
            </Typography>
            
            <Button 
              variant="contained" 
              size="medium" 
              startIcon={<CloudUploadIcon />}
              sx={{ mt: 2 }}
              onClick={(e) => {
                e.stopPropagation();
                handleUploadClick();
              }}
            >
              Select Document
            </Button>
          </>
        )}
      </Paper>

      {/* Document metadata dialog */}
      <Dialog open={isDialogOpen} onClose={handleDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          Document Information
        </DialogTitle>
        
        <DialogContent dividers>
          {selectedFile && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                Selected File:
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {getFileIcon(selectedFile.type)}
                <Box sx={{ ml: 2 }}>
                  <Typography variant="body1" fontWeight="bold">
                    {selectedFile.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatFileSize(selectedFile.size)} • {selectedFile.type || 'Unknown type'}
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}
          
          <FormControl fullWidth margin="normal" required>
            <InputLabel id="doc-type-label">Document Type</InputLabel>
            <Select
              labelId="doc-type-label"
              value={docType}
              label="Document Type *"
              onChange={(e) => setDocType(e.target.value)}
            >
              {documentCategories.map((category) => (
                <MenuItem key={category} value={category}>
                  {category}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <FormControl fullWidth margin="normal">
            <InputLabel id="doc-source-label">Document Source</InputLabel>
            <Select
              labelId="doc-source-label"
              value={docSource}
              label="Document Source"
              onChange={(e) => setDocSource(e.target.value)}
            >
              {documentSources.map((source) => (
                <MenuItem key={source} value={source}>
                  {source}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          {uploadProgress > 0 && (
            <Box sx={{ width: '100%', mt: 2 }}>
              <LinearProgress variant="determinate" value={uploadProgress} />
              <Typography variant="caption" align="center" display="block" sx={{ mt: 1 }}>
                {uploadProgress < 100 ? 'Uploading...' : 'Upload Complete!'}
              </Typography>
            </Box>
          )}
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleDialogClose}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            onClick={handleUploadSubmit}
            disabled={!selectedFile || !docType || uploadProgress > 0}
          >
            Upload Document
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

/**
 * Document Card component
 */
const DocumentCard: React.FC<{
  document: Document;
  onView: (doc: Document) => void;
  onDelete: (id: string) => void;
}> = ({ document, onView, onDelete }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    event.stopPropagation();
  };
  
  const handleClose = () => {
    setAnchorEl(null);
  };
  
  const handleView = () => {
    handleClose();
    onView(document);
  };
  
  const handleDelete = () => {
    handleClose();
    onDelete(document.id);
  };
  
  return (
    <Card 
      sx={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        borderRadius: 2,
        transition: 'transform 0.2s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 3
        },
        cursor: 'pointer'
      }}
      onClick={handleView}
    >
      <CardContent sx={{ flexGrow: 1, pb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          {getFileIcon(document.mime_type)}
        </Box>
        
        <Typography variant="subtitle1" fontWeight="medium" noWrap title={document.file_name}>
          {document.file_name}
        </Typography>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
          <Chip 
            label={document.document_type} 
            size="small" 
            color="primary" 
            variant="outlined"
          />
          <Typography variant="caption" color="text.secondary">
            {formatFileSize(document.file_size)}
          </Typography>
        </Box>
      </CardContent>
      
      <Divider />
      
      <CardActions sx={{ justifyContent: 'space-between', px: 2, py: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {new Date(document.created_at).toLocaleDateString()}
        </Typography>
        
        <Box>
          <Tooltip title="View">
            <IconButton size="small" onClick={handleView}>
              <ViewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="More Options">
            <IconButton
              size="small"
              onClick={handleClick}
              aria-controls={open ? 'document-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={open ? 'true' : undefined}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        
        <Menu
          id="document-menu"
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          onClick={(e) => e.stopPropagation()}
          PaperProps={{
            elevation: 0,
            sx: {
              overflow: 'visible',
              filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.15))',
              mt: 1.5,
            },
          }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <MenuItem onClick={handleView}>
            <ListItemIcon>
              <ViewIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>View</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleClose}>
            <ListItemIcon>
              <DownloadIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Download</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleClose}>
            <ListItemIcon>
              <ShareIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Share</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem onClick={handleDelete}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ color: 'error' }}>
              Delete
            </ListItemText>
          </MenuItem>
        </Menu>
      </CardActions>
    </Card>
  );
};

/**
      </DialogContent>
    </Dialog>
  );
};

/**
 * DocumentsTab component - manages document upload, display, and preview
 */
export const DocumentsTab: React.FC<DocumentsTabProps> = ({ loanId }) => {
  const theme = useTheme();
  const [isUploading, setIsUploading] = useState(false);
  const [viewDocument, setViewDocument] = useState<Document | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterTab, setFilterTab] = useState(0);
  const { data: userData } = useGetIdentity<{ id: string; full_name: string }>();

  // Fetch documents for this loan
  const { data, isLoading, refetch } = useList({
    resource: "loan_documents",
    filters: [
      {
        field: "loan_id",
        operator: "eq",
        value: loanId,
      },
    ],
    sorters: [
      {
        field: "created_at",
        order: "desc",
      },
    ],
    pagination: {
      current: 1,
      pageSize: 100,
    },
    queryOptions: {
      enabled: !!loanId,
    },
  });

  const documents = data?.data as Document[] || [];

  // Document upload handler
  const { mutate: create } = useCreate();
  
  const handleUpload = (file: File, metadata: any) => {
    // In a real application, you would use a form data upload to a server
    // and then create the document record with the returned file path
    
    // Simulate API call
    setTimeout(() => {
      setIsUploading(true);
      if (!userData?.id) {
        console.error("User ID not available, cannot upload document.");
        setIsUploading(false);
        // Optionally, show a user-facing error message
        return;
      }
      create({
        resource: "loan_documents",
        values: {
          loan_id: loanId,
          document_type: metadata.document_type,
          source: metadata.source,
          file_name: file.name,
          file_path: URL.createObjectURL(file), // In real app, this would be a server path
          file_size: file.size,
          mime_type: file.type,
          uploaded_by: userData.id,
        },
      }, {
        onSuccess: () => {
          setIsUploading(false);
          refetch();
        },
        onError: () => {
          setIsUploading(false);
        },
      });
    }, 1000);
  };

  // Document deletion handler
  const { mutate: deleteDocument } = useDelete();
  
  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this document?')) {
      deleteDocument({
        resource: "loan_documents",
        id,
      }, {
        onSuccess: () => {
          refetch();
        },
      });
    }
  };

  // Document view handler
  const handleViewDocument = (doc: Document) => {
    setViewDocument(doc);
    setDialogOpen(true);
  };

  // Handle filter tab change
  const handleFilterChange = (event: React.SyntheticEvent, newValue: number) => {
    setFilterTab(newValue);
  };

  // Filter documents based on selected tab
  const getFilteredDocuments = () => {
    if (filterTab === 0) return documents; // All documents
    
    const categories = ['Note', 'Deed', 'Mortgage', 'Insurance', 'Pay History'];
    return documents.filter(doc => doc.document_type === categories[filterTab - 1]);
  };

  // If data is loading, show loading indicator
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Document uploader */}
      <DocumentUploader onUpload={handleUpload} isUploading={isUploading} />

      {/* Filter tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 4, mb: 2 }}>
        <Tabs
          value={filterTab}
          onChange={handleFilterChange}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="All Documents" />
          <Tab label="Notes" />
          <Tab label="Deeds" />
          <Tab label="Mortgages" />
          <Tab label="Insurance" />
          <Tab label="Pay History" />
        </Tabs>
      </Box>

      {/* Search and filter bar */}
      <Box sx={{ display: 'flex', mb: 3 }}>
        <TextField
          placeholder="Search documents..."
          size="small"
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
          }}
          sx={{ flexGrow: 1, mr: 2 }}
        />
        
        <Button
          startIcon={<FilterIcon />}
          variant="outlined"
        >
          Filters
        </Button>
      </Box>

      {/* Document grid */}
      {getFilteredDocuments().length > 0 ? (
        <Grid container spacing={2}>
          {getFilteredDocuments().map((doc) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={doc.id}>
              <DocumentCard 
                document={doc}
                onView={handleViewDocument}
                onDelete={handleDelete}
              />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Box sx={{ 
          p: 4, 
          textAlign: 'center', 
          bgcolor: alpha(theme.palette.primary.light, 0.05),
          borderRadius: 2
        }}>
          <DescriptionIcon sx={{ fontSize: 60, color: 'text.secondary', opacity: 0.3, mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No documents found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Upload documents to see them here
          </Typography>
        </Box>
      )}

      {/* Document Viewer Dialog */}
      <DocumentViewerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        doc={viewDocument}
      />
    </Box>
  );
};

export default DocumentsTab;