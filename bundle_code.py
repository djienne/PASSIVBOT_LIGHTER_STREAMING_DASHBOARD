"""Bundle the dashboard source into one review-friendly Markdown file.

Usage:
    python bundle_code.py
    python bundle_code.py --output dashboard_review.md
    python bundle_code.py --no-tests --no-docs
    python bundle_code.py --include-fixtures --include-lockfiles
    python bundle_code.py --include-git-status
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import subprocess
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path


DEFAULT_OUTPUT = "dashboard_code_bundle.md"

BASE_INCLUDE_PATHS = [
    ".dockerignore",
    ".env.example",
    "Dockerfile",
    "docker-compose.yml",
    "backend/pyproject.toml",
    "backend/app",
    "frontend/package-lock.json",
    "frontend/package.json",
    "frontend/index.html",
    "frontend/postcss.config.js",
    "frontend/tailwind.config.ts",
    "frontend/tsconfig.json",
    "frontend/vite.config.ts",
    "frontend/src",
    "scripts",
]

DOC_PATHS = [
    "README.md",
    "docs",
    "LIGHTER_DASHBOARD_PLAN.md",
]

TEST_PATHS = [
    "backend/tests",
]

FIXTURE_PATHS = [
    "data/fixtures/hype_pnls.sample.json",
]

LOCKFILE_PATHS = [
    "frontend/package-lock.json",
]

EXCLUDED_PARTS = {
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
}

EXCLUDED_NAMES = {
    ".env",
    "stream_key.txt",
    "frontend/tsconfig.tsbuildinfo",
}

EXCLUDED_SUFFIXES = {
    ".db",
    ".gif",
    ".ico",
    ".jpg",
    ".jpeg",
    ".log",
    ".png",
    ".pyc",
    ".pyo",
    ".sqlite",
    ".tsbuildinfo",
    ".webp",
}

TEXT_SUFFIXES = {
    ".css",
    ".dockerignore",
    ".env",
    ".example",
    ".html",
    ".js",
    ".json",
    ".md",
    ".ps1",
    ".py",
    ".sh",
    ".sql",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}

SPECIAL_TEXT_NAMES = {
    ".dockerignore",
    ".env.example",
    "Dockerfile",
}

LANG_BY_SUFFIX = {
    ".css": "css",
    ".env": "dotenv",
    ".example": "dotenv",
    ".html": "html",
    ".js": "javascript",
    ".json": "json",
    ".md": "markdown",
    ".ps1": "powershell",
    ".py": "python",
    ".sh": "bash",
    ".sql": "sql",
    ".toml": "toml",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".txt": "text",
    ".yaml": "yaml",
    ".yml": "yaml",
}

LANG_BY_NAME = {
    ".dockerignore": "dockerignore",
    "Dockerfile": "dockerfile",
}


@dataclass(frozen=True)
class BundleFile:
    path: Path
    rel: str
    text: str
    byte_count: int

    @property
    def line_count(self) -> int:
        return self.text.count("\n") + (0 if self.text.endswith("\n") or not self.text else 1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Write relevant dashboard source/config files into one Markdown bundle.",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT,
        help=f"Output Markdown file path, relative to repo root by default. Default: {DEFAULT_OUTPUT}",
    )
    parser.add_argument(
        "--root",
        default=None,
        help="Repo root. Defaults to the directory containing bundle_code.py.",
    )
    parser.add_argument(
        "--no-docs",
        action="store_true",
        help="Exclude README and docs.",
    )
    parser.add_argument(
        "--no-tests",
        action="store_true",
        help="Exclude backend tests.",
    )
    parser.add_argument(
        "--include-fixtures",
        action="store_true",
        help="Include the small PnL fixture used by replay/parser tests.",
    )
    parser.add_argument(
        "--include-lockfiles",
        action="store_true",
        help="Include lockfiles such as frontend/package-lock.json.",
    )
    parser.add_argument(
        "--include-git-status",
        action="store_true",
        help="Include `git status --short` in the bundle header.",
    )
    parser.add_argument(
        "--max-file-bytes",
        type=int,
        default=250_000,
        help="Skip individual text files larger than this many bytes. Default: 250000.",
    )
    return parser.parse_args()


def repo_root(args: argparse.Namespace) -> Path:
    if args.root:
        return Path(args.root).expanduser().resolve()
    return Path(__file__).resolve().parent


def include_paths(args: argparse.Namespace) -> list[str]:
    paths = list(BASE_INCLUDE_PATHS)
    if not args.no_docs:
        paths.extend(DOC_PATHS)
    if not args.no_tests:
        paths.extend(TEST_PATHS)
    if args.include_fixtures:
        paths.extend(FIXTURE_PATHS)
    if args.include_lockfiles:
        paths.extend(LOCKFILE_PATHS)
    return paths


def is_excluded(path: Path, root: Path, output_path: Path) -> bool:
    try:
        rel_path = path.relative_to(root)
    except ValueError:
        return True
    rel = rel_path.as_posix()

    if path.resolve() == output_path.resolve():
        return True
    if rel.startswith("dashboard_code_bundle") and rel.endswith(".md"):
        return True
    if is_env_secret(path, rel):
        return True
    if rel in EXCLUDED_NAMES or path.name in EXCLUDED_NAMES:
        return True
    if any(part in EXCLUDED_PARTS for part in rel_path.parts):
        return True
    return path.suffix.lower() in EXCLUDED_SUFFIXES


def is_env_secret(path: Path, rel: str) -> bool:
    if rel == ".env.example":
        return False
    return path.name == ".env" or path.name.startswith(".env.")


def is_text_candidate(path: Path) -> bool:
    return path.name in SPECIAL_TEXT_NAMES or path.suffix.lower() in TEXT_SUFFIXES


def iter_tree_files(path: Path) -> Iterator[Path]:
    for dirpath, dirnames, filenames in os.walk(path):
        dirnames[:] = [name for name in dirnames if name not in EXCLUDED_PARTS]
        for filename in filenames:
            yield Path(dirpath) / filename


def walk_candidates(paths: list[str], root: Path, output_path: Path) -> tuple[list[Path], list[str]]:
    candidates: list[Path] = []
    missing: list[str] = []

    for item in paths:
        path = (root / item).resolve()
        if not path.exists():
            missing.append(item)
            continue
        if path.is_file():
            if not is_excluded(path, root, output_path) and is_text_candidate(path):
                candidates.append(path)
            continue
        for child in iter_tree_files(path):
            if child.is_file() and not is_excluded(child, root, output_path) and is_text_candidate(child):
                candidates.append(child)

    unique = sorted(set(candidates), key=lambda p: p.relative_to(root).as_posix().lower())
    return unique, missing


def load_files(paths: list[Path], root: Path, max_file_bytes: int) -> tuple[list[BundleFile], list[str]]:
    files: list[BundleFile] = []
    skipped: list[str] = []

    for path in paths:
        rel = path.relative_to(root).as_posix()
        file_size = path.stat().st_size
        if file_size > max_file_bytes:
            skipped.append(f"{rel} ({file_size} bytes, over limit)")
            continue
        data = path.read_bytes()
        if b"\x00" in data:
            skipped.append(f"{rel} (binary-looking file)")
            continue
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            skipped.append(f"{rel} (not UTF-8)")
            continue
        files.append(BundleFile(path=path, rel=rel, text=text, byte_count=len(data)))

    return files, skipped


def git_value(root: Path, *args: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=root,
            text=True,
            capture_output=True,
            check=False,
        )
    except OSError:
        return None
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def language_for(rel: str) -> str:
    path = Path(rel)
    if path.name in LANG_BY_NAME:
        return LANG_BY_NAME[path.name]
    return LANG_BY_SUFFIX.get(path.suffix.lower(), "")


def fence_for(text: str) -> str:
    longest = 0
    current = 0
    for char in text:
        if char == "`":
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return "`" * max(3, longest + 1)


def build_markdown(
    root: Path,
    files: list[BundleFile],
    missing: list[str],
    skipped: list[str],
    include_git_status: bool,
) -> str:
    generated = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    commit = git_value(root, "rev-parse", "--short", "HEAD") or "unknown"
    status = (git_value(root, "status", "--short") or "") if include_git_status else ""
    total_bytes = sum(f.byte_count for f in files)
    total_lines = sum(f.line_count for f in files)

    out: list[str] = []
    out.append("# Dashboard Code Bundle")
    out.append("")
    out.append(f"Generated: {generated}")
    out.append(f"Repo: `{root}`")
    out.append(f"Git commit: `{commit}`")
    out.append(f"Files bundled: {len(files)}")
    out.append(f"Total lines: {total_lines}")
    out.append(f"Total bytes: {total_bytes}")
    out.append("")
    out.append("This bundle intentionally excludes secrets, local `.env` files, SSH keys, databases, logs, build output, node modules, virtualenvs, and binary media.")
    out.append("")

    if status:
        out.append("## Working Tree Status")
        out.append("")
        out.append("```text")
        out.append(status)
        out.append("```")
        out.append("")

    out.append("## File Manifest")
    out.append("")
    out.append("| Path | Lines | Bytes |")
    out.append("|---|---:|---:|")
    for file in files:
        out.append(f"| `{file.rel}` | {file.line_count} | {file.byte_count} |")
    out.append("")

    if missing or skipped:
        out.append("## Not Bundled")
        out.append("")
        for item in missing:
            out.append(f"- Missing include path: `{item}`")
        for item in skipped:
            out.append(f"- Skipped: `{item}`")
        out.append("")

    out.append("## Contents")
    out.append("")
    for file in files:
        lang = language_for(file.rel)
        fence = fence_for(file.text)
        out.append(f"### `{file.rel}`")
        out.append("")
        out.append(f"{fence}{lang}")
        out.append(file.text.rstrip("\n"))
        out.append(fence)
        out.append("")

    return "\n".join(out)


def main() -> int:
    args = parse_args()
    root = repo_root(args)
    output_path = Path(args.output).expanduser()
    if not output_path.is_absolute():
        output_path = root / output_path
    output_path = output_path.resolve()

    paths, missing = walk_candidates(include_paths(args), root, output_path)
    files, skipped = load_files(paths, root, args.max_file_bytes)
    markdown = build_markdown(root, files, missing, skipped, args.include_git_status)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(markdown, encoding="utf-8", newline="\n")
    print(f"Wrote {output_path}")
    print(f"Bundled {len(files)} files, {sum(f.line_count for f in files)} lines")
    if missing or skipped:
        print(f"Not bundled: {len(missing) + len(skipped)} entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
