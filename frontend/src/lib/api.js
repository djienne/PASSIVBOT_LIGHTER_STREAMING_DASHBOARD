export async function fetchBootstrap(since) {
    const qs = since != null ? `?since=${since}` : "";
    const res = await fetch(`/api/bootstrap${qs}`);
    if (!res.ok)
        throw new Error(`bootstrap failed: ${res.status}`);
    return res.json();
}
export async function fetchHealth() {
    const res = await fetch("/api/health");
    if (!res.ok)
        throw new Error(`health failed: ${res.status}`);
    return res.json();
}
