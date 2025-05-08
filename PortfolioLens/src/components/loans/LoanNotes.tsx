import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Avatar,
  Divider,
  IconButton,
  Chip,
  Menu,
  MenuItem,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Tooltip,
  Card,
  CardContent,
  Collapse,
  Alert,
  InputAdornment,
  useTheme,
  alpha
} from '@mui/material';
import {
  Send as SendIcon,
  MoreVert as MoreVertIcon,
  Reply as ReplyIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircleOutline as ResolvedIcon,
  AttachFile as AttachmentIcon,
  Report as InternalIcon,
  Check as CheckIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { formatDate } from '../../utility/formatters';
import { LoanNote, loanNotesService } from '../../services/loanNotesService';

interface LoanNotesProps {
  loanId: string;
  currentUserId?: string;
  currentUserName: string;
  currentUserAvatar?: string;
  userRole?: string;
  isInternalUser: boolean;
}

/**
 * LoanNotes Component - Provides a threaded notes/comment system for loan collaboration
 */
export const LoanNotes: React.FC<LoanNotesProps> = ({
  loanId,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  userRole,
  isInternalUser
}) => {
  const theme = useTheme();
  const [notes, setNotes] = useState<LoanNote[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [newNoteContent, setNewNoteContent] = useState<string>('');
  const [replyTo, setReplyTo] = useState<LoanNote | null>(null);
  const [isInternalOnly, setIsInternalOnly] = useState<boolean>(false);
  const [editingNote, setEditingNote] = useState<LoanNote | null>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedNote, setSelectedNote] = useState<LoanNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noteListRef = useRef<HTMLDivElement>(null);
  const lastPolledRef = useRef<Date>(new Date());
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Fetch notes on initial load
  useEffect(() => {
    fetchNotes();
    
    // Set up polling for real-time updates
    pollingIntervalRef.current = setInterval(() => {
      pollForNewNotes();
    }, 10000); // Poll every 10 seconds
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [loanId]);
  
  // Fetch all notes for this loan
  const fetchNotes = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await loanNotesService.getNotesByLoanId(loanId);
      
      if (error) {
        console.error("Error fetching notes:", error);
        setError("Failed to load notes. Please try again.");
      } else {
        setNotes(data || []);
        setError(null);
      }
    } catch (err) {
      console.error("Exception in fetchNotes:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Poll for new notes in real-time
  const pollForNewNotes = async () => {
    try {
      const { data, error } = await loanNotesService.getNotesByLoanId(loanId);
      
      if (!error && data) {
        // Check if we have new or updated notes
        const lastPolledTime = lastPolledRef.current.getTime();
        const hasNewContent = data.some(note => 
          new Date(note.created_at).getTime() > lastPolledTime || 
          new Date(note.updated_at).getTime() > lastPolledTime
        );
        
        if (hasNewContent) {
          // Update notes state with new data
          setNotes(data);
          // Update last polled time
          lastPolledRef.current = new Date();
        }
      }
    } catch (err) {
      console.error("Error polling for new notes:", err);
      // Don't show error for polling failures
    }
  };
  
  // Handle creating a new note
  const handleCreateNote = async () => {
    if (!newNoteContent.trim()) {
      setError("Note content cannot be empty.");
      return;
    }

    if (!currentUserId) {
      setError("User information is missing. Cannot create note. Please refresh the page or log in again.");
      console.error("User ID is missing, cannot create note.");
      return;
    }
    
    setIsLoading(true);
    try {
      // Import user validation service dynamically to avoid circular dependencies
      const userValidationService = (await import('../../services/userValidationService')).default;
      
      // Process and validate the user ID
      const validatedUserId = await userValidationService.processUserId(currentUserId);
      
      if (!validatedUserId) {
        setError("Your user account is not properly set up in the system. Please contact an administrator.");
        console.error("User ID validation failed:", currentUserId);
        setIsLoading(false);
        return;
      }
      
      const noteData: Partial<LoanNote> = {
        loan_id: loanId,
        user_id: validatedUserId,
        content: newNoteContent.trim(),
        is_internal_only: isInternalOnly,
        parent_note_id: replyTo ? replyTo.id : null,
        mention_user_ids: [],
        is_resolved: false
      };
      
      const { data, error } = await loanNotesService.createNote(noteData);
      
      if (error) {
        console.error("Error creating note:", error);
        
        // Provide more specific error message for foreign key violations
        if (error.message?.includes('foreign key constraint') || 
            error.details?.includes('Key is not present in table "users"')) {
          setError("Your user account could not be found in the system. Please contact an administrator.");
        } else {
          setError("Failed to create note. Please try again.");
        }
      } else {
        // Clear form
        setNewNoteContent('');
        setIsInternalOnly(false);
        setReplyTo(null);
        setError(null); // Clear any existing errors
        
        // Refresh notes to include the new one
        await fetchNotes();
        
        // Scroll to bottom after a short delay to allow rendering
        setTimeout(() => {
          if (noteListRef.current) {
            noteListRef.current.scrollTop = noteListRef.current.scrollHeight;
          }
        }, 100);
      }
    } catch (err) {
      console.error("Exception in handleCreateNote:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle updating a note
  const handleUpdateNote = async () => {
    if (!editingNote || !newNoteContent.trim()) {
      setError("Note content cannot be empty.");
      return;
    }
    
    if (!currentUserId) {
      setError("User information is missing. Cannot update note. Please refresh the page or log in again.");
      console.error("User ID is missing, cannot update note.");
      return;
    }
    
    // Verify that the current user owns the note
    if (editingNote.user_id !== currentUserId) {
      setError("You can only edit your own notes.");
      return;
    }
    
    setIsLoading(true);
    try {
      const { data, error } = await loanNotesService.updateNote(editingNote.id, {
        content: newNoteContent.trim(),
        is_internal_only: isInternalOnly
      });
      
      if (error) {
        console.error("Error updating note:", error);
        
        // Provide more specific error message for foreign key violations
        if (error.message?.includes('foreign key constraint') || 
            error.details?.includes('Key is not present in table "users"')) {
          setError("Your user account could not be found in the system. Please contact an administrator.");
        } else {
          setError("Failed to update note. Please try again.");
        }
      } else {
        // Clear editing state
        setEditingNote(null);
        setNewNoteContent('');
        setIsInternalOnly(false);
        setError(null); // Clear any existing errors
        
        // Refresh notes
        await fetchNotes();
      }
    } catch (err) {
      console.error("Exception in handleUpdateNote:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle deleting a note
  const handleDeleteNote = async () => {
    if (!selectedNote) return;
    
    setIsLoading(true);
    try {
      const { success, error } = await loanNotesService.deleteNote(selectedNote.id);
      
      if (error || !success) {
        console.error("Error deleting note:", error);
        setError("Failed to delete note. Please try again.");
      } else {
        // Close menu and clear selection
        handleCloseMenu();
        
        // Refresh notes
        await fetchNotes();
      }
    } catch (err) {
      console.error("Exception in handleDeleteNote:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle marking a note as resolved/unresolved
  const handleToggleResolved = async () => {
    if (!selectedNote) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await loanNotesService.updateNote(selectedNote.id, {
        is_resolved: !selectedNote.is_resolved
      });
      
      if (error) {
        console.error("Error updating note resolved status:", error);
        setError("Failed to update note status. Please try again.");
      } else {
        // Close menu and clear selection
        handleCloseMenu();
        
        // Refresh notes
        await fetchNotes();
      }
    } catch (err) {
      console.error("Exception in handleToggleResolved:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Open note context menu
  const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>, note: LoanNote) => {
    setMenuAnchorEl(event.currentTarget);
    setSelectedNote(note);
  };
  
  // Close note context menu
  const handleCloseMenu = () => {
    setMenuAnchorEl(null);
    setSelectedNote(null);
  };
  
  // Start editing a note
  const handleStartEditing = () => {
    if (!selectedNote) return;
    
    setEditingNote(selectedNote);
    setNewNoteContent(selectedNote.content);
    setIsInternalOnly(selectedNote.is_internal_only);
    handleCloseMenu();
  };
  
  // Cancel editing a note
  const handleCancelEditing = () => {
    setEditingNote(null);
    setNewNoteContent('');
    setIsInternalOnly(false);
  };
  
  // Start replying to a note
  const handleReply = (note: LoanNote) => {
    setReplyTo(note);
    // Focus the input field
    setTimeout(() => {
      const inputElement = document.getElementById('new-note-input');
      if (inputElement) {
        inputElement.focus();
      }
    }, 100);
  };
  
  // Cancel replying to a note
  const handleCancelReply = () => {
    setReplyTo(null);
  };
  
  // Generate initials from user name for avatar
  const getInitials = (name: string) => {
    if (!name) return '?';
    
    const nameParts = name.split(' ');
    if (nameParts.length === 1) return nameParts[0].substring(0, 2).toUpperCase();
    
    return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
  };
  
  // Render a single note
  const renderNote = (note: LoanNote, isReply = false) => {
    const isCurrentUserNote = note.user_id === currentUserId;
    
    return (
      <Card 
        key={note.id} 
        sx={{ 
          mb: 2, 
          ml: isReply ? 4 : 0,
          borderLeft: note.is_internal_only ? `4px solid ${theme.palette.warning.main}` : 'none',
          opacity: note.is_resolved ? 0.75 : 1,
          backgroundColor: isCurrentUserNote ? alpha(theme.palette.primary.main, 0.03) : 'background.paper',
        }}
        elevation={1}
      >
        <CardContent sx={{ pb: 1 }}>
          {/* Note Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              {note.user_avatar ? (
                <Avatar 
                  src={note.user_avatar} 
                  alt={note.user_name || 'User'} 
                  sx={{ width: 32, height: 32, mr: 1 }}
                />
              ) : (
                <Avatar 
                  sx={{ 
                    width: 32, 
                    height: 32, 
                    mr: 1, 
                    bgcolor: isCurrentUserNote ? 'primary.main' : 'secondary.main' 
                  }}
                >
                  {getInitials(note.user_name || '')}
                </Avatar>
              )}
              
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
                  {note.user_name || 'Unknown User'}
                  {note.is_internal_only && (
                    <Tooltip title="Internal note - only visible to internal users">
                      <InternalIcon 
                        fontSize="small" 
                        color="warning" 
                        sx={{ ml: 1, verticalAlign: 'text-bottom' }}
                      />
                    </Tooltip>
                  )}
                  {note.is_resolved && (
                    <Tooltip title="Resolved">
                      <ResolvedIcon 
                        fontSize="small" 
                        color="success" 
                        sx={{ ml: 1, verticalAlign: 'text-bottom' }}
                      />
                    </Tooltip>
                  )}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(note.created_at)}
                  {note.updated_at !== note.created_at && ' (edited)'}
                </Typography>
              </Box>
            </Box>
            
            {/* Note Actions */}
            <Box>
              <IconButton 
                size="small" 
                onClick={(e) => handleOpenMenu(e, note)}
                aria-label="note options"
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
          
          {/* Note Content */}
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', ml: 5 }}>
            {note.content}
          </Typography>
          
          {/* Note Actions */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
            <Button
              startIcon={<ReplyIcon />}
              size="small"
              onClick={() => handleReply(note)}
            >
              Reply
            </Button>
          </Box>
        </CardContent>
        
        {/* Replies */}
        {note.replies && note.replies.length > 0 && (
          <Box sx={{ pl: 2, pr: 2, pb: 2 }}>
            <Divider sx={{ mb: 2 }} />
            {note.replies.map(reply => renderNote(reply, true))}
          </Box>
        )}
      </Card>
    );
  };
  
  return (
    <Paper sx={{ p: 3, mb: 3, borderRadius: 2, height: '100%' }} elevation={2}>
      {/* Notes Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" fontWeight="medium">
          Loan Notes & Collaboration
        </Typography>
      </Box>
      
      {/* Error Alert */}
      <Collapse in={!!error}>
        <Alert 
          severity="error" 
          sx={{ mb: 2 }}
          action={
            <IconButton
              aria-label="close"
              color="inherit"
              size="small"
              onClick={() => setError(null)}
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          }
        >
          {error}
        </Alert>
      </Collapse>
      
      {/* Notes List */}
      <Box 
        ref={noteListRef}
        sx={{ 
          height: '400px', 
          overflowY: 'auto',
          mb: 2,
          p: 1
        }}
      >
        {isLoading && notes.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : notes.length === 0 ? (
          <Box sx={{ textAlign: 'center', p: 4 }}>
            <Typography variant="body1" color="text.secondary">
              No notes yet. Be the first to add a note!
            </Typography>
          </Box>
        ) : (
          notes.map(note => renderNote(note))
        )}
      </Box>
      
      {/* Notes Input */}
      <Box sx={{ mb: 2 }}>
        {replyTo && (
          <Box 
            sx={{ 
              p: 1, 
              mb: 1, 
              bgcolor: alpha(theme.palette.primary.main, 0.05),
              borderRadius: 1,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <Typography variant="body2">
              Replying to: <span style={{ fontWeight: 'bold' }}>{replyTo.user_name}</span>
            </Typography>
            <IconButton size="small" onClick={handleCancelReply}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
        
        {editingNote && (
          <Box 
            sx={{ 
              p: 1, 
              mb: 1, 
              bgcolor: alpha(theme.palette.warning.main, 0.05),
              borderRadius: 1,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <Typography variant="body2">
              Editing note
            </Typography>
            <IconButton size="small" onClick={handleCancelEditing}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
        
        <TextField
          id="new-note-input"
          fullWidth
          multiline
          rows={3}
          placeholder={editingNote ? "Edit your note..." : replyTo ? "Write your reply..." : "Add a note..."}
          value={newNoteContent}
          onChange={(e) => setNewNoteContent(e.target.value)}
          disabled={isLoading}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  color="primary"
                  size="small"
                  sx={{ mt: 'auto', mb: 1 }}
                  disabled={isLoading || !newNoteContent.trim() || !currentUserId}
                  onClick={editingNote ? handleUpdateNote : handleCreateNote}
                >
                  {isLoading ? <CircularProgress size={20} /> : editingNote ? <CheckIcon /> : <SendIcon />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        
        {/* Note Controls */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={isInternalOnly}
                onChange={(e) => setIsInternalOnly(e.target.checked)}
                disabled={!isInternalUser || isLoading}
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="body2">Internal only</Typography>
                <InternalIcon 
                  fontSize="small" 
                  color="warning" 
                  sx={{ ml: 0.5 }}
                />
              </Box>
            }
          />
          
          <Box>
            <Button
              variant="outlined"
              startIcon={<AttachmentIcon />}
              size="small"
              disabled={isLoading}
              sx={{ mr: 1 }}
            >
              Attach
            </Button>
            <Button
              variant="contained"
              disableElevation
              onClick={editingNote ? handleUpdateNote : handleCreateNote}
              disabled={isLoading || !newNoteContent.trim() || !currentUserId}
            >
              {editingNote ? 'Update' : 'Post Note'}
            </Button>
          </Box>
        </Box>
      </Box>
      
      {/* Note Context Menu */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleCloseMenu}
      >
        {selectedNote && selectedNote.user_id === currentUserId && (
          <MenuItem onClick={handleStartEditing}>
            <EditIcon fontSize="small" sx={{ mr: 1 }} />
            Edit Note
          </MenuItem>
        )}
        <MenuItem onClick={handleToggleResolved}>
          <ResolvedIcon fontSize="small" sx={{ mr: 1 }} />
          {selectedNote?.is_resolved ? 'Mark as Unresolved' : 'Mark as Resolved'}
        </MenuItem>
        {selectedNote && selectedNote.user_id === currentUserId && (
          <MenuItem onClick={handleDeleteNote}>
            <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
            Delete Note
          </MenuItem>
        )}
      </Menu>
    </Paper>
  );
};

export default LoanNotes;