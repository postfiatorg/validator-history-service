# Claude Code Guidelines

## Code Quality

- Write clean, professional, production-ready code
- Prioritize readability and clarity — another developer should understand the code immediately
- Follow existing patterns and conventions already present in the codebase
- No magic numbers or strings — use named constants with clear intent

## Project Structure

- Maintain a logical, intuitive folder structure
- Every file must have a clear purpose and reason to exist
- Consolidate related functionality — avoid excessive file fragmentation
- Remove unused files, dead code, and orphaned imports immediately

## Comments

- Only add comments when the code cannot speak for itself
- Comments explain "why", not "what"
- No conversational comments, explanations of changes, or thought process notes
- Write comments for the team, not for AI assistants

## What to Avoid

- Unused variables, imports, functions, or files
- Inconsistent coding styles within the same codebase
- Over-engineering or premature abstraction
- Leaving TODO comments without addressing them
- Creating new files when existing ones can be extended logically

## Documentation

- Update README.md when changes affect setup, usage, or project overview
- README.md is for developers only — keep it technical and relevant
- All other documentation belongs in `/docs` in the appropriate location
- Do not clutter README with end-user guides or non-developer information

## Before Submitting Changes

- Verify no unused code is introduced
- Confirm consistency with existing codebase patterns
- Remove any temporary or debug code
- Ensure all magic values are properly named constants
- Don't mention you have worked on commit in any way
