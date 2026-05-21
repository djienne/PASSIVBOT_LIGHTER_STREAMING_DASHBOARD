"""Runtime configuration loaded from .env + environment."""

from __future__ import annotations

from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


def _resolve_from_repo(value: Path | str | None) -> Path | None:
    if value is None:
        return None
    path = Path(value).expanduser()
    if str(path) == ".":
        return None
    if path.is_absolute():
        return path
    return REPO_ROOT / path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Shared repo defaults stay generic; set real connection details in .env.
    # This keeps the public repo free of private infrastructure details.
    # VPS
    vps_host: str = "your-vps-host"
    vps_user: str = "ubuntu"
    ssh_key_path: Path = Path("infos/lighter.pem")
    ssh_known_hosts_path: Path | None = None
    require_ssh_on_start: bool = False
    remote_docker_container: str | None = None
    remote_dir: str = "/home/ubuntu/passivbot_lighter"

    # Dashboard
    symbol: str = "HYPE"
    market_id: int = 24
    starting_capital_fallback: float = 651.86
    # Deprecated compatibility name. Use STARTING_CAPITAL_FALLBACK for new setups.
    display_baseline: float = 651.86

    # Collector cadence
    poll_interval_seconds: float = 3.0

    # Backend bind
    backend_host: str = "127.0.0.1"
    backend_port: int = 8787
    frontend_dist: Path = Path("frontend/dist")
    enable_dev_routes: bool = False

    # Lighter market data
    lighter_ws_url: str = "wss://mainnet.zklighter.elliot.ai/stream"
    lighter_rest_url: str = "https://mainnet.zklighter.elliot.ai"

    # Persistence
    database_path: Path = Path("data/dashboard.db")

    # Logging
    log_level: str = "INFO"

    # Replay / test-only
    use_fake_ssh: bool = False
    fixtures_dir: Path = Path("data/fixtures")

    @field_validator("ssh_key_path", "database_path", "fixtures_dir", "frontend_dist", mode="after")
    @classmethod
    def _resolve_required_path(cls, value: Path) -> Path:
        resolved = _resolve_from_repo(value)
        if resolved is None:
            raise ValueError("path setting cannot be empty")
        return resolved

    @field_validator("ssh_known_hosts_path", mode="before")
    @classmethod
    def _empty_optional_path_to_none(cls, value: object) -> object:
        if value is None or value == "":
            return None
        return value

    @field_validator("remote_docker_container", mode="before")
    @classmethod
    def _empty_optional_str_to_none(cls, value: object) -> object:
        if value is None or value == "":
            return None
        return value

    @field_validator("ssh_known_hosts_path", mode="after")
    @classmethod
    def _resolve_optional_path(cls, value: Path | None) -> Path | None:
        return _resolve_from_repo(value)

    # Remote paths derived
    @property
    def pnls_remote_path(self) -> str:
        return f"{self.remote_dir}/caches/lighter/lighter_01_pnls.json"

    @property
    def debug_log_remote_path(self) -> str:
        return f"{self.remote_dir}/logs/passivbot_debug.log"

    @property
    def ssh_target_configured(self) -> bool:
        return bool(self.vps_host and self.vps_host != "your-vps-host")


settings = Settings()
