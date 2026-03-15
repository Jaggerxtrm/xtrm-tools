#!/usr/bin/env python3
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from agent_context import AgentContext

EDIT_KEYWORDS = [
    'fix', 'refactor', 'change', 'update', 'modify', 'edit',
    'rename', 'move', 'delete', 'remove', 'rewrite', 'implement',
    'add', 'replace', 'extract', 'migrate', 'upgrade',
]

REMINDER = """*** GITNEXUS: Run impact analysis before editing any symbol ***

Before modifying a function, class, or method:
  npx gitnexus impact <symbolName> --direction upstream --repo xtrm-tools

Review d=1 items (WILL BREAK) before proceeding.
Skip for docs, configs, and test-only changes.
"""

try:
    ctx = AgentContext()

    if ctx.event == 'UserPromptSubmit':
        prompt_lower = ctx.prompt.lower()
        if any(kw in prompt_lower for kw in EDIT_KEYWORDS):
            ctx.allow(additional_context=REMINDER)

    ctx.fail_open()

except Exception as e:
    print(f"Hook error: {e}", file=sys.stderr)
    sys.exit(0)
