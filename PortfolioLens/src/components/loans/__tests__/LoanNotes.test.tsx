import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { LoanNotes } from '../LoanNotes';
import { loanNotesService } from '../../../services/loanNotesService';

// Mock the loan notes service
jest.mock('../../../services/loanNotesService', () => ({
  loanNotesService: {
    getNotesByLoanId: jest.fn(),
    createNote: jest.fn(),
    updateNote: jest.fn(),
    deleteNote: jest.fn(),
    generateMockNotes: jest.fn(),
  },
}));

describe('LoanNotes', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock notes data
    const mockNotes = [
      {
        id: 'note-1',
        loan_id: 'loan-1',
        user_id: 'user-1',
        parent_note_id: null,
        content: 'This is a test note',
        is_internal_only: false,
        mention_user_ids: [],
        is_resolved: false,
        created_at: '2023-05-01T12:00:00Z',
        updated_at: '2023-05-01T12:00:00Z',
        user_name: 'Test User',
        user_avatar: null,
        replies: [
          {
            id: 'note-2',
            loan_id: 'loan-1',
            user_id: 'user-2',
            parent_note_id: 'note-1',
            content: 'This is a reply',
            is_internal_only: false,
            mention_user_ids: [],
            is_resolved: false,
            created_at: '2023-05-01T12:30:00Z',
            updated_at: '2023-05-01T12:30:00Z',
            user_name: 'Another User',
            user_avatar: null,
            replies: [],
          },
        ],
      },
      {
        id: 'note-3',
        loan_id: 'loan-1',
        user_id: 'user-1',
        parent_note_id: null,
        content: 'This is an internal note',
        is_internal_only: true,
        mention_user_ids: [],
        is_resolved: false,
        created_at: '2023-05-02T12:00:00Z',
        updated_at: '2023-05-02T12:00:00Z',
        user_name: 'Test User',
        user_avatar: null,
        replies: [],
      },
    ];
    
    // Mock service responses
    (loanNotesService.getNotesByLoanId as jest.Mock).mockResolvedValue({
      data: mockNotes,
      error: null,
    });
    
    (loanNotesService.createNote as jest.Mock).mockResolvedValue({
      data: {
        id: 'new-note',
        loan_id: 'loan-1',
        user_id: 'user-1',
        parent_note_id: null,
        content: 'New note content',
        is_internal_only: false,
        mention_user_ids: [],
        is_resolved: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_name: 'Test User',
        user_avatar: null,
      },
      error: null,
    });
  });

  test('renders notes with correct data', async () => {
    render(
      <LoanNotes
        loanId="loan-1"
        currentUserId="user-1"
        currentUserName="Test User"
        userRole="Admin"
        isInternalUser={true}
      />
    );
    
    // Wait for notes to load
    await waitFor(() => {
      expect(screen.getByText('This is a test note')).toBeInTheDocument();
      expect(screen.getByText('This is a reply')).toBeInTheDocument();
      expect(screen.getByText('This is an internal note')).toBeInTheDocument();
    });
    
    // Check for internal note indicator
    const internalIcons = screen.getAllByTitle('Internal note - only visible to internal users');
    expect(internalIcons.length).toBe(1);
  });

  test('creates new note when form is submitted', async () => {
    render(
      <LoanNotes
        loanId="loan-1"
        currentUserId="user-1"
        currentUserName="Test User"
        userRole="Admin"
        isInternalUser={true}
      />
    );
    
    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a note...')).toBeInTheDocument();
    });
    
    // Enter new note content
    fireEvent.change(screen.getByPlaceholderText('Add a note...'), {
      target: { value: 'New note content' },
    });
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /post note/i }));
    
    // Check if createNote was called with correct data
    await waitFor(() => {
      expect(loanNotesService.createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: 'loan-1',
          user_id: 'user-1',
          content: 'New note content',
          is_internal_only: false,
        })
      );
    });
  });

  test('adds internal only flag when checkbox is checked', async () => {
    render(
      <LoanNotes
        loanId="loan-1"
        currentUserId="user-1"
        currentUserName="Test User"
        userRole="Admin"
        isInternalUser={true}
      />
    );
    
    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add a note...')).toBeInTheDocument();
    });
    
    // Enter new note content
    fireEvent.change(screen.getByPlaceholderText('Add a note...'), {
      target: { value: 'New internal note' },
    });
    
    // Check the internal only checkbox
    fireEvent.click(screen.getByLabelText(/internal only/i));
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /post note/i }));
    
    // Check if createNote was called with correct data
    await waitFor(() => {
      expect(loanNotesService.createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: 'loan-1',
          user_id: 'user-1',
          content: 'New internal note',
          is_internal_only: true,
        })
      );
    });
  });

  test('initiates reply when reply button is clicked', async () => {
    render(
      <LoanNotes
        loanId="loan-1"
        currentUserId="user-1"
        currentUserName="Test User"
        userRole="Admin"
        isInternalUser={true}
      />
    );
    
    // Wait for notes to load
    await waitFor(() => {
      expect(screen.getByText('This is a test note')).toBeInTheDocument();
    });
    
    // Click reply button on the first note
    const replyButtons = screen.getAllByRole('button', { name: /reply/i });
    fireEvent.click(replyButtons[0]);
    
    // Check if we're in reply mode
    await waitFor(() => {
      expect(screen.getByText(/replying to:/i)).toBeInTheDocument();
    });
    
    // Enter reply content
    fireEvent.change(screen.getByPlaceholderText('Write your reply...'), {
      target: { value: 'This is my reply' },
    });
    
    // Submit the reply
    fireEvent.click(screen.getByRole('button', { name: /post note/i }));
    
    // Check if createNote was called with correct parent_note_id
    await waitFor(() => {
      expect(loanNotesService.createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          loan_id: 'loan-1',
          user_id: 'user-1',
          content: 'This is my reply',
          parent_note_id: 'note-1',
        })
      );
    });
  });
});