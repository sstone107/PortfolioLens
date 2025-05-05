import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Checkbox,
  Divider,
  Chip,
  Paper,
  IconButton,
  Tooltip,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Close as CloseIcon, Check as CheckIcon } from '@mui/icons-material';
import { SchemaProposal, NewTableProposal, NewColumnProposal } from './types';

interface SchemaProposalReviewModalProps {
  open: boolean;
  onClose: () => void;
  proposals: SchemaProposal[];
  onSave: (approvedProposals: SchemaProposal[]) => void; // Pass back approved proposals
}

// Helper to determine proposal type
const isNewTable = (proposal: SchemaProposal): proposal is NewTableProposal => {
  return 'columns' in proposal;
};

export const SchemaProposalReviewModal: React.FC<SchemaProposalReviewModalProps> = ({
  open,
  onClose,
  proposals = [], // Default to empty array
  onSave,
}) => {
  const [approvedIndices, setApprovedIndices] = useState<Set<number>>(
    // Initially approve all proposals by default
    new Set(proposals.map((_, index) => index))
  );

  const handleToggleApproval = (index: number) => {
    setApprovedIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleSelectAll = (selectAll: boolean) => {
    if (selectAll) {
      setApprovedIndices(new Set(proposals.map((_, index) => index)));
    } else {
      setApprovedIndices(new Set());
    }
  };

  const handleConfirm = () => {
    const approved = proposals.filter((_, index) => approvedIndices.has(index));
    onSave(approved);
    onClose();
  };

  const allSelected = approvedIndices.size === proposals.length;
  const someSelected = approvedIndices.size > 0 && !allSelected;

  // Generate user-friendly descriptions or SQL previews
  const getProposalDescription = (proposal: SchemaProposal): React.ReactNode => {
    if (isNewTable(proposal)) {
      return (
        <>
          <Typography variant="body1" component="span" sx={{ fontWeight: 'bold' }}>
            CREATE TABLE {proposal.tableName}
          </Typography>
          <Typography variant="body2" color="text.secondary" component="span" sx={{ ml: 1 }}>
            (from sheet: {proposal.sourceSheet})
          </Typography>
          <List dense disablePadding sx={{ pl: 2, fontSize: '0.9em' }}>
            {proposal.columns.map((col, i) => (
              <ListItem key={i} disableGutters sx={{ py: 0 }}>
                <ListItemText primary={`${col.columnName} ${col.sqlType}${col.isNullable ? '' : ' NOT NULL'}`} />
              </ListItem>
            ))}
          </List>
        </>
      );
    } else { // NewColumnProposal
      return (
        <>
          <Typography variant="body1" component="span" sx={{ fontWeight: 'bold' }}>
            ALTER TABLE {proposal.sourceSheet || 'Unknown'} ADD COLUMN {proposal.columnName} {proposal.sqlType}
          </Typography>
           <Typography variant="body2" color="text.secondary" component="span" sx={{ ml: 1 }}>
            (from column: {proposal.sourceHeader || 'Unknown'})
          </Typography>
        </>
      );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
           Review Proposed Schema Changes ({proposals.length})
           <Tooltip title={allSelected ? "Deselect All" : "Select All"}>
                <span>
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    disabled={proposals.length === 0}
                  />
                </span>
            </Tooltip>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {proposals.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ p: 3 }}>
            No schema changes proposed.
          </Typography>
        ) : (
          <List disablePadding>
            {proposals.map((proposal, index) => (
              <React.Fragment key={index}>
                <ListItem
                  secondaryAction={
                    <Checkbox
                      edge="end"
                      onChange={() => handleToggleApproval(index)}
                      checked={approvedIndices.has(index)}
                    />
                  }
                  disablePadding
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    {isNewTable(proposal) ? <AddIcon color="success" /> : <EditIcon color="info" />}
                  </ListItemIcon>
                  <ListItemText
                    primary={getProposalDescription(proposal)}
                    sx={{ mr: 4 }} // Add margin to avoid overlap with checkbox
                  />
                </ListItem>
                {index < proposals.length - 1 && <Divider component="li" />}
              </React.Fragment>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} startIcon={<CloseIcon />}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="primary"
          startIcon={<CheckIcon />}
          disabled={proposals.length === 0} // Disable if no proposals
        >
          Confirm {approvedIndices.size > 0 ? `(${approvedIndices.size})` : ''} Approved Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
};