#!/usr/bin/env python3
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from agent_context import AgentContext

try:
    ctx = AgentContext()
    ctx.fail_open()
except Exception as e:
    print(f"Hook error: {e}", file=sys.stderr)
    sys.exit(0)
