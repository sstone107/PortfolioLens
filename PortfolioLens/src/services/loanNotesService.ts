import { supabaseClient } from "../utility/supabaseClient";

export interface LoanNote {
  id: string;
  loan_id: string;
  user_id: string;
  parent_note_id: string | null;
  content: string;
  is_internal_only: boolean;
  mention_user_ids: string[];
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
  // Include joined fields from users table
  user_name?: string;
  user_avatar?: string;
  // Include children notes for threading
  replies?: LoanNote[];
}

export interface LoanNoteAttachment {
  id: string;
  note_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
}

/**
 * Service for managing loan notes (comments) for collaboration features
 */
export const loanNotesService = {
  /**
   * Get all notes for a loan
   * @param loanId The loan ID to fetch notes for
   * @returns Array of note records associated with the loan
   */
  getNotesByLoanId: async (loanId: string) => {
    try {
      if (!loanId) {
        return { data: [], error: new Error('Loan ID is required') };
      }

      // First, get the loan notes without any joins
      const { data: notesData, error: notesError } = await supabaseClient
        .from('loan_notes')
        .select('*')
        .eq('loan_id', loanId)
        .order('created_at', { ascending: false });

      if (notesError) {
        console.error("Error fetching loan notes:", notesError);
        return { data: [], error: notesError };
      }

      if (!notesData || notesData.length === 0) {
        console.log(`No notes found for loan ID: ${loanId}`);
        return { data: [], error: null };
      }

      // Get all unique user IDs from the notes
      const userIds = [...new Set(notesData.map(note => note.user_id))];
      
      // Fetch user information separately
      let userData: Array<{id: string; full_name: string; avatar_url: string | null}> = [];
      if (userIds.length > 0) {
        const { data: users, error: usersError } = await supabaseClient
          .from('users')
          .select('id, full_name, avatar_url')
          .in('id', userIds);

        if (usersError) {
          console.error("Error fetching user details:", usersError);
          // Continue without user data rather than failing completely
        } else {
          userData = users || [];
        }
      }

      // Create a map of user_id to user details for quicker lookups
      const userMap: Record<string, {id: string; full_name: string; avatar_url: string | null}> = {};
      userData.forEach(user => {
        userMap[user.id] = {
          id: user.id,
          full_name: user.full_name,
          avatar_url: user.avatar_url
        };
      });

      // Get all note IDs to fetch attachments
      const noteIds = notesData.map(note => note.id);
      
      // Fetch attachments separately if we have notes
      let attachmentsData: Array<{note_id: string; id: string; file_name: string; file_path: string; file_size: number; mime_type: string}> = [];
      if (noteIds.length > 0) {
        const { data: attachments, error: attachmentsError } = await supabaseClient
          .from('loan_note_attachments')
          .select('*')
          .in('note_id', noteIds);

        if (attachmentsError) {
          console.error("Error fetching note attachments:", attachmentsError);
          // Continue without attachments rather than failing completely
        } else {
          attachmentsData = attachments || [];
        }
      }
      
      // Create a map of note_id to attachments for quicker lookups
      const attachmentsMap: Record<string, Array<{id: string; file_name: string; file_path: string; file_size: number; mime_type: string}>> = {};
      attachmentsData.forEach(attachment => {
        if (!attachmentsMap[attachment.note_id]) {
          attachmentsMap[attachment.note_id] = [];
        }
        attachmentsMap[attachment.note_id].push({
          id: attachment.id,
          file_name: attachment.file_name,
          file_path: attachment.file_path,
          file_size: attachment.file_size,
          mime_type: attachment.mime_type
        });
      });

      // Manually add user information and attachments to notes
      const notesWithData = notesData.map(note => ({
        ...note,
        user: note.user_id && userMap[note.user_id] ? userMap[note.user_id] : { id: note.user_id, full_name: 'Unknown User', avatar_url: null },
        attachments: attachmentsMap[note.id] || []
      }));

      // Organize notes into a threaded structure
      const threadedNotes = organizeNotesIntoThreads(notesWithData);

      return { data: threadedNotes, error: null };
    } catch (err) {
      console.error("Exception in getNotesByLoanId:", err);
      return { data: [], error: err };
    }
  },

  /**
   * Create a new note for a loan
   * @param note The note to create
   * @returns The created note
   */
  createNote: async (note: Partial<LoanNote>) => {
    try {
      // Validate required fields
      if (!note.loan_id || !note.user_id || !note.content) {
        return { 
          data: null, 
          error: new Error('loan_id, user_id, and content are required') 
        };
      }

      // Validate loan_id exists
      const { data: loanExists, error: loanError } = await supabaseClient
        .from('loans')
        .select('id')
        .eq('id', note.loan_id)
        .maybeSingle();

      if (loanError) {
        console.error("Error checking if loan exists:", loanError);
      } else if (!loanExists) {
        return {
          data: null,
          error: new Error(`Loan with ID ${note.loan_id} does not exist`)
        };
      }

      // Dynamically import the user validation service to avoid circular dependencies
      let userValidationService;
      try {
        userValidationService = (await import('../services/userValidationService')).default;
        
        // Validate user ID
        const isValidUser = await userValidationService.validateUserId(note.user_id);
        if (!isValidUser) {
          // Try to ensure the user exists
          const userCreated = await userValidationService.ensureUserExists(note.user_id);
          if (!userCreated) {
            return {
              data: null,
              error: new Error(`User with ID ${note.user_id} not found and could not be created`)
            };
          }
        }
      } catch (userErr) {
        console.error("Error importing or using userValidationService:", userErr);
        // Continue without validation as a fallback
      }

      // Insert the note
      const { data: noteData, error } = await supabaseClient
        .from('loan_notes')
        .insert([note])
        .select()
        .single();

      if (error) {
        console.error("Error creating loan note:", error);
        return { data: null, error };
      }
      
      // Fetch user information separately
      const { data: userData, error: userError } = await supabaseClient
        .from('users')
        .select('id, full_name, avatar_url')
        .eq('id', note.user_id)
        .single();
        
      if (userError) {
        console.error("Error fetching user details for note:", userError);
        // Continue without user data
      }
      
      // Combine note with user data
      const dataWithUser = {
        ...noteData,
        user: userData || { id: note.user_id, full_name: 'Unknown User', avatar_url: null }
      };

      // Process @mentions if present
      if (note.mention_user_ids && note.mention_user_ids.length > 0) {
        const mentions = note.mention_user_ids.map(userId => ({
          note_id: noteData.id,
          user_id: userId
        }));

        const { error: mentionError } = await supabaseClient
          .from('loan_note_mentions')
          .insert(mentions);

        if (mentionError) {
          console.error("Error creating mentions:", mentionError);
          // Continue despite mention error, it's not critical
        }
      }

      return { data: dataWithUser, error: null };
    } catch (err) {
      console.error("Exception in createNote:", err);
      return { data: null, error: err };
    }
  },

  /**
   * Update an existing note
   * @param noteId The ID of the note to update
   * @param updates The updates to apply
   * @returns The updated note
   */
  updateNote: async (noteId: string, updates: Partial<LoanNote>) => {
    try {
      if (!noteId) {
        return { data: null, error: new Error('Note ID is required') };
      }

      // Only allow content, is_internal_only, is_resolved to be updated
      const sanitizedUpdates = {
        content: updates.content,
        is_internal_only: updates.is_internal_only,
        is_resolved: updates.is_resolved
      };

      // Update the note
      const { data: updatedNote, error } = await supabaseClient
        .from('loan_notes')
        .update(sanitizedUpdates)
        .eq('id', noteId)
        .select()
        .single();

      if (error) {
        console.error("Error updating loan note:", error);
        return { data: null, error };
      }
      
      // Fetch user information separately
      const { data: userData, error: userError } = await supabaseClient
        .from('users')
        .select('id, full_name, avatar_url')
        .eq('id', updatedNote.user_id)
        .single();
        
      if (userError) {
        console.error("Error fetching user details for updated note:", userError);
        // Continue without user data
      }
      
      // Combine note with user data
      const dataWithUser = {
        ...updatedNote,
        user: userData || { id: updatedNote.user_id, full_name: 'Unknown User', avatar_url: null }
      };

      return { data: dataWithUser, error: null };
    } catch (err) {
      console.error("Exception in updateNote:", err);
      return { data: null, error: err };
    }
  },

  /**
   * Delete a note and its replies
   * @param noteId The ID of the note to delete
   * @returns Success status
   */
  deleteNote: async (noteId: string) => {
    try {
      if (!noteId) {
        return { success: false, error: new Error('Note ID is required') };
      }

      // Delete the note (cascades to attachments and mentions)
      const { error } = await supabaseClient
        .from('loan_notes')
        .delete()
        .eq('id', noteId);

      if (error) {
        console.error("Error deleting loan note:", error);
        return { success: false, error };
      }

      return { success: true, error: null };
    } catch (err) {
      console.error("Exception in deleteNote:", err);
      return { success: false, error: err };
    }
  },

  /**
   * Add an attachment to a note
   * @param attachment The attachment to add
   * @returns The created attachment
   */
  addAttachment: async (attachment: Partial<LoanNoteAttachment>) => {
    try {
      if (!attachment.note_id || !attachment.file_path || !attachment.file_name) {
        return { 
          data: null, 
          error: new Error('note_id, file_path, and file_name are required') 
        };
      }

      // Insert the attachment
      const { data, error } = await supabaseClient
        .from('loan_note_attachments')
        .insert([attachment])
        .select()
        .single();

      if (error) {
        console.error("Error adding attachment:", error);
        return { data: null, error };
      }

      return { data, error: null };
    } catch (err) {
      console.error("Exception in addAttachment:", err);
      return { data: null, error: err };
    }
  },

  /**
   * Generate mock notes data for testing
   * @param loanId The loan ID to generate notes for
   * @param userId The user ID to associate with the notes
   * @returns Array of generated notes
   */
  generateMockNotes: async (loanId: string, userId: string) => {
    try {
      // Create a parent note
      const parentNote = {
        loan_id: loanId,
        user_id: userId,
        content: "This borrower called today to discuss payment options. They're experiencing temporary financial hardship and may miss next month's payment.",
        is_internal_only: true,
        mention_user_ids: [],
        is_resolved: false
      };

      const { data: createdParent, error: parentError } = await loanNotesService.createNote(parentNote);
      
      if (parentError || !createdParent) {
        return { data: [], error: parentError };
      }

      // Create a reply
      const replyNote = {
        loan_id: loanId,
        user_id: userId,
        parent_note_id: createdParent.id,
        content: "I've scheduled a follow-up call for next week to discuss hardship options. Will update the team once I have more information.",
        is_internal_only: true,
        mention_user_ids: [],
        is_resolved: false
      };

      await loanNotesService.createNote(replyNote);

      // Create another parent note
      const anotherNote = {
        loan_id: loanId,
        user_id: userId,
        content: "Loan modification paperwork has been submitted and is pending review.",
        is_internal_only: false,
        mention_user_ids: [],
        is_resolved: false
      };

      await loanNotesService.createNote(anotherNote);

      // Fetch all notes to return the threaded structure
      return await loanNotesService.getNotesByLoanId(loanId);
    } catch (err) {
      console.error("Exception in generateMockNotes:", err);
      return { data: [], error: err };
    }
  }
};

/**
 * Organize flat notes list into a threaded structure
 * @param notes Array of notes from database
 * @returns Threaded notes structure
 */
function organizeNotesIntoThreads(notes: any[]): LoanNote[] {
  // First, enhance the notes with user information from the manually added user property
  const enhancedNotes = notes.map(note => {
    return {
      ...note,
      user_name: note.user?.full_name || 'Unknown User',
      user_avatar: note.user?.avatar_url || null,
      replies: []
    };
  });

  // Map to track all notes by ID
  const noteMap = new Map();
  enhancedNotes.forEach(note => {
    noteMap.set(note.id, note);
  });

  // Organize into threads - top level notes and their replies
  const threadedNotes: LoanNote[] = [];
  
  enhancedNotes.forEach(note => {
    if (note.parent_note_id) {
      // This is a reply - add it to its parent's replies
      const parent = noteMap.get(note.parent_note_id);
      if (parent) {
        parent.replies.push(note);
      } else {
        // Parent not found, treat as top-level
        threadedNotes.push(note);
      }
    } else {
      // This is a top-level note
      threadedNotes.push(note);
    }
  });

  // Sort top-level notes by creation date (newest first)
  threadedNotes.sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Sort replies by creation date (oldest first)
  threadedNotes.forEach(note => {
    if (note.replies && note.replies.length > 0) {
      note.replies.sort((a, b) => {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    }
  });

  return threadedNotes;
}