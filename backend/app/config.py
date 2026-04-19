"""Runtime configuration loaded from .env + environment."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # VPS
    vps_host: str = "54.95.246.213"
    vps_user: str = "ubuntu"
    ssh_key_path: Path = REPO_ROOT / "infos" / "lighter.pem"
    remote_dir: str = "/home/ubuntu/passivbot_lighter"

    # Dashboard
    symbol: str = "HYPE"
    market_id: int = 24
    display_baseline: float = 800.0

    # Collector cadence
    poll_interval_seconds: float = 3.0

    # Backend bind
    backend_host: str = "127.0.0.1"
    backend_port: int = 8787

    # Lighter market data
    lighter_ws_url: str = "wss://mainnet.zklighter.elliot.ai/stream"
    lighter_rest_url: str = "https://mainnet.zklighter.elliot.ai"

    # Persistence
    database_path: Path = REPO_ROOT / "data" / "dashboard.db"

    # Logging
    log_level: str = "INFO"

    # Replay / test-only
    use_fake_ssh: bool = False
    fixtures_dir: Path = REPO_ROOT / "data" / "fixtures"

    # Remote paths derived
    @property
    def pnls_remote_path(self) -> str:
        return f"{self.remote_dir}/caches/lighter/lighter_01_pnls.json"

    @property
    def debug_log_remote_path(self) -> str:
        return f"{self.remote_dir}/logs/passivbot_debug.log"


settings = Settings()
