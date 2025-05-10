---
description: Kick off a new feature build from a Taskmaster task
---

### Purpose
Kick off a new feature build from a Taskmaster task, ensuring schema awareness and best practices across backend and frontend development.

### Task
Pull the next feature from Taskmaster-AI MCP so we can review and start work.

### Workflow
1. Pull full context from `Taskmaster-AI`.
2. Use `Context7` to retrieve relevant schema/components.
3. Use `US RPC` functions for DB ops. If schema changes needed, apply via `supabase` MCP.
4. Scaffold any new components or backend logic.
5. Validate feature locally.
6. Commit with traceable reference to Task.
7. Mark task as complete in 'Taskmaster-AI' once we are done.