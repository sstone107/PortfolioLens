import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { CloudUpload as Upload, Description as FileSpreadsheet, CheckCircle } from '@mui/icons-material';
import { Button } from '@mui/material';
import { importManager } from '../../services/importManagerService';
import { useNotification } from '@refinedev/core';

interface SeamlessImportUploaderProps {
  templateId?: string;
  onImportStarted?: (jobId: string) => void;
  compact?: boolean;
}

export const SeamlessImportUploader: React.FC<SeamlessImportUploaderProps> = ({
  templateId,
  onImportStarted,
  compact = false
}) => {
  const navigate = useNavigate();
  const { open } = useNotification();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleFileDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    
    // Validate file type
    const validTypes = ['.xlsx', '.xls', '.csv'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!validTypes.includes(fileExtension)) {
      open?.({ type: 'error', message: 'Please upload an Excel (.xlsx, .xls) or CSV file' });
      return;
    }

    // Validate file size (max 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      open?.({ type: 'error', message: 'File size must be less than 100MB' });
      return;
    }

    setIsUploading(true);

    try {
      // Start import in background
      const jobId = await importManager.startImport(file, templateId);
      
      // Show success feedback
      setUploadSuccess(true);
      open?.({ 
        type: 'success', 
        message: `Import started for ${file.name}!`,
        description: 'Processing in background...'
      });

      // Notify parent if callback provided
      if (onImportStarted) {
        onImportStarted(jobId);
      }

      // Reset success state after animation
      setTimeout(() => {
        setUploadSuccess(false);
      }, 2000);

      // Navigate to status page after a short delay
      setTimeout(() => {
        navigate(`/import/status/${jobId}`);
      }, 1500);

    } catch (error) {
      console.error('Import error:', error);
      open?.({ 
        type: 'error', 
        message: 'Failed to start import',
        description: error instanceof Error ? error.message : 'Unknown error' 
      });
    } finally {
      setIsUploading(false);
    }
  }, [templateId, navigate, onImportStarted, open]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    },
    maxFiles: 1,
    disabled: isUploading
  });

  if (compact) {
    return (
      <Button
        variant="contained"
        color="primary"
        component="label"
        disabled={isUploading}
        startIcon={isUploading ? null : <Upload />}
      >
        <input {...getInputProps()} />
        {isUploading ? 'Starting Import...' : 'Import File'}
      </Button>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-lg p-8
        transition-all duration-300 cursor-pointer
        ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
        ${uploadSuccess ? 'border-green-500 bg-green-50' : ''}
      `}
    >
      <input {...getInputProps()} />
      
      <div className="flex flex-col items-center justify-center space-y-4">
        {uploadSuccess ? (
          <>
            <CheckCircle className="w-16 h-16 text-green-500 animate-bounce" />
            <div className="text-center">
              <p className="text-lg font-semibold text-green-700">Import Started!</p>
              <p className="text-sm text-green-600 mt-1">Redirecting to status page...</p>
            </div>
          </>
        ) : isUploading ? (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500"></div>
            <p className="text-lg font-semibold text-gray-700">Starting import...</p>
          </>
        ) : (
          <>
            <FileSpreadsheet className="w-16 h-16 text-gray-400" />
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-700">
                {isDragActive ? 'Drop your file here' : 'Drag & drop your file here'}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                or click to browse
              </p>
              <p className="text-xs text-gray-400 mt-4">
                Supports Excel (.xlsx, .xls) and CSV files up to 100MB
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};