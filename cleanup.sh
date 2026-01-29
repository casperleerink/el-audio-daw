#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

for ((i=1; i<=$1; i++)); do
  echo "Cleanup iteration $i"
  echo "--------------------------------"
  result=$(claude --dangerously-skip-permissions -p "
You are a code cleanup agent. Your job is to find ONE thing in the codebase to improve and fix it.

Focus areas for cleanup:
- Extracting complex logic from React components into custom hooks or utility functions
- Creating new files/components when a file is doing too much
- Improving code readability and cleanliness
- Reducing code duplication
- Simplifying overly complex functions
- Better separation of concerns

Instructions:
1. Explore the codebase (especially apps/web/src and packages/) to find ONE cleanup opportunity.
2. Pick the most impactful improvement you can find.
3. Implement the refactor.
4. Verify types pass with: bun run check-types
5. Verify lints pass with: bun run check
6. Make a git commit describing what was cleaned up.

IMPORTANT: Only do ONE cleanup per iteration. Be thorough but focused.

If after exploring the codebase you cannot find any meaningful cleanup opportunities
(the code is already clean and well-organized), output <promise>COMPLETE</promise>.
")

  echo "$result"

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "Codebase cleanup complete, exiting."
    exit 0
  fi
done
