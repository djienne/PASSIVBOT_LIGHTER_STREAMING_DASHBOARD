"""VPS → Lighter latency probe.

Runs a 5-sample ICMP ping from the VPS itself to Lighter's mainnet host once
every 5 minutes. Parses the summary line (`rtt min/avg/max/mdev = …`) and
publishes a `VpsLatencySnapshot`.

The VPS is in AWS Tokyo (ap-northeast-1), which is why these numbers tend to
sit around 1–2 ms — a fun "show-off" metric on the broadcast layout.

If ICMP is filtered, we fall back to a TCP-connect timer against 443 via
`curl -w "%{time_connect}"`, which approximates one TCP handshake.
"""

from __future__ import annotations

import asyncio
import re

from ..envelope import now_ms
from ..events.bus import bus
from ..logging import log
from ..models import VpsLatencySnapshot
from ..persistence import repos

TARGET = "mainnet.zklighter.elliot.ai"
_PING_SUMMARY = re.compile(
    r"rtt min/avg/max/mdev = ([\d.]+)/([\d.]+)/([\d.]+)/([\d.]+) ms"
)


async def _probe_icmp(transport) -> VpsLatencySnapshot | None:  # type: ignore[no-untyped-def]
    out = await transport.run_command(f"ping -c 5 -W 2 {TARGET} 2>&1 | tail -3")
    m = _PING_SUMMARY.search(out.decode(errors="replace"))
    if not m:
        return None
    return VpsLatencySnapshot(
        ts=now_ms(),
        avg_ms=float(m.group(2)),
        min_ms=float(m.group(1)),
        max_ms=float(m.group(3)),
        jitter_ms=float(m.group(4)),
        samples=5,
        method="icmp",
    )


async def _probe_tcp(transport) -> VpsLatencySnapshot | None:  # type: ignore[no-untyped-def]
    # 5 handshakes, take the min — approximates the network floor.
    cmd = (
        "for i in 1 2 3 4 5; do "
        f"curl --connect-timeout 2 --max-time 4 -o /dev/null -s -w '%{{time_connect}}\\n' https://{TARGET}/; "
        "done"
    )
    out = await transport.run_command(cmd)
    samples = []
    for line in out.decode(errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            samples.append(float(line) * 1000)
        except ValueError:
            continue
    if not samples:
        return None
    avg = sum(samples) / len(samples)
    return VpsLatencySnapshot(
        ts=now_ms(),
        avg_ms=round(avg, 3),
        min_ms=round(min(samples), 3),
        max_ms=round(max(samples), 3),
        jitter_ms=None,
        samples=len(samples),
        method="tcp",
    )


class VpsLatencyProbe:
    def __init__(self, transport) -> None:  # type: ignore[no-untyped-def]
        self.t = transport

    async def probe_once(self) -> VpsLatencySnapshot | None:
        try:
            snap = await _probe_icmp(self.t)
            if snap is not None:
                return snap
            return await _probe_tcp(self.t)
        except Exception as exc:  # noqa: BLE001
            log.warning("vps_latency: probe failed", error=str(exc))
            return None

    async def run(self) -> None:
        log.info("vps_latency: starting")
        # Small initial delay so it doesn't race the collector's SSH setup.
        await asyncio.sleep(10)
        while True:
            snap = await self.probe_once()
            if snap is not None:
                async with repos.transaction():
                    await repos.save_vps_latency(snap)
                await bus.publish("vps_latency.update", snap)
                log.info("vps_latency: sample", avg_ms=snap.avg_ms, method=snap.method)
            # 5-minute cadence — this is a "show off" number, not a control signal.
            await asyncio.sleep(300)
