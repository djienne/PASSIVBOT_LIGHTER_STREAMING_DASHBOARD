"""Thin SSH transport abstraction with two implementations:

- ``AsyncSSHClient``  — production. Single persistent asyncssh connection
  reused across polls. Automatic reconnect with exponential backoff.
- ``FakeSSHClient``   — test/replay. Reads fixtures from disk instead of
  running SSH. Selected via settings.use_fake_ssh.

Both expose the same narrow contract:

    read_file(remote_path) -> bytes
    file_stat(remote_path) -> (mtime_ms, size_bytes)
    tail_bytes(remote_path, offset) -> (bytes, new_offset)
    health_lines(remote_path) -> bytes

When REMOTE_DOCKER_CONTAINER is set, file-oriented commands are run through
`docker exec` on the remote VPS so the dashboard can read a bot filesystem
that exists only inside the remote container.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Protocol

from ..config import settings
from ..logging import log


class SSHTransport(Protocol):
    async def connect(self) -> None: ...
    async def close(self) -> None: ...
    async def read_file(self, remote_path: str) -> bytes: ...
    async def file_stat(self, remote_path: str) -> tuple[int, int]: ...
    async def tail_bytes(self, remote_path: str, offset: int) -> tuple[bytes, int]: ...
    async def health_lines(self, remote_path: str) -> bytes: ...
    async def run_command(self, cmd: str) -> bytes: ...


class AsyncSSHClient:
    def __init__(self) -> None:
        self._conn = None  # type: ignore[assignment]
        self._lock = asyncio.Lock()
        self._backoff = 1.0

    async def connect(self) -> None:
        import asyncssh  # imported lazily so tests without asyncssh still work
        async with self._lock:
            if self._conn is not None:
                return
            known_hosts = (
                str(settings.ssh_known_hosts_path)
                if settings.ssh_known_hosts_path is not None
                else None
            )
            while True:
                try:
                    self._conn = await asyncssh.connect(
                        host=settings.vps_host,
                        username=settings.vps_user,
                        client_keys=[str(settings.ssh_key_path)],
                        known_hosts=known_hosts,
                        connect_timeout=10,
                    )
                    self._backoff = 1.0
                    log.info("ssh: connected", host=settings.vps_host)
                    return
                except Exception as exc:  # noqa: BLE001
                    log.warning("ssh: connect failed", error=str(exc), backoff=self._backoff)
                    await asyncio.sleep(self._backoff)
                    self._backoff = min(self._backoff * 2, 30.0)

    async def close(self) -> None:
        async with self._lock:
            if self._conn is not None:
                self._conn.close()
                await self._conn.wait_closed()
                self._conn = None

    async def _run(self, cmd: str) -> bytes:
        if self._conn is None:
            await self.connect()
        assert self._conn is not None
        try:
            res = await self._conn.run(cmd, check=False, encoding=None)
            if res.returncode != 0:
                stderr = (res.stderr or b"").decode(errors="replace") if isinstance(res.stderr, bytes) else str(res.stderr or "")
                raise RuntimeError(f"ssh cmd failed (rc={res.returncode}): {stderr[:200]}")
            return res.stdout if isinstance(res.stdout, bytes) else (res.stdout or "").encode()
        except Exception:
            # Force reconnect next time.
            await self.close()
            raise

    def _file_cmd(self, cmd: str) -> str:
        container = settings.remote_docker_container
        if not container:
            return cmd
        return f"docker exec {shell_quote(container)} sh -lc {shell_quote(cmd)}"

    async def run_command(self, cmd: str) -> bytes:
        return await self._run(cmd)

    async def read_file(self, remote_path: str) -> bytes:
        return await self._run(self._file_cmd(f"cat {shell_quote(remote_path)}"))

    async def file_stat(self, remote_path: str) -> tuple[int, int]:
        out = await self._run(self._file_cmd(f"stat -c %Y:%s {shell_quote(remote_path)}"))
        mtime_s, size = out.decode().strip().split(":")
        return int(mtime_s) * 1000, int(size)

    async def tail_bytes(self, remote_path: str, offset: int) -> tuple[bytes, int]:
        # Use a byte-offset tail, capped to the size observed before reading.
        # If offset exceeds file size, return empty.
        size_out = await self._run(self._file_cmd(f"stat -c %s {shell_quote(remote_path)}"))
        size = int(size_out.decode().strip())
        if offset >= size:
            return b"", size
        data = await self._run(self._file_cmd(
            f"tail -c +{offset + 1} {shell_quote(remote_path)} | head -c {size - offset}"
        ))
        return data, size

    async def health_lines(self, remote_path: str) -> bytes:
        cmd = (
            f"grep -h '\\[health\\]' {shell_quote(remote_path)} "
            f"{shell_quote(remote_path + '.1')} 2>/dev/null | tail -5"
        )
        return await self._run(self._file_cmd(cmd))


def shell_quote(s: str) -> str:
    # Minimal safe quoting for POSIX single-quoted args.
    return "'" + s.replace("'", "'\\''") + "'"


class FakeSSHClient:
    """Reads from local fixtures. Used by the replay harness and unit tests."""

    def __init__(self, fixtures_dir: Path | None = None) -> None:
        self.fixtures_dir = fixtures_dir or settings.fixtures_dir
        self._log_offsets: dict[str, int] = {}

    async def connect(self) -> None:
        return None

    async def close(self) -> None:
        return None

    def _resolve(self, remote_path: str) -> Path:
        name = Path(remote_path).name
        return self.fixtures_dir / name

    async def read_file(self, remote_path: str) -> bytes:
        # Remap VPS path -> local fixture file by basename.
        p = self._resolve(remote_path)
        if p.name == "lighter_01_pnls.json":
            p = self.fixtures_dir / "hype_pnls.sample.json"
        return p.read_bytes()

    async def file_stat(self, remote_path: str) -> tuple[int, int]:
        p = self._resolve(remote_path)
        if p.name == "lighter_01_pnls.json":
            p = self.fixtures_dir / "hype_pnls.sample.json"
        st = p.stat()
        return int(st.st_mtime * 1000), st.st_size

    async def tail_bytes(self, remote_path: str, offset: int) -> tuple[bytes, int]:
        p = self._resolve(remote_path)
        data = p.read_bytes() if p.exists() else b""
        if offset >= len(data):
            return b"", len(data)
        return data[offset:], len(data)

    async def health_lines(self, remote_path: str) -> bytes:
        return b""

    async def run_command(self, cmd: str) -> bytes:  # noqa: ARG002
        return b""


def make_transport() -> SSHTransport:
    if settings.use_fake_ssh:
        return FakeSSHClient()
    return AsyncSSHClient()
