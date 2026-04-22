"""
Backup a remote directory over SSH by streaming a tar.gz to a local file.

Security notes
--------------
- This script is intended for authorized backups only.
- It *excludes common secret/key/log patterns by default* to reduce the chance
  of accidentally collecting sensitive material.
- If you need a full-fidelity backup including secrets, use your organization's
  approved backup/KMS process instead of changing this script.
"""

from __future__ import annotations

import argparse
import os
import shlex
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

# Default connection info. Keep placeholders in shared code and provide real
# values through CLI args, SSH config, or environment variables.
DEFAULT_HOST = "your-vps-host"
DEFAULT_USER = "ubuntu"
DEFAULT_KEY_FILE = Path(__file__).parent / "lighter.pem"
DEFAULT_REMOTE_DIR = "/home/ubuntu/passivbot_lighter"


DEFAULT_EXCLUDES = (
    # Secrets / credentials
    ".ssh",
    ".ssh/*",
    "*.pem",
    "*.key",
    "*id_rsa*",
    "*id_ed25519*",
    # Logs (often contain tokens/PII)
    "logs",
    "logs/*",
    "*.log",
    # Python build artifacts
    "__pycache__",
    "__pycache__/*",
    "*.pyc",
    "*.pyo",
    ".venv",
    ".venv/*",
    "venv",
    "venv/*",
)


@dataclass(frozen=True)
class RemotePath:
    base_dir: str
    name: str


def _parse_remote_path(remote_path: str) -> RemotePath:
    # Treat remote paths as POSIX for SSH targets.
    p = PurePosixPath(remote_path)
    if not p.is_absolute():
        raise ValueError("--remote-path must be an absolute POSIX path (e.g. /opt/passivbot)")
    if str(p) == "/":
        raise ValueError("--remote-path must not be /")
    base_dir = str(p.parent)
    name = p.name
    if not name:
        raise ValueError("Invalid --remote-path")
    return RemotePath(base_dir=base_dir, name=name)


def _build_remote_tar_command(remote: RemotePath, extra_excludes: list[str]) -> str:
    excludes = list(DEFAULT_EXCLUDES) + list(extra_excludes)
    tar_args: list[str] = ["tar"]
    for pattern in excludes:
        tar_args.append(f"--exclude={pattern}")
    tar_args.extend(["-C", remote.base_dir, "-czf", "-", remote.name])
    # Build a single shell-quoted command string for the remote POSIX shell.
    return " ".join(shlex.quote(part) for part in tar_args)


def _run_backup(
    target: str,
    identity: str | None,
    port: int | None,
    remote: RemotePath,
    remote_cmd: str,
    out_path: str,
    overwrite: bool,
) -> None:
    ssh_base: list[str] = ["ssh"]
    if identity:
        ssh_base.extend(["-i", identity])
    if port is not None:
        ssh_base.extend(["-p", str(port)])

    # Remove any existing compressed files on the remote
    cleanup_patterns = [
        f"{remote.base_dir}/{remote.name}.tgz",
        f"{remote.base_dir}/{remote.name}.tar.gz",
    ]
    cleanup_cmd = "rm -f " + " ".join(shlex.quote(p) for p in cleanup_patterns)
    subprocess.run(ssh_base + [target, cleanup_cmd], check=False)

    # Run the backup
    ssh_cmd = ssh_base + [target, remote_cmd]
    open_mode = "wb" if overwrite else "xb"
    with open(out_path, open_mode) as f:
        subprocess.run(ssh_cmd, check=True, stdout=f)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(
        description="Stream a remote directory to a local .tgz via SSH (secrets/logs excluded by default)."
    )
    ap.add_argument(
        "--target",
        help="SSH target, e.g. my-host-alias (from ssh config) or user@host",
    )
    ap.add_argument("--host", help="Remote host (IP or DNS name), used with --user")
    ap.add_argument("--user", help="SSH username, used with --host")
    ap.add_argument("--identity", help="Path to SSH private key (optional; ssh config/agent also works)")
    ap.add_argument("--port", type=int, help="SSH port (optional; ssh config also works)")
    ap.add_argument(
        "--remote-path",
        help="Absolute POSIX path to the directory to archive (e.g. /opt/passivbot)",
    )
    ap.add_argument("--out", help="Output file path (default: <dir>.tgz)")
    ap.add_argument(
        "--exclude",
        action="append",
        default=[],
        help="Additional tar exclude pattern (can be repeated)",
    )
    ap.add_argument(
        "--no-overwrite",
        action="store_true",
        help="Fail if the output file already exists (default: overwrite)",
    )

    args = ap.parse_args(argv)

    # Environment variable fallbacks (to allow running with no args):
    # - PASSIVBOT_TARGET, or PASSIVBOT_HOST + PASSIVBOT_USER
    # - PASSIVBOT_IDENTITY (optional)
    # - PASSIVBOT_PORT (optional)
    # - PASSIVBOT_REMOTE_PATH
    # - PASSIVBOT_OUT (optional)
    # - PASSIVBOT_EXCLUDE (optional; comma-separated)
    env_target = os.environ.get("PASSIVBOT_TARGET")
    env_host = os.environ.get("PASSIVBOT_HOST")
    env_user = os.environ.get("PASSIVBOT_USER")
    env_identity = os.environ.get("PASSIVBOT_IDENTITY")
    env_port = os.environ.get("PASSIVBOT_PORT")
    env_remote_path = os.environ.get("PASSIVBOT_REMOTE_PATH")
    env_out = os.environ.get("PASSIVBOT_OUT")
    env_exclude = os.environ.get("PASSIVBOT_EXCLUDE")

    if args.target or env_target:
        target = args.target or env_target  # type: ignore[assignment]
    else:
        host = args.host or env_host or DEFAULT_HOST
        user = args.user or env_user or DEFAULT_USER
        target = f"{user}@{host}"

    identity: str | None = None
    identity_arg = args.identity or env_identity
    if identity_arg:
        identity = os.path.expanduser(identity_arg)
        if not os.path.exists(identity):
            ap.error(f"--identity does not exist: {identity}")
    elif DEFAULT_KEY_FILE.exists():
        identity = str(DEFAULT_KEY_FILE)

    port: int | None = args.port
    if port is None and env_port:
        try:
            port = int(env_port)
        except ValueError:
            ap.error("PASSIVBOT_PORT must be an integer if set")

    remote_path = args.remote_path or env_remote_path or DEFAULT_REMOTE_DIR

    try:
        remote = _parse_remote_path(remote_path)
    except ValueError as e:
        ap.error(str(e))

    extra_excludes = list(args.exclude)
    if env_exclude:
        extra_excludes.extend([p.strip() for p in env_exclude.split(",") if p.strip()])

    remote_cmd = _build_remote_tar_command(remote, extra_excludes)

    out_path = args.out or env_out
    if not out_path:
        out_path = f"{remote.name}.tgz"

    try:
        _run_backup(
            identity=identity,
            port=port,
            target=target,
            remote=remote,
            remote_cmd=remote_cmd,
            out_path=out_path,
            overwrite=not args.no_overwrite,
        )
    except FileExistsError:
        ap.error(f"Output file already exists: {out_path}")
    except subprocess.CalledProcessError as e:
        print(f"Backup failed (ssh/tar returned non-zero exit status): {e}", file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
