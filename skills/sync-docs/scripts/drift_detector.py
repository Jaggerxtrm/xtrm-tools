#!/usr/bin/env python3
"""
Detect documentation drift between docs/ files and git-modified files.

A docs file is considered stale when it declares source globs in frontmatter
(`source_of_truth_for` or `tracks`) and recent commits modified matching files.

Subcommands:
  scan [--since N] [--json]  — scan all docs files (default N=30 commits)
  check <docs-file> [--since N] [--json]  — check one docs file
  hook [--json]              — check current uncommitted changes
"""

import sys
import re
import json
import fnmatch
import subprocess
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None


def find_project_root() -> Path:
    """Walk up from cwd looking for docs/ and .git."""
    p = Path.cwd()
    for parent in [p, *p.parents]:
        if (parent / ".git").exists():
            return parent
    return p


def get_docs_files(project_root: Path) -> list[Path]:
    docs_dir = project_root / "docs"
    if not docs_dir.exists():
        return []
    return sorted(docs_dir.rglob("*.md"))


def extract_frontmatter(content: str) -> dict[str, Any]:
    match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    if not match:
        return {}

    raw = match.group(1)
    if yaml is not None:
        try:
            return yaml.safe_load(raw) or {}
        except Exception:
            return {}

    # Minimal fallback parser for environments without pyyaml
    fm: dict[str, Any] = {}
    current_key: str | None = None
    for line in raw.splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        if re.match(r"^[A-Za-z0-9_\-]+:\s*", line):
            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip()
            if not value:
                fm[key] = []
                current_key = key
            else:
                fm[key] = value.strip('"')
                current_key = None
        elif current_key and line.strip().startswith("-"):
            item = line.strip()[1:].strip().strip('"')
            if isinstance(fm.get(current_key), list):
                fm[current_key].append(item)
    return fm


def extract_globs(content: str) -> list[str]:
    fm = extract_frontmatter(content)
    source = fm.get("source_of_truth_for", [])
    tracks = fm.get("tracks", [])

    globs: list[str] = []
    if isinstance(source, list):
        globs.extend(str(x) for x in source)
    if isinstance(tracks, list):
        for item in tracks:
            s = str(item)
            if s not in globs:
                globs.append(s)

    return [g for g in globs if g.strip()]


def extract_updated(content: str) -> str:
    fm = extract_frontmatter(content)
    return str(fm.get("updated", ""))


def _match_glob(path: str, pattern: str) -> bool:
    path_parts = Path(path).as_posix().split("/")
    pattern_parts = Path(pattern).as_posix().split("/")

    def _match(pp: list[str], pat: list[str]) -> bool:
        if not pat:
            return not pp
        if pat[0] == "**":
            for i in range(len(pp) + 1):
                if _match(pp[i:], pat[1:]):
                    return True
            return False
        if not pp:
            return False
        return fnmatch.fnmatch(pp[0], pat[0]) and _match(pp[1:], pat[1:])

    return _match(path_parts, pattern_parts)


def match_files_to_globs(files: list[str], globs: list[str]) -> list[str]:
    matched: list[str] = []
    for file_path in files:
        for pattern in globs:
            if _match_glob(file_path, pattern):
                matched.append(file_path)
                break
    return matched


def get_recent_modified_files(project_root: Path, since_n_commits: int = 30) -> list[str]:
    try:
        result = subprocess.run(
            ["git", "log", f"-{since_n_commits}", "--name-only", "--format="],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return []
        return [l.strip() for l in result.stdout.splitlines() if l.strip()]
    except Exception:
        return []


def get_session_written_files(project_root: Path) -> list[str]:
    try:
        unstaged = subprocess.run(
            ["git", "diff", "HEAD", "--name-only"],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=10,
        )
        staged = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=10,
        )
        files = unstaged.stdout.splitlines() + staged.stdout.splitlines()
        return sorted({f.strip() for f in files if f.strip()})
    except Exception:
        return []


def scan_docs(project_root: Path, changed_files: list[str]) -> list[dict[str, Any]]:
    stale: list[dict[str, Any]] = []
    for doc_path in get_docs_files(project_root):
        content = doc_path.read_text(encoding="utf-8", errors="replace")
        globs = extract_globs(content)
        if not globs:
            continue

        matched = match_files_to_globs(changed_files, globs)
        if matched:
            stale.append(
                {
                    "doc": str(doc_path.relative_to(project_root)),
                    "updated": extract_updated(content),
                    "matched_files": matched[:10],
                    "globs": globs,
                }
            )
    return stale


def print_human_report(stale: list[dict[str, Any]], source: str) -> None:
    if not stale:
        print(f"[Docs Drift] All docs up to date ({source}).")
        return

    print(f"[Drift Report] {len(stale)} stale doc(s) detected from {source}:\n")
    for item in stale:
        print(f"  {item['doc']}")
        print(f"    Last updated: {item['updated'] or 'unknown'}")
        for file_path in item["matched_files"][:3]:
            print(f"    Modified: {file_path}")
        print("")
    print("Run /sync-docs to review and update stale docs.")


def cmd_scan(args: list[str]) -> None:
    since = 30
    as_json = "--json" in args
    if "--since" in args:
        idx = args.index("--since")
        if idx + 1 < len(args):
            since = int(args[idx + 1])

    project_root = find_project_root()
    changed = get_recent_modified_files(project_root, since)
    stale = scan_docs(project_root, changed)

    if as_json:
        print(
            json.dumps(
                {
                    "mode": "scan",
                    "since": since,
                    "count": len(stale),
                    "stale": stale,
                },
                indent=2,
            )
        )
    else:
        print_human_report(stale, f"last {since} commits")

    sys.exit(1 if stale else 0)


def cmd_check(args: list[str]) -> None:
    if not args:
        print("Usage: drift_detector.py check <docs-file> [--since N] [--json]")
        sys.exit(1)

    target = args[0]
    as_json = "--json" in args
    since = 30
    if "--since" in args:
        idx = args.index("--since")
        if idx + 1 < len(args):
            since = int(args[idx + 1])

    project_root = find_project_root()
    doc_path = (project_root / target).resolve()
    if not doc_path.exists():
        print(f"Doc not found: {target}")
        sys.exit(1)

    changed = get_recent_modified_files(project_root, since)
    content = doc_path.read_text(encoding="utf-8")
    globs = extract_globs(content)
    matched = match_files_to_globs(changed, globs) if globs else []

    payload = {
        "mode": "check",
        "doc": str(doc_path.relative_to(project_root)),
        "since": since,
        "stale": bool(matched),
        "matched_files": matched[:10],
        "globs": globs,
    }

    if as_json:
        print(json.dumps(payload, indent=2))
    else:
        if matched:
            print(f"{payload['doc']}: STALE")
            for f in matched[:5]:
                print(f"  Modified: {f}")
        else:
            print(f"{payload['doc']}: up to date")

    sys.exit(1 if matched else 0)


def cmd_hook(args: list[str]) -> None:
    as_json = "--json" in args
    project_root = find_project_root()
    changed = get_session_written_files(project_root)
    if not changed:
        sys.exit(0)

    stale = scan_docs(project_root, changed)
    if not stale:
        sys.exit(0)

    if as_json:
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "Stop",
                        "additionalContext": (
                            f"[Docs Drift] {len(stale)} docs may need updates. "
                            "Run /sync-docs to review."
                        ),
                    }
                }
            )
        )
    else:
        print_human_report(stale, "current session changes")

    sys.exit(1)


SUBCOMMANDS = {"scan": cmd_scan, "check": cmd_check, "hook": cmd_hook}


def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] not in SUBCOMMANDS:
        print("Usage: drift_detector.py <scan|check|hook> [options]")
        print("  scan [--since N] [--json]          scan all docs files")
        print("  check <docs-file> [--since N]      check one docs file")
        print("  hook [--json]                      stop-hook mode")
        sys.exit(1)

    SUBCOMMANDS[args[0]](args[1:])


if __name__ == "__main__":
    main()
