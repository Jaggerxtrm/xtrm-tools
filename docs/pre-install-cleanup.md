# Pre-Install Cleanup Guide

Run this before `xtrm install all` on any machine that had xtrm-tools installed
**before the plugin migration** (prior to v2.3.0). Clears legacy files so the
plugin can take ownership cleanly.

---

## Step 1 — Remove legacy Claude hooks

```bash
rm -f ~/.claude/hooks/agent_context.py
rm -f ~/.claude/hooks/beads-*.mjs
rm -f ~/.claude/hooks/beads-gate-*.mjs
rm -f ~/.claude/hooks/branch-state.mjs
rm -f ~/.claude/hooks/main-guard.mjs ~/.claude/hooks/main-guard-post-push.mjs
rm -f ~/.claude/hooks/serena-workflow-reminder.py
rm -rf ~/.claude/hooks/gitnexus/
rm -rf ~/.claude/hooks/__pycache__/
```

Anything else in `~/.claude/hooks/` is yours — leave it.

---

## Step 2 — Strip the hooks block from settings.json

```bash
python3 -c "
import json, shutil
p = '$HOME/.claude/settings.json'
shutil.copy(p, p + '.bak')
d = json.load(open(p))
removed = list(d.pop('hooks', {}).keys())
json.dump(d, open(p, 'w'), indent=2)
print('Removed events:', removed)
"
```

The plugin injects hooks directly — settings.json no longer needs them.

---

## Step 3 — Remove MCP servers now provided by official Claude plugins

These MCP endpoints are now provided through official Claude plugins
(`serena@claude-plugins-official`, `context7@claude-plugins-official`,
`github@claude-plugins-official`, `ralph-loop@claude-plugins-official`) and
should be removed from legacy user MCP wiring.

```bash
# ignore errors if a server is not present
claude mcp remove -s user serena || true
claude mcp remove -s user context7 || true
claude mcp remove -s user github || true
claude mcp remove -s user ralph-loop || true
```

---

## Step 4 — Clear legacy Pi extensions

```bash
rm -f ~/.pi/agent/extensions/beads.ts
rm -f ~/.pi/agent/extensions/main-guard.ts
rm -f ~/.pi/agent/extensions/main-guard-post-push.ts
rm -f ~/.pi/agent/extensions/quality-gates.ts
rm -f ~/.pi/agent/extensions/service-skills.ts
rm -f ~/.pi/agent/extensions/auto-session-name.ts
rm -f ~/.pi/agent/extensions/auto-update.ts
rm -f ~/.pi/agent/extensions/bg-process.ts
rm -f ~/.pi/agent/extensions/compact-header.ts
rm -f ~/.pi/agent/extensions/custom-footer.ts
rm -f ~/.pi/agent/extensions/git-checkpoint.ts
rm -f ~/.pi/agent/extensions/todo.ts
rm -f ~/.pi/agent/extensions/xtrm-loader.ts
rm -rf ~/.pi/agent/extensions/core/
rm -rf ~/.pi/agent/extensions/custom-provider-qwen-cli/
```

---

## Step 5 — Fresh install

```bash
cd /path/to/xtrm-tools
git pull origin main
xtrm install all -y
xtrm install pi -y   # for Pi coding agent users
```

---

## Verify

```bash
# ~/.claude/hooks/ should only contain your personal files (if any)
ls ~/.claude/hooks/

# settings.json should have no hooks key
python3 -c "import json; d=json.load(open('$HOME/.claude/settings.json')); print('hooks' in d)"
# → False

# Pi extensions reinstalled fresh
ls ~/.pi/agent/extensions/*.ts | wc -l
# → 13
```
