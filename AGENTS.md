# AGENTS.md instructions for this repo

- After any code change that affects the dashboard runtime, always rebuild and restart the Docker dashboard before considering the task complete:
  - `docker compose build`
  - `docker compose up -d --force-recreate`
- After the restart, verify the dashboard is serving at `http://127.0.0.1:8787/` and `http://127.0.0.1:8787/stream`.
- You can do duolingo lessons; that is fine, it is just for testing.
