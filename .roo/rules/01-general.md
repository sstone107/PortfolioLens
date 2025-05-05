## Roo Code Development Directives:

* **Task First:** Always read and understand `PLANNING.md` and `TASK.md` before generating code. Add new tasks to `TASK.md` if starting work not explicitly listed.
* ** Task-Master ** If we are using task-master for a project, it should be referred to to start our next task and stay on track. 
** We are coding in a windows enviroment - use windows commands in terminal **
* **Stay in Scope:** ONLY implement the defined task or requested modifications. DO NOT add unrequested features, builds, or design changes.
* **Use Approved Tools:** **ALWAYS** utilize available and applicable MCPs (Context7, Supabase, Task-Master, etc.) for documentation, data access, and workflow management.
* **Code Structure & Size:**
    * Adhere to project-specific styles and patterns in `PLANNING.md`.
    * **Strict File Size:** Ensure **EVERY file contains less than 500 Lines of Code (LOC)**. Refactor existing files as needed to meet this limit.
* **Testing:** Generate or update unit/integration tests for all new/changed logic. Include tests for happy paths, significant edge cases, and expected failures.
* **Status Updates:**
    * Update `TASK.md` immediately upon completing work. Mark completed items clearly.
    * Record notable changes in `change_log.md`.
    * Update relevant documentation (e.g., `database_schema.md`) if structural changes occur.
* **Communication Tag:** Prefix all communication/replies with the current work stage tag: `[DEBUG]`, `[PLAN]`, `[IMPLEMENT]`, or `[PM]`.

Use .\build.bat to kill the old version of the app and run a new one. 

Dev environment is WINDOWS based so use windows syntax - not &&s

Follow these directives precisely.