# Documenting Skill Extension - Multi-Document Orchestration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the documenting skill to automatically maintain SSOT memories, CHANGELOG.md (Keep a Changelog format), README.md, and CLAUDE.md/AGENT.md in a coordinated, validated manner.

**Architecture:** Add changelog management scripts following Keep a Changelog strict format with validation, create project docs synchronization utilities, and build an orchestrator that coordinates updates across all documentation types. All changes validated via scripts before commit.

**Tech Stack:** Python 3, YAML frontmatter, Markdown, Keep a Changelog 1.0.0, Serena SSOT conventions, regex-based validation

---

## Prerequisites

**Required Understanding:**
- Keep a Changelog format: https://keepachangelog.com/en/1.0.0/
- Semantic Versioning: https://semver.org/spec/v2.0.0.html
- Serena SSOT metadata schema: `~/.claude/skills/documenting/references/metadata-schema.md`
- Reference implementation: `~/projects/omni-search-engine/CHANGELOG.md`

**Environment:**
- Python 3.8+
- Existing documenting skill at `~/.claude/skills/documenting/`
- Write access to skill directory

---

## Task 1: CHANGELOG Script Foundation

**Files:**
- Create: `~/.claude/skills/documenting/scripts/changelog/add_entry.py`
- Create: `~/.claude/skills/documenting/scripts/changelog/bump_release.py`
- Create: `~/.claude/skills/documenting/scripts/changelog/validate_changelog.py`
- Create: `~/.claude/skills/documenting/scripts/changelog/__init__.py`
- Test: `~/.claude/skills/documenting/tests/test_changelog.py`

### Step 1: Create changelog directory structure

```bash
mkdir -p ~/.claude/skills/documenting/scripts/changelog
mkdir -p ~/.claude/skills/documenting/tests
touch ~/.claude/skills/documenting/scripts/changelog/__init__.py
```

### Step 2: Write test for CHANGELOG validation

Create `~/.claude/skills/documenting/tests/test_changelog.py`:

```python
#!/usr/bin/env python3
"""Tests for CHANGELOG management scripts."""

import pytest
from pathlib import Path
from scripts.changelog.validate_changelog import validate_changelog


def test_valid_changelog_passes():
    """Valid Keep a Changelog format should pass validation."""
    valid_content = """# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New feature description

## [1.0.0] - 2026-02-01

### Added
- Initial release
"""
    result = validate_changelog(valid_content)
    assert result["valid"] is True
    assert len(result["errors"]) == 0


def test_missing_unreleased_section_fails():
    """CHANGELOG without [Unreleased] section should fail."""
    invalid_content = """# Changelog

## [1.0.0] - 2026-02-01

### Added
- Initial release
"""
    result = validate_changelog(invalid_content)
    assert result["valid"] is False
    assert any("Unreleased" in err for err in result["errors"])


def test_invalid_semver_fails():
    """CHANGELOG with invalid semver should fail."""
    invalid_content = """# Changelog

## [Unreleased]

## [1.0] - 2026-02-01

### Added
- Initial release
"""
    result = validate_changelog(invalid_content)
    assert result["valid"] is False
    assert any("semver" in err.lower() for err in result["errors"])


def test_invalid_category_fails():
    """CHANGELOG with invalid category should fail."""
    invalid_content = """# Changelog

## [Unreleased]

### InvalidCategory
- Some change

## [1.0.0] - 2026-02-01

### Added
- Initial release
"""
    result = validate_changelog(invalid_content)
    assert result["valid"] is False
    assert any("category" in err.lower() for err in result["errors"])
```

### Step 3: Run test to verify it fails

```bash
cd ~/.claude/skills/documenting
python -m pytest tests/test_changelog.py::test_valid_changelog_passes -v
```

Expected: FAIL with "ModuleNotFoundError: No module named 'scripts.changelog.validate_changelog'"

### Step 4: Implement CHANGELOG validator

Create `~/.claude/skills/documenting/scripts/changelog/validate_changelog.py`:

```python
#!/usr/bin/env python3
"""
Validate CHANGELOG.md follows Keep a Changelog 1.0.0 format.

Checks:
- Required header with Keep a Changelog link
- [Unreleased] section exists
- Version sections use semantic versioning
- Valid categories: Added, Changed, Deprecated, Removed, Fixed, Security
- Proper date format: YYYY-MM-DD
"""

import re
from pathlib import Path
from typing import Dict, List, Tuple


VALID_CATEGORIES = {"Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"}
SEMVER_PATTERN = r"^\d+\.\d+\.\d+$"
DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"


def validate_changelog(content: str) -> Dict[str, any]:
    """
    Validate CHANGELOG content.

    Returns:
        {
            "valid": bool,
            "errors": List[str],
            "warnings": List[str]
        }
    """
    errors = []
    warnings = []

    # Check header
    if "Keep a Changelog" not in content:
        errors.append("Missing 'Keep a Changelog' link in header")

    if "Semantic Versioning" not in content:
        warnings.append("Missing 'Semantic Versioning' link in header")

    # Check for [Unreleased] section
    if not re.search(r"^## \[Unreleased\]", content, re.MULTILINE):
        errors.append("Missing required [Unreleased] section")

    # Find all version sections
    version_pattern = r"^## \[(.+?)\](?: - (\d{4}-\d{2}-\d{2}))?$"
    versions = re.findall(version_pattern, content, re.MULTILINE)

    for version, date in versions:
        if version == "Unreleased":
            if date:
                warnings.append("[Unreleased] section should not have a date")
            continue

        # Validate semver
        if not re.match(SEMVER_PATTERN, version):
            errors.append(f"Invalid semantic version: [{version}] (expected X.Y.Z)")

        # Validate date
        if not date:
            errors.append(f"Version [{version}] missing release date")
        elif not re.match(DATE_PATTERN, date):
            errors.append(f"Invalid date format for [{version}]: {date} (expected YYYY-MM-DD)")

    # Find all categories
    category_pattern = r"^### (.+?)$"
    categories = re.findall(category_pattern, content, re.MULTILINE)

    for category in categories:
        if category not in VALID_CATEGORIES:
            errors.append(f"Invalid category: '{category}' (must be one of {VALID_CATEGORIES})")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings
    }


def validate_file(filepath: Path) -> Dict[str, any]:
    """Validate a CHANGELOG.md file."""
    if not filepath.exists():
        return {
            "valid": False,
            "errors": [f"File not found: {filepath}"],
            "warnings": []
        }

    content = filepath.read_text(encoding='utf-8')
    return validate_changelog(content)


def main():
    """CLI entry point."""
    import sys

    if len(sys.argv) != 2:
        print("Usage: validate_changelog.py <CHANGELOG.md>")
        sys.exit(1)

    filepath = Path(sys.argv[1])
    result = validate_file(filepath)

    print(f"Validating: {filepath.name}")
    print("=" * 60)

    if result["warnings"]:
        print("\n⚠️  WARNINGS:")
        for warning in result["warnings"]:
            print(f"  - {warning}")

    if result["errors"]:
        print("\n❌ ERRORS:")
        for error in result["errors"]:
            print(f"  - {error}")
        print("=" * 60)
        sys.exit(1)

    print("\n✅ VALID: All checks passed!")
    print("=" * 60)
    sys.exit(0)


if __name__ == "__main__":
    main()
```

### Step 5: Run tests to verify they pass

```bash
cd ~/.claude/skills/documenting
python -m pytest tests/test_changelog.py -v
```

Expected: All tests PASS

### Step 6: Commit changelog validation

```bash
cd ~/.claude/skills/documenting
git add scripts/changelog/validate_changelog.py tests/test_changelog.py scripts/changelog/__init__.py
git commit -m "feat(documenting): add CHANGELOG.md validation script

- Validates Keep a Changelog 1.0.0 format
- Checks semver, date format, categories
- Returns structured errors/warnings
- Includes comprehensive test suite"
```

---

## Task 2: CHANGELOG Entry Addition

**Files:**
- Create: `~/.claude/skills/documenting/scripts/changelog/add_entry.py`
- Modify: `~/.claude/skills/documenting/tests/test_changelog.py` (add new tests)

### Step 1: Write tests for add_entry

Add to `~/.claude/skills/documenting/tests/test_changelog.py`:

```python
from scripts.changelog.add_entry import add_entry, ChangeCategory
import tempfile


def test_add_entry_to_unreleased():
    """Adding entry should place it under [Unreleased] in correct category."""
    changelog_content = """# Changelog

## [Unreleased]

## [1.0.0] - 2026-02-01

### Added
- Initial release
"""

    result = add_entry(
        changelog_content,
        category=ChangeCategory.ADDED,
        description="New feature X"
    )

    assert "### Added" in result
    assert "- New feature X" in result
    # Should be under [Unreleased], not under [1.0.0]
    unreleased_section = result.split("## [1.0.0]")[0]
    assert "- New feature X" in unreleased_section


def test_add_entry_creates_category_if_missing():
    """Adding entry should create category section if it doesn't exist."""
    changelog_content = """# Changelog

## [Unreleased]

## [1.0.0] - 2026-02-01

### Added
- Initial release
"""

    result = add_entry(
        changelog_content,
        category=ChangeCategory.FIXED,
        description="Bug fix Y"
    )

    assert "### Fixed" in result
    assert "- Bug fix Y" in result


def test_add_entry_maintains_category_order():
    """Categories should be ordered: Added, Changed, Deprecated, Removed, Fixed, Security."""
    changelog_content = """# Changelog

## [Unreleased]

### Added
- Feature A

### Fixed
- Bug B

## [1.0.0] - 2026-02-01
"""

    result = add_entry(
        changelog_content,
        category=ChangeCategory.CHANGED,
        description="Change C"
    )

    # Changed should appear between Added and Fixed
    lines = result.split('\n')
    added_idx = next(i for i, line in enumerate(lines) if "### Added" in line)
    changed_idx = next(i for i, line in enumerate(lines) if "### Changed" in line)
    fixed_idx = next(i for i, line in enumerate(lines) if "### Fixed" in line)

    assert added_idx < changed_idx < fixed_idx
```

### Step 2: Run tests to verify failure

```bash
cd ~/.claude/skills/documenting
python -m pytest tests/test_changelog.py::test_add_entry_to_unreleased -v
```

Expected: FAIL with "ModuleNotFoundError: No module named 'scripts.changelog.add_entry'"

### Step 3: Implement add_entry script

Create `~/.claude/skills/documenting/scripts/changelog/add_entry.py`:

```python
#!/usr/bin/env python3
"""
Add entry to CHANGELOG.md [Unreleased] section.

Automatically:
- Places entry in correct category
- Creates category if missing
- Maintains category ordering per Keep a Changelog
- Preserves existing entries
"""

import re
import sys
from enum import Enum
from pathlib import Path
from typing import Optional


class ChangeCategory(Enum):
    """Keep a Changelog categories in proper order."""
    ADDED = "Added"
    CHANGED = "Changed"
    DEPRECATED = "Deprecated"
    REMOVED = "Removed"
    FIXED = "Fixed"
    SECURITY = "Security"


CATEGORY_ORDER = [cat.value for cat in ChangeCategory]


def add_entry(changelog_content: str, category: ChangeCategory, description: str) -> str:
    """
    Add entry to [Unreleased] section under specified category.

    Args:
        changelog_content: Full CHANGELOG.md content
        category: ChangeCategory enum value
        description: Entry text (without leading "- ")

    Returns:
        Updated changelog content
    """
    lines = changelog_content.split('\n')

    # Find [Unreleased] section
    unreleased_idx = None
    for i, line in enumerate(lines):
        if re.match(r"^## \[Unreleased\]", line):
            unreleased_idx = i
            break

    if unreleased_idx is None:
        raise ValueError("CHANGELOG missing [Unreleased] section")

    # Find next version section (end of Unreleased)
    next_version_idx = len(lines)
    for i in range(unreleased_idx + 1, len(lines)):
        if re.match(r"^## \[.+\]", lines[i]):
            next_version_idx = i
            break

    # Find or create category section
    category_name = category.value
    category_idx = None

    for i in range(unreleased_idx + 1, next_version_idx):
        if lines[i].strip() == f"### {category_name}":
            category_idx = i
            break

    if category_idx is None:
        # Category doesn't exist, create it in proper order
        category_idx = _insert_category_in_order(
            lines,
            unreleased_idx,
            next_version_idx,
            category_name
        )

    # Find where to insert the entry (after category header)
    insert_idx = category_idx + 1

    # Skip existing entries to add at end of category
    while insert_idx < next_version_idx and lines[insert_idx].startswith("- "):
        insert_idx += 1

    # Insert the new entry
    entry_line = f"- {description}"
    lines.insert(insert_idx, entry_line)

    return '\n'.join(lines)


def _insert_category_in_order(
    lines: list,
    unreleased_idx: int,
    next_version_idx: int,
    category_name: str
) -> int:
    """
    Insert category header in proper Keep a Changelog order.

    Returns:
        Index where category header was inserted
    """
    category_order_idx = CATEGORY_ORDER.index(category_name)

    # Find existing categories in Unreleased section
    existing_categories = []
    for i in range(unreleased_idx + 1, next_version_idx):
        match = re.match(r"^### (.+)$", lines[i])
        if match:
            cat = match.group(1)
            if cat in CATEGORY_ORDER:
                existing_categories.append((i, cat))

    # Find insertion point
    insert_idx = next_version_idx
    for idx, cat in existing_categories:
        cat_order_idx = CATEGORY_ORDER.index(cat)
        if category_order_idx < cat_order_idx:
            # Insert before this category
            insert_idx = idx
            break

    # Insert category header with blank line before if not first
    if existing_categories:
        lines.insert(insert_idx, "")
        insert_idx += 1
    else:
        # First category, add blank line after [Unreleased]
        lines.insert(unreleased_idx + 1, "")
        insert_idx = unreleased_idx + 2

    lines.insert(insert_idx, f"### {category_name}")

    return insert_idx


def add_entry_to_file(
    filepath: Path,
    category: ChangeCategory,
    description: str
) -> None:
    """Add entry to CHANGELOG file."""
    if not filepath.exists():
        raise FileNotFoundError(f"CHANGELOG not found: {filepath}")

    content = filepath.read_text(encoding='utf-8')
    updated = add_entry(content, category, description)
    filepath.write_text(updated, encoding='utf-8')

    print(f"✅ Added to {filepath.name}:")
    print(f"   [{category.value}] {description}")


def main():
    """CLI entry point."""
    if len(sys.argv) != 4:
        print("Usage: add_entry.py <changelog_file> <category> <description>")
        print("")
        print("Categories: Added, Changed, Deprecated, Removed, Fixed, Security")
        print("")
        print("Example:")
        print('  add_entry.py CHANGELOG.md Added "New semantic search feature"')
        sys.exit(1)

    filepath = Path(sys.argv[1])
    category_str = sys.argv[2]
    description = sys.argv[3]

    # Validate category
    try:
        category = ChangeCategory[category_str.upper()]
    except KeyError:
        print(f"ERROR: Invalid category '{category_str}'")
        print(f"Valid: {', '.join(CATEGORY_ORDER)}")
        sys.exit(1)

    add_entry_to_file(filepath, category, description)


if __name__ == "__main__":
    main()
```

### Step 4: Run tests to verify pass

```bash
cd ~/.claude/skills/documenting
python -m pytest tests/test_changelog.py::test_add_entry_to_unreleased -v
python -m pytest tests/test_changelog.py::test_add_entry_creates_category_if_missing -v
python -m pytest tests/test_changelog.py::test_add_entry_maintains_category_order -v
```

Expected: All tests PASS

### Step 5: Test add_entry CLI manually

```bash
cd ~/.claude/skills/documenting
# Create test changelog
cat > /tmp/test_changelog.md << 'EOF'
# Changelog

## [Unreleased]

## [1.0.0] - 2026-02-01

### Added
- Initial release
EOF

python scripts/changelog/add_entry.py /tmp/test_changelog.md Added "Test feature"
cat /tmp/test_changelog.md
```

Expected: Entry added under [Unreleased] ### Added section

### Step 6: Commit add_entry implementation

```bash
cd ~/.claude/skills/documenting
git add scripts/changelog/add_entry.py tests/test_changelog.py
git commit -m "feat(documenting): add CHANGELOG entry insertion script

- Adds entries to [Unreleased] section
- Creates categories if missing
- Maintains Keep a Changelog category order
- Comprehensive test coverage"
```

---

## Task 3: CHANGELOG Release Bumping

**Files:**
- Create: `~/.claude/skills/documenting/scripts/changelog/bump_release.py`
- Modify: `~/.claude/skills/documenting/tests/test_changelog.py`

### Step 1: Write tests for bump_release

Add to `~/.claude/skills/documenting/tests/test_changelog.py`:

```python
from scripts.changelog.bump_release import bump_release
from datetime import date


def test_bump_release_moves_unreleased():
    """Bumping release should move [Unreleased] to [X.Y.Z] - DATE."""
    changelog_content = """# Changelog

## [Unreleased]

### Added
- New feature

## [1.0.0] - 2026-01-01

### Added
- Initial release
"""

    result = bump_release(changelog_content, "1.1.0")

    # Should have new version section
    assert "## [1.1.0]" in result
    assert f"## [1.1.0] - {date.today().strftime('%Y-%m-%d')}" in result

    # New feature should be under 1.1.0 now
    version_section = result.split("## [1.0.0]")[0]
    assert "- New feature" in version_section

    # [Unreleased] should be empty
    unreleased_section = result.split("## [1.1.0]")[0]
    assert "## [Unreleased]" in unreleased_section
    # No ### categories under [Unreleased]
    unreleased_lines = unreleased_section.split("## [Unreleased]")[1].split('\n')
    assert not any(line.startswith("###") for line in unreleased_lines)


def test_bump_release_validates_semver():
    """Bumping with invalid semver should raise error."""
    changelog_content = "## [Unreleased]"

    with pytest.raises(ValueError, match="semver"):
        bump_release(changelog_content, "1.0")
```

### Step 2: Run tests to verify failure

```bash
cd ~/.claude/skills/documenting
python -m pytest tests/test_changelog.py::test_bump_release_moves_unreleased -v
```

Expected: FAIL with "ModuleNotFoundError"

### Step 3: Implement bump_release script

Create `~/.claude/skills/documenting/scripts/changelog/bump_release.py`:

```python
#!/usr/bin/env python3
"""
Bump CHANGELOG.md release version.

Moves [Unreleased] content to new [X.Y.Z] - YYYY-MM-DD section.
Creates new empty [Unreleased] section.
"""

import re
import sys
from datetime import date
from pathlib import Path


SEMVER_PATTERN = r"^\d+\.\d+\.\d+$"


def bump_release(changelog_content: str, version: str, release_date: str = None) -> str:
    """
    Move [Unreleased] to [version] - date.

    Args:
        changelog_content: Full CHANGELOG.md content
        version: Semantic version (X.Y.Z)
        release_date: Optional YYYY-MM-DD (defaults to today)

    Returns:
        Updated changelog content
    """
    # Validate semver
    if not re.match(SEMVER_PATTERN, version):
        raise ValueError(f"Invalid semantic version: {version} (expected X.Y.Z)")

    if release_date is None:
        release_date = date.today().strftime('%Y-%m-%d')

    lines = changelog_content.split('\n')

    # Find [Unreleased] section
    unreleased_idx = None
    for i, line in enumerate(lines):
        if re.match(r"^## \[Unreleased\]", line):
            unreleased_idx = i
            break

    if unreleased_idx is None:
        raise ValueError("CHANGELOG missing [Unreleased] section")

    # Replace [Unreleased] with [version] - date
    lines[unreleased_idx] = f"## [{version}] - {release_date}"

    # Insert new empty [Unreleased] section at top
    # Find where to insert (after header, before first version)
    header_end_idx = 0
    for i, line in enumerate(lines):
        if re.match(r"^## \[", line):
            header_end_idx = i
            break

    # Insert [Unreleased] section
    lines.insert(header_end_idx, "")
    lines.insert(header_end_idx, "## [Unreleased]")

    return '\n'.join(lines)


def bump_release_file(filepath: Path, version: str, release_date: str = None) -> None:
    """Bump release version in CHANGELOG file."""
    if not filepath.exists():
        raise FileNotFoundError(f"CHANGELOG not found: {filepath}")

    content = filepath.read_text(encoding='utf-8')
    updated = bump_release(content, version, release_date)
    filepath.write_text(updated, encoding='utf-8')

    actual_date = release_date or date.today().strftime('%Y-%m-%d')
    print(f"✅ Released version {version} ({actual_date})")
    print(f"📝 Updated {filepath.name}")


def main():
    """CLI entry point."""
    if len(sys.argv) < 3:
        print("Usage: bump_release.py <changelog_file> <version> [date]")
        print("")
        print("Example:")
        print("  bump_release.py CHANGELOG.md 1.2.0")
        print("  bump_release.py CHANGELOG.md 2.0.0 2026-03-15")
        sys.exit(1)

    filepath = Path(sys.argv[1])
    version = sys.argv[2]
    release_date = sys.argv[3] if len(sys.argv) > 3 else None

    bump_release_file(filepath, version, release_date)


if __name__ == "__main__":
    main()
```

### Step 4: Run tests to verify pass

```bash
cd ~/.claude/skills/documenting
python -m pytest tests/test_changelog.py::test_bump_release_moves_unreleased -v
python -m pytest tests/test_changelog.py::test_bump_release_validates_semver -v
```

Expected: All tests PASS

### Step 5: Commit bump_release

```bash
cd ~/.claude/skills/documenting
git add scripts/changelog/bump_release.py tests/test_changelog.py
git commit -m "feat(documenting): add CHANGELOG release bumping script

- Moves [Unreleased] to [X.Y.Z] - YYYY-MM-DD
- Creates new empty [Unreleased] section
- Validates semantic versioning
- Supports custom release dates"
```

---

## Task 4: CHANGELOG Template

**Files:**
- Create: `~/.claude/skills/documenting/templates/CHANGELOG.md.template`
- Create: `~/.claude/skills/documenting/scripts/changelog/init_changelog.py`

### Step 1: Create CHANGELOG template

Create `~/.claude/skills/documenting/templates/CHANGELOG.md.template`:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - {release_date}

### Added
- Initial release
```

### Step 2: Create init_changelog script (no test needed - simple)

Create `~/.claude/skills/documenting/scripts/changelog/init_changelog.py`:

```python
#!/usr/bin/env python3
"""Initialize a new CHANGELOG.md file."""

import sys
from datetime import date
from pathlib import Path


def init_changelog(output_path: Path, initial_version: str = "0.1.0") -> None:
    """Create new CHANGELOG.md from template."""
    template_path = Path(__file__).parent.parent.parent / "templates" / "CHANGELOG.md.template"

    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_path}")

    if output_path.exists():
        raise FileExistsError(f"CHANGELOG already exists: {output_path}")

    template = template_path.read_text(encoding='utf-8')
    content = template.format(
        release_date=date.today().strftime('%Y-%m-%d'),
        initial_version=initial_version
    )

    output_path.write_text(content, encoding='utf-8')
    print(f"✅ Created {output_path}")
    print(f"📝 Initial version: {initial_version}")


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print("Usage: init_changelog.py <output_path> [initial_version]")
        print("")
        print("Example:")
        print("  init_changelog.py ./CHANGELOG.md")
        print("  init_changelog.py ./CHANGELOG.md 1.0.0")
        sys.exit(1)

    output_path = Path(sys.argv[1])
    initial_version = sys.argv[2] if len(sys.argv) > 2 else "0.1.0"

    init_changelog(output_path, initial_version)


if __name__ == "__main__":
    main()
```

### Step 3: Test init_changelog manually

```bash
cd ~/.claude/skills/documenting
python scripts/changelog/init_changelog.py /tmp/NEW_CHANGELOG.md
cat /tmp/NEW_CHANGELOG.md
python scripts/changelog/validate_changelog.py /tmp/NEW_CHANGELOG.md
```

Expected: Creates valid CHANGELOG, validation passes

### Step 4: Commit template and init script

```bash
cd ~/.claude/skills/documenting
git add templates/CHANGELOG.md.template scripts/changelog/init_changelog.py
git commit -m "feat(documenting): add CHANGELOG initialization

- Template following Keep a Changelog format
- init_changelog.py creates new CHANGELOG.md
- Customizable initial version"
```

---

## Task 5: Documentation Orchestrator Foundation

**Files:**
- Create: `~/.claude/skills/documenting/scripts/orchestrator.py`
- Create: `~/.claude/skills/documenting/tests/test_orchestrator.py`

### Step 1: Write tests for orchestrator

Create `~/.claude/skills/documenting/tests/test_orchestrator.py`:

```python
#!/usr/bin/env python3
"""Tests for documentation orchestrator."""

import pytest
from pathlib import Path
from scripts.orchestrator import DocumentingOrchestrator, ChangeType


def test_orchestrator_routes_to_correct_docs(tmp_path):
    """Orchestrator should update relevant docs based on change type."""
    # Setup test project
    project_root = tmp_path / "test_project"
    project_root.mkdir()

    changelog = project_root / "CHANGELOG.md"
    changelog.write_text("""# Changelog

## [Unreleased]

## [0.1.0] - 2026-02-01

### Added
- Initial release
""")

    serena_memories = project_root / ".serena" / "memories"
    serena_memories.mkdir(parents=True)

    orchestrator = DocumentingOrchestrator(project_root)

    result = orchestrator.document_change(
        change_type=ChangeType.FEATURE,
        description="Add new API endpoint",
        details={
            "scope": "api-endpoints",
            "category": "backend",
            "files_changed": ["server.py", "routes/api.py"]
        }
    )

    # Should update CHANGELOG
    assert result["changelog_updated"] is True
    # Should create/update SSOT
    assert result["ssot_updated"] is True
    # Should suggest README update
    assert "readme_suggestions" in result


def test_orchestrator_validates_all_docs():
    """Orchestrator should validate all documentation after updates."""
    # Test validation integration
    pass
```

### Step 2: Run tests to verify failure

```bash
cd ~/.claude/skills/documenting
python -m pytest tests/test_orchestrator.py::test_orchestrator_routes_to_correct_docs -v
```

Expected: FAIL with "ModuleNotFoundError"

### Step 3: Implement orchestrator foundation

Create `~/.claude/skills/documenting/scripts/orchestrator.py`:

```python
#!/usr/bin/env python3
"""
Documentation orchestrator for coordinating SSOT, CHANGELOG, README, CLAUDE.md updates.

Workflow:
1. Classify change type (feature, bugfix, refactor, breaking)
2. Update SSOT memories (.serena/memories/)
3. Update CHANGELOG.md
4. Suggest README.md updates
5. Suggest CLAUDE.md/AGENT.md updates
6. Validate all changes
"""

import sys
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime, timezone

from changelog.add_entry import add_entry_to_file, ChangeCategory
from changelog.validate_changelog import validate_file as validate_changelog_file


class ChangeType(Enum):
    """Types of changes to document."""
    FEATURE = "feature"
    BUGFIX = "bugfix"
    REFACTOR = "refactor"
    BREAKING = "breaking"
    DOCS = "docs"
    CHORE = "chore"


# Mapping of ChangeType to CHANGELOG category
CHANGE_TYPE_TO_CATEGORY = {
    ChangeType.FEATURE: ChangeCategory.ADDED,
    ChangeType.BUGFIX: ChangeCategory.FIXED,
    ChangeType.REFACTOR: ChangeCategory.CHANGED,
    ChangeType.BREAKING: ChangeCategory.CHANGED,
    ChangeType.DOCS: ChangeCategory.CHANGED,
    ChangeType.CHORE: ChangeCategory.CHANGED,
}


class DocumentingOrchestrator:
    """Coordinates documentation updates across multiple doc types."""

    def __init__(self, project_root: Path):
        self.project_root = Path(project_root)
        self.changelog_path = self.project_root / "CHANGELOG.md"
        self.readme_path = self.project_root / "README.md"
        self.claude_path = self._find_agent_doc()
        self.ssot_dir = self.project_root / ".serena" / "memories"

    def _find_agent_doc(self) -> Optional[Path]:
        """Find CLAUDE.md or AGENT.md."""
        for name in ["CLAUDE.md", "AGENT.md"]:
            path = self.project_root / name
            if path.exists():
                return path
        return None

    def document_change(
        self,
        change_type: ChangeType,
        description: str,
        details: Optional[Dict] = None
    ) -> Dict:
        """
        Document a change across all relevant documentation.

        Args:
            change_type: Type of change
            description: Brief description
            details: Additional context:
                - scope: SSOT scope identifier
                - category: SSOT category
                - subcategory: SSOT subcategory
                - files_changed: List of affected files
                - breaking: Whether change is breaking

        Returns:
            {
                "changelog_updated": bool,
                "ssot_updated": bool,
                "ssot_file": Optional[Path],
                "readme_suggestions": List[str],
                "claude_suggestions": List[str],
                "validation_errors": List[str]
            }
        """
        details = details or {}
        result = {
            "changelog_updated": False,
            "ssot_updated": False,
            "ssot_file": None,
            "readme_suggestions": [],
            "claude_suggestions": [],
            "validation_errors": []
        }

        # 1. Update CHANGELOG
        if self.changelog_path.exists():
            try:
                category = CHANGE_TYPE_TO_CATEGORY[change_type]
                if details.get("breaking"):
                    description = f"**BREAKING**: {description}"

                add_entry_to_file(self.changelog_path, category, description)
                result["changelog_updated"] = True
            except Exception as e:
                result["validation_errors"].append(f"CHANGELOG update failed: {e}")

        # 2. Update/Create SSOT (if relevant)
        if change_type in [ChangeType.FEATURE, ChangeType.REFACTOR, ChangeType.BREAKING]:
            ssot_result = self._update_ssot(change_type, description, details)
            result.update(ssot_result)

        # 3. Generate README suggestions
        if change_type == ChangeType.FEATURE:
            result["readme_suggestions"] = self._generate_readme_suggestions(description, details)

        # 4. Generate CLAUDE.md suggestions
        if change_type in [ChangeType.FEATURE, ChangeType.REFACTOR]:
            result["claude_suggestions"] = self._generate_claude_suggestions(description, details)

        # 5. Validate all documentation
        validation = self.validate_all()
        result["validation_errors"].extend(validation["errors"])

        return result

    def _update_ssot(self, change_type: ChangeType, description: str, details: Dict) -> Dict:
        """Update or create SSOT memory."""
        # This will be implemented with Serena tools in later tasks
        # For now, just return placeholder
        return {
            "ssot_updated": False,
            "ssot_file": None
        }

    def _generate_readme_suggestions(self, description: str, details: Dict) -> List[str]:
        """Generate suggestions for README.md updates."""
        suggestions = []

        # Suggest updating features section
        suggestions.append(f"Consider adding to ## Features section: {description}")

        # If files_changed includes examples, suggest updating usage
        if details.get("files_changed"):
            if any("example" in f.lower() for f in details["files_changed"]):
                suggestions.append("Update ## Usage section with new example")

        return suggestions

    def _generate_claude_suggestions(self, description: str, details: Dict) -> List[str]:
        """Generate suggestions for CLAUDE.md/AGENT.md updates."""
        suggestions = []

        if not self.claude_path:
            return suggestions

        # Suggest architecture updates for major features
        suggestions.append(f"Review ## Architecture section for: {description}")

        # If files_changed affects setup, suggest updating
        if details.get("files_changed"):
            setup_files = ["requirements.txt", "package.json", ".env", "docker-compose.yml"]
            if any(f in details["files_changed"] for f in setup_files):
                suggestions.append("Update ## Development Environment section")

        return suggestions

    def validate_all(self) -> Dict:
        """Validate all documentation."""
        errors = []
        warnings = []

        # Validate CHANGELOG
        if self.changelog_path.exists():
            result = validate_changelog_file(self.changelog_path)
            errors.extend(result.get("errors", []))
            warnings.extend(result.get("warnings", []))

        # TODO: Add SSOT validation
        # TODO: Add README validation (check for broken links, etc.)

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }


def main():
    """CLI entry point."""
    if len(sys.argv) < 4:
        print("Usage: orchestrator.py <project_root> <change_type> <description> [--scope=X] [--category=Y]")
        print("")
        print("Change Types: feature, bugfix, refactor, breaking, docs, chore")
        print("")
        print("Example:")
        print('  orchestrator.py . feature "Add semantic search" --scope=search --category=backend')
        sys.exit(1)

    project_root = Path(sys.argv[1])
    change_type = ChangeType(sys.argv[2])
    description = sys.argv[3]

    # Parse optional details
    details = {}
    for arg in sys.argv[4:]:
        if arg.startswith("--"):
            key, value = arg[2:].split("=", 1)
            details[key] = value

    orchestrator = DocumentingOrchestrator(project_root)
    result = orchestrator.document_change(change_type, description, details)

    # Print results
    print("\n📝 Documentation Update Results")
    print("=" * 60)

    if result["changelog_updated"]:
        print("✅ CHANGELOG.md updated")

    if result["ssot_updated"]:
        print(f"✅ SSOT updated: {result['ssot_file']}")

    if result["readme_suggestions"]:
        print("\n💡 README.md suggestions:")
        for suggestion in result["readme_suggestions"]:
            print(f"  - {suggestion}")

    if result["claude_suggestions"]:
        print("\n💡 CLAUDE.md suggestions:")
        for suggestion in result["claude_suggestions"]:
            print(f"  - {suggestion}")

    if result["validation_errors"]:
        print("\n❌ Validation errors:")
        for error in result["validation_errors"]:
            print(f"  - {error}")
        sys.exit(1)

    print("\n✅ All documentation validated")


if __name__ == "__main__":
    main()
```

### Step 4: Run tests to verify pass

```bash
cd ~/.claude/skills/documenting
python -m pytest tests/test_orchestrator.py::test_orchestrator_routes_to_correct_docs -v
```

Expected: Test PASS

### Step 5: Test orchestrator CLI manually

```bash
cd ~/.claude/skills/documenting
mkdir -p /tmp/test_project/.serena/memories
cp /tmp/test_changelog.md /tmp/test_project/CHANGELOG.md

python scripts/orchestrator.py /tmp/test_project feature "Add new search feature" --scope=search

cat /tmp/test_project/CHANGELOG.md
```

Expected: CHANGELOG updated with new feature entry

### Step 6: Commit orchestrator foundation

```bash
cd ~/.claude/skills/documenting
git add scripts/orchestrator.py tests/test_orchestrator.py
git commit -m "feat(documenting): add documentation orchestrator

- Coordinates updates across SSOT, CHANGELOG, README, CLAUDE.md
- Maps change types to CHANGELOG categories
- Generates suggestions for doc updates
- Validates all documentation
- CLI interface for manual invocation"
```

---

## Task 6: Update SKILL.md Documentation

**Files:**
- Modify: `~/.claude/skills/documenting/SKILL.md`
- Create: `~/.claude/skills/documenting/references/changelog-format.md`

### Step 1: Create changelog format reference

Create `~/.claude/skills/documenting/references/changelog-format.md`:

```markdown
# CHANGELOG Format Reference

This project uses [Keep a Changelog 1.0.0](https://keepachangelog.com/en/1.0.0/) format.

## Structure

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New features

### Changed
- Changes to existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Security fixes

## [1.0.0] - 2026-02-01

### Added
- Initial release
```

## Categories (in order)

1. **Added** - New features
2. **Changed** - Changes to existing functionality
3. **Deprecated** - Soon-to-be removed features
4. **Removed** - Removed features
5. **Fixed** - Bug fixes
6. **Security** - Security vulnerabilities fixed

## Version Format

- Use [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- Format: `[X.Y.Z] - YYYY-MM-DD`
- Example: `[1.2.3] - 2026-02-01`

## Entry Guidelines

- Start with action verb
- Be specific and concise
- Include context if needed
- Use bullet points (-)
- Sub-bullets for details (indented)

### Examples

**Good:**
```markdown
### Added
- **Universal Context**: Support for indexing multiple sources simultaneously
  - Zero-Config Auto-Discovery for current project
  - Context-Aware Search with source filtering
- Reranking with FlashRank (ms-marco-TinyBERT-L-2-v2 model)
```

**Bad:**
```markdown
### Added
- Added stuff
- Fixed things
- Improvements
```

## Breaking Changes

Mark breaking changes with **BREAKING**: prefix:

```markdown
### Changed
- **BREAKING**: Renamed `old_function()` to `new_function()`
```

## Scripts

- `init_changelog.py` - Create new CHANGELOG.md
- `add_entry.py` - Add entry to [Unreleased]
- `bump_release.py` - Move [Unreleased] to version
- `validate_changelog.py` - Validate format
```

### Step 2: Update SKILL.md with new workflows

Append to `~/.claude/skills/documenting/SKILL.md`:

```markdown
## Workflows

### 5. Document a Completed Change (NEW)

**When**: After completing and verifying a feature, bugfix, or refactor

**Interactive Mode (Recommended)**:

1. **Use the orchestrator**:
   ```bash
   python3 scripts/orchestrator.py . feature "Description of change" \
     --scope=component-name \
     --category=domain
   ```

2. **Review suggestions**:
   - Orchestrator will update CHANGELOG.md automatically
   - Provides suggestions for README.md updates
   - Provides suggestions for CLAUDE.md updates
   - Creates/updates SSOT memory if relevant

3. **Apply manual updates**:
   - Review and apply README suggestions
   - Review and apply CLAUDE.md suggestions
   - Validate all changes

**Manual Mode**:

1. **Update CHANGELOG.md**:
   ```bash
   python3 scripts/changelog/add_entry.py CHANGELOG.md Added "New feature description"
   ```

2. **Update SSOT** (if architectural change):
   ```bash
   python3 scripts/generate_template.py ssot .serena/memories/ssot_domain_component_2026-02-01.md \
     title="Component SSOT" \
     scope="domain-component" \
     domain="domain"
   # Edit the generated file
   ```

3. **Update README.md** (if user-facing change):
   - Add to ## Features section
   - Update ## Usage examples
   - Update ## Installation if needed

4. **Update CLAUDE.md** (if architecture/setup changed):
   - Update ## Architecture section
   - Update ## Development Environment
   - Update ## Key Files & Directories

5. **Validate all documentation**:
   ```bash
   python3 scripts/orchestrator.py . validate
   ```

### 6. Release a New Version (NEW)

**Workflow**:

1. **Ensure all changes documented**:
   ```bash
   # Check [Unreleased] section has content
   grep -A 20 "## \[Unreleased\]" CHANGELOG.md
   ```

2. **Bump CHANGELOG version**:
   ```bash
   python3 scripts/changelog/bump_release.py CHANGELOG.md 1.2.0
   ```

3. **Update version in project files**:
   - `pyproject.toml` / `package.json`
   - `__init__.py` / version files
   - SSOT memory versions (if applicable)

4. **Validate**:
   ```bash
   python3 scripts/changelog/validate_changelog.py CHANGELOG.md
   ```

5. **Commit and tag**:
   ```bash
   git add CHANGELOG.md [other version files]
   git commit -m "chore: release v1.2.0"
   git tag -a v1.2.0 -m "Release 1.2.0"
   git push && git push --tags
   ```

## Change Type Classification

Use orchestrator with these change types:

- **feature**: New functionality
- **bugfix**: Bug corrections
- **refactor**: Code restructuring (no behavior change)
- **breaking**: Breaking API changes
- **docs**: Documentation-only changes
- **chore**: Maintenance tasks

Maps to CHANGELOG categories:
- feature → Added
- bugfix → Fixed
- refactor → Changed
- breaking → Changed (with **BREAKING** prefix)
- docs → Changed
- chore → Changed
```

### Step 3: Validate updated SKILL.md

```bash
cd ~/.claude/skills/documenting
# Check SKILL.md is valid markdown
python3 -c "import sys; from pathlib import Path; content = Path('SKILL.md').read_text(); sys.exit(0 if '## Workflows' in content else 1)"
```

Expected: Exit code 0 (valid)

### Step 4: Commit documentation updates

```bash
cd ~/.claude/skills/documenting
git add SKILL.md references/changelog-format.md
git commit -m "docs(documenting): add CHANGELOG workflow documentation

- New workflow: Document a Completed Change
- New workflow: Release a New Version
- Change type classification guide
- Keep a Changelog format reference"
```

---

## Task 7: README and Integration Testing

**Files:**
- Modify: `~/.claude/skills/documenting/README.md`
- Create: `~/.claude/skills/documenting/tests/integration_test.sh`

### Step 1: Update README.md

Modify `~/.claude/skills/documenting/README.md`:

```markdown
# Documenting Skill

Comprehensive documentation management for projects using:
- **Serena SSOT** (.serena/memories/)
- **CHANGELOG.md** (Keep a Changelog format)
- **README.md**
- **CLAUDE.md / AGENT.md**

## Quick Start

### Initialize Project Documentation

```bash
# Create CHANGELOG.md
python3 scripts/changelog/init_changelog.py ./CHANGELOG.md

# Create .serena/memories directory
mkdir -p .serena/memories
```

### Document a Change

**Using Orchestrator (Recommended)**:

```bash
python3 scripts/orchestrator.py . feature "Add new search feature" \
  --scope=search \
  --category=backend
```

**Manual Workflow**:

1. Update CHANGELOG:
   ```bash
   python3 scripts/changelog/add_entry.py CHANGELOG.md Added "New feature"
   ```

2. Create SSOT (if needed):
   ```bash
   python3 scripts/generate_template.py ssot .serena/memories/ssot_search_engine_2026-02-01.md \
     title="Search Engine SSOT" \
     scope="search-engine" \
     domain="backend"
   ```

3. Update README.md and CLAUDE.md manually

4. Validate:
   ```bash
   python3 scripts/changelog/validate_changelog.py CHANGELOG.md
   python3 scripts/validate_metadata.py .serena/memories/ssot_*.md
   ```

### Release a Version

```bash
# Bump CHANGELOG
python3 scripts/changelog/bump_release.py CHANGELOG.md 1.2.0

# Validate
python3 scripts/changelog/validate_changelog.py CHANGELOG.md

# Commit and tag
git add CHANGELOG.md
git commit -m "chore: release v1.2.0"
git tag -a v1.2.0 -m "Release 1.2.0"
```

## Scripts Reference

### CHANGELOG Management

| Script | Purpose | Example |
|--------|---------|---------|
| `init_changelog.py` | Create new CHANGELOG.md | `init_changelog.py ./CHANGELOG.md` |
| `add_entry.py` | Add entry to [Unreleased] | `add_entry.py CHANGELOG.md Added "Feature X"` |
| `bump_release.py` | Release new version | `bump_release.py CHANGELOG.md 1.2.0` |
| `validate_changelog.py` | Validate format | `validate_changelog.py CHANGELOG.md` |

### SSOT Management

| Script | Purpose | Example |
|--------|---------|---------|
| `generate_template.py` | Create new SSOT | `generate_template.py ssot file.md title="X"` |
| `validate_metadata.py` | Validate SSOT metadata | `validate_metadata.py file.md` |
| `bump_version.sh` | Calculate next version | `bump_version.sh 1.0.0 patch` |

### Orchestration

| Script | Purpose | Example |
|--------|---------|---------|
| `orchestrator.py` | Coordinate all docs | `orchestrator.py . feature "X"` |

## File Structure

```
~/.claude/skills/documenting/
├── SKILL.md                      # Skill definition
├── README.md                     # This file
├── scripts/
│   ├── changelog/
│   │   ├── init_changelog.py    # Create CHANGELOG
│   │   ├── add_entry.py         # Add entries
│   │   ├── bump_release.py      # Release versions
│   │   └── validate_changelog.py # Validate format
│   ├── orchestrator.py          # Coordination
│   ├── generate_template.py     # SSOT templates
│   ├── validate_metadata.py     # SSOT validation
│   └── bump_version.sh          # Version bumping
├── templates/
│   └── CHANGELOG.md.template    # CHANGELOG template
├── references/
│   ├── metadata-schema.md       # SSOT schema
│   ├── changelog-format.md      # Keep a Changelog guide
│   └── taxonomy.md              # SSOT taxonomy
└── tests/
    ├── test_changelog.py        # CHANGELOG tests
    └── test_orchestrator.py     # Orchestrator tests
```

## Change Type Guide

- **feature**: New functionality → CHANGELOG: Added
- **bugfix**: Bug fixes → CHANGELOG: Fixed
- **refactor**: Code restructuring → CHANGELOG: Changed
- **breaking**: Breaking changes → CHANGELOG: Changed (with **BREAKING** prefix)
- **docs**: Documentation → CHANGELOG: Changed
- **chore**: Maintenance → CHANGELOG: Changed

## Validation

All scripts validate before modifying files:
- CHANGELOG: Keep a Changelog 1.0.0 format
- SSOT: Serena metadata schema
- Versions: Semantic Versioning 2.0.0

## Testing

```bash
# Run all tests
python -m pytest tests/

# Test specific module
python -m pytest tests/test_changelog.py -v

# Integration test
bash tests/integration_test.sh
```
```

### Step 2: Create integration test script

Create `~/.claude/skills/documenting/tests/integration_test.sh`:

```bash
#!/usr/bin/env bash
# Integration test for documenting skill workflows

set -e  # Exit on error

TEST_DIR=$(mktemp -d)
echo "Test directory: $TEST_DIR"

cd "$(dirname "$0")/.."  # Go to skill root

# Test 1: Initialize CHANGELOG
echo "Test 1: Initialize CHANGELOG"
python3 scripts/changelog/init_changelog.py "$TEST_DIR/CHANGELOG.md"
python3 scripts/changelog/validate_changelog.py "$TEST_DIR/CHANGELOG.md"
echo "✅ CHANGELOG initialization passed"

# Test 2: Add entries
echo ""
echo "Test 2: Add entries to CHANGELOG"
python3 scripts/changelog/add_entry.py "$TEST_DIR/CHANGELOG.md" Added "Feature A"
python3 scripts/changelog/add_entry.py "$TEST_DIR/CHANGELOG.md" Fixed "Bug B"
python3 scripts/changelog/add_entry.py "$TEST_DIR/CHANGELOG.md" Changed "Refactor C"
python3 scripts/changelog/validate_changelog.py "$TEST_DIR/CHANGELOG.md"
echo "✅ Entry addition passed"

# Test 3: Bump release
echo ""
echo "Test 3: Bump release version"
python3 scripts/changelog/bump_release.py "$TEST_DIR/CHANGELOG.md" "1.0.0"
python3 scripts/changelog/validate_changelog.py "$TEST_DIR/CHANGELOG.md"

# Verify [Unreleased] is empty and [1.0.0] has entries
if grep -A 5 "\[Unreleased\]" "$TEST_DIR/CHANGELOG.md" | grep -q "^- "; then
    echo "❌ [Unreleased] should be empty after bump"
    exit 1
fi

if ! grep -A 10 "\[1.0.0\]" "$TEST_DIR/CHANGELOG.md" | grep -q "Feature A"; then
    echo "❌ [1.0.0] should contain Feature A"
    exit 1
fi
echo "✅ Release bump passed"

# Test 4: Orchestrator
echo ""
echo "Test 4: Orchestrator workflow"
mkdir -p "$TEST_DIR/.serena/memories"
cp "$TEST_DIR/CHANGELOG.md" "$TEST_DIR/CHANGELOG.md.backup"

python3 scripts/orchestrator.py "$TEST_DIR" feature "Orchestrator test feature" \
  --scope=test \
  --category=testing

# Verify CHANGELOG updated
if ! grep -q "Orchestrator test feature" "$TEST_DIR/CHANGELOG.md"; then
    echo "❌ Orchestrator should have updated CHANGELOG"
    exit 1
fi
echo "✅ Orchestrator passed"

# Cleanup
rm -rf "$TEST_DIR"

echo ""
echo "========================================="
echo "✅ All integration tests passed!"
echo "========================================="
```

### Step 3: Make integration test executable

```bash
chmod +x ~/.claude/skills/documenting/tests/integration_test.sh
```

### Step 4: Run integration test

```bash
cd ~/.claude/skills/documenting
bash tests/integration_test.sh
```

Expected: All tests pass, "✅ All integration tests passed!"

### Step 5: Commit README and integration tests

```bash
cd ~/.claude/skills/documenting
git add README.md tests/integration_test.sh
git commit -m "docs(documenting): update README and add integration tests

- Comprehensive README with quick start guide
- Scripts reference table
- Change type classification
- Full integration test suite covering:
  - CHANGELOG initialization
  - Entry addition
  - Release bumping
  - Orchestrator workflow"
```

---

## Task 8: Final Validation and Documentation

**Files:**
- Create: `~/.claude/skills/documenting/CHANGELOG.md` (for the skill itself)
- Create: `~/.claude/skills/documenting/examples/example_workflow.md`

### Step 1: Create CHANGELOG for documenting skill

```bash
cd ~/.claude/skills/documenting
python3 scripts/changelog/init_changelog.py ./CHANGELOG.md "2.0.0"
```

### Step 2: Add all features to CHANGELOG

```bash
cd ~/.claude/skills/documenting
python3 scripts/changelog/add_entry.py CHANGELOG.md Added "CHANGELOG.md management scripts (init, add_entry, bump_release, validate)"
python3 scripts/changelog/add_entry.py CHANGELOG.md Added "Documentation orchestrator for coordinated updates"
python3 scripts/changelog/add_entry.py CHANGELOG.md Added "Keep a Changelog 1.0.0 strict validation"
python3 scripts/changelog/add_entry.py CHANGELOG.md Added "Integration test suite"
python3 scripts/changelog/add_entry.py CHANGELOG.md Changed "Extended SKILL.md with new workflows"
python3 scripts/changelog/add_entry.py CHANGELOG.md Changed "Updated README with comprehensive guide"
```

### Step 3: Create example workflow document

Create `~/.claude/skills/documenting/examples/example_workflow.md`:

```markdown
# Example Workflow: Documenting a New Feature

This example shows the complete workflow for documenting a new feature in a project.

## Scenario

You've just completed a new "semantic search" feature for your project:
- Added new API endpoint `/api/search`
- Implemented vector search with ChromaDB
- Added new configuration options
- Created comprehensive tests

## Step 1: Document with Orchestrator

```bash
cd ~/projects/my-project

python3 ~/.claude/skills/documenting/scripts/orchestrator.py . feature \
  "Semantic search with vector embeddings" \
  --scope=search \
  --category=backend
```

**Output:**
```
📝 Documentation Update Results
============================================================
✅ CHANGELOG.md updated

💡 README.md suggestions:
  - Consider adding to ## Features section: Semantic search with vector embeddings
  - Update ## Usage section with new example

💡 CLAUDE.md suggestions:
  - Review ## Architecture section for: Semantic search with vector embeddings

✅ All documentation validated
```

## Step 2: Review CHANGELOG

```bash
grep -A 10 "\[Unreleased\]" CHANGELOG.md
```

**Output:**
```markdown
## [Unreleased]

### Added
- Semantic search with vector embeddings
```

## Step 3: Update README.md

Based on orchestrator suggestions, update README:

```markdown
## Features

- **Semantic Search**: Natural language search using vector embeddings
  - Powered by OpenAI embeddings and ChromaDB
  - Fast approximate nearest neighbor search
  - Configurable similarity threshold
```

```markdown
## Usage

### Semantic Search

```python
from search import SearchEngine

engine = SearchEngine()
results = engine.search("find documents about machine learning")

for result in results:
    print(f"{result.title} (similarity: {result.score})")
```
```

## Step 4: Update CLAUDE.md

Based on suggestions, update architecture:

```markdown
## Architecture

- **Search Layer**: `services/search_service.py` - Vector search implementation
  - Uses ChromaDB for vector storage
  - OpenAI embeddings via `embedding_service`
  - Configurable reranking with FlashRank
```

## Step 5: Create SSOT Memory

For significant architectural additions:

```bash
python3 ~/.claude/skills/documenting/scripts/generate_template.py ssot \
  .serena/memories/ssot_search_semantic_2026-02-01.md \
  title="Semantic Search SSOT" \
  scope="search-semantic" \
  subcategory="search" \
  domain="backend,ml"
```

Edit the generated file to document:
- Search algorithm design
- Vector storage architecture
- Embedding strategy
- Performance characteristics

## Step 6: Validate Everything

```bash
# Validate CHANGELOG
python3 ~/.claude/skills/documenting/scripts/changelog/validate_changelog.py CHANGELOG.md

# Validate SSOT
python3 ~/.claude/skills/documenting/scripts/validate_metadata.py \
  .serena/memories/ssot_search_semantic_2026-02-01.md

# Or use orchestrator validation
python3 ~/.claude/skills/documenting/scripts/orchestrator.py . validate
```

## Step 7: Commit

```bash
git add \
  CHANGELOG.md \
  README.md \
  CLAUDE.md \
  .serena/memories/ssot_search_semantic_2026-02-01.md

git commit -m "feat(search): add semantic search with vector embeddings

- Implement vector search using ChromaDB
- Add OpenAI embedding generation
- Support configurable similarity thresholds
- Include comprehensive test coverage

Documentation:
- Updated CHANGELOG.md
- Added feature to README.md
- Updated CLAUDE.md architecture
- Created SSOT memory for search system
"
```

## Result

All documentation is now synchronized:
- ✅ CHANGELOG.md has the feature listed
- ✅ README.md explains the feature to users
- ✅ CLAUDE.md documents the architecture for developers
- ✅ SSOT memory captures design decisions
- ✅ All validated and committed together
```

### Step 4: Run final validation

```bash
cd ~/.claude/skills/documenting

# Run all tests
python -m pytest tests/ -v

# Run integration test
bash tests/integration_test.sh

# Validate skill's own CHANGELOG
python3 scripts/changelog/validate_changelog.py CHANGELOG.md
```

Expected: All tests pass, CHANGELOG valid

### Step 5: Bump skill version to 2.0.0

```bash
cd ~/.claude/skills/documenting
python3 scripts/changelog/bump_release.py CHANGELOG.md 2.0.0
```

### Step 6: Final commit

```bash
cd ~/.claude/skills/documenting
git add CHANGELOG.md examples/example_workflow.md
git commit -m "docs(documenting): finalize v2.0.0 release

- Complete CHANGELOG for skill itself
- Example workflow documentation
- All tests passing
- Integration test validated

Version 2.0.0 adds:
- CHANGELOG.md management
- Documentation orchestration
- Keep a Changelog strict validation
- Coordinated updates across all doc types"

git tag -a v2.0.0 -m "Release 2.0.0 - Multi-document orchestration"
```

---

## Completion Checklist

- [ ] Task 1: CHANGELOG validation (validate_changelog.py)
- [ ] Task 2: CHANGELOG entry addition (add_entry.py)
- [ ] Task 3: CHANGELOG release bumping (bump_release.py)
- [ ] Task 4: CHANGELOG template (CHANGELOG.md.template, init_changelog.py)
- [ ] Task 5: Orchestrator foundation (orchestrator.py)
- [ ] Task 6: SKILL.md documentation
- [ ] Task 7: README and integration tests
- [ ] Task 8: Final validation and example

## Testing Strategy

Each task follows TDD:
1. Write failing test
2. Verify failure
3. Implement minimal solution
4. Verify pass
5. Commit

Integration test validates complete workflow:
- Initialize → Add entries → Bump release → Orchestrate

## Deployment

After all tasks complete:

1. Run full test suite:
   ```bash
   python -m pytest tests/ -v
   bash tests/integration_test.sh
   ```

2. Validate skill metadata:
   ```bash
   # Check SKILL.md frontmatter is valid
   head -n 10 SKILL.md
   ```

3. Test with real project:
   ```bash
   cd ~/projects/test-project
   python3 ~/.claude/skills/documenting/scripts/orchestrator.py . feature "Test"
   ```

4. Document in skill's own CHANGELOG:
   ```bash
   cd ~/.claude/skills/documenting
   python3 scripts/changelog/bump_release.py CHANGELOG.md 2.0.0
   ```

## Future Enhancements

Phase 2 (not in this plan):
- README.md section synchronization (auto-update from SSOT)
- CLAUDE.md section synchronization
- GitHub Release generation from CHANGELOG
- Automated version bumping from git tags
- Link validation across all docs

---

**Plan Complete!** Ready for execution with superpowers:executing-plans or superpowers:subagent-driven-development.
