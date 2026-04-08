"""
Rebuild the graphify knowledge graph, respecting .graphifyignore.

Usage: python3 scripts/graphify-rebuild.py
"""
import sys
from pathlib import Path
from fnmatch import fnmatch

ROOT = Path(__file__).resolve().parent.parent

# Read .graphifyignore patterns
ignore_file = ROOT / ".graphifyignore"
ignore_patterns: list[str] = []
if ignore_file.exists():
    for line in ignore_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            ignore_patterns.append(line)

def is_ignored(path: Path) -> bool:
    rel = str(path.relative_to(ROOT))
    for pattern in ignore_patterns:
        # Directory pattern (ends with /)
        if pattern.endswith("/"):
            if any(part == pattern.rstrip("/") for part in path.relative_to(ROOT).parts):
                return True
        elif fnmatch(rel, pattern) or fnmatch(path.name, pattern):
            return True
    return False

# Monkey-patch collect_files to filter ignored paths
import graphify.extract as _ext
_original_collect = _ext.collect_files

def _filtered_collect(target: Path, **kwargs) -> list[Path]:
    files = _original_collect(target, **kwargs)
    filtered = [f for f in files if not is_ignored(f)]
    print(f"[graphify] {len(files)} files found, {len(files) - len(filtered)} ignored, {len(filtered)} to process")
    return filtered

_ext.collect_files = _filtered_collect

# Now rebuild
from graphify.watch import _rebuild_code
success = _rebuild_code(ROOT)
sys.exit(0 if success else 1)
