from __future__ import annotations

from app.collector.dedupe import LRUSet, fill_event_id


def test_lru_add_returns_true_once():
    s = LRUSet(max_size=3)
    assert s.add("a") is True
    assert s.add("a") is False
    assert s.add("b") is True
    assert s.add("c") is True
    # Eviction once we push a 4th — "a" is oldest after the 2nd add_a (which moved it to end),
    # so "b" is actually the oldest candidate for eviction.
    s.add("d")
    # Order after inserts: a (moved), b, c, d -> evict a
    assert "a" not in s
    assert "d" in s


def test_native_id_beats_fingerprint():
    a = fill_event_id("HYPE/USDC:USDC", 1774015215376, "buy", 2.06, 38.9577, raw_id="12345")
    b = fill_event_id("HYPE/USDC:USDC", 1774015215376, "buy", 2.06, 38.9577, raw_id=None)
    assert a.startswith("lighter:12345")
    assert b.startswith("fp:")


def test_fingerprint_stable_across_calls():
    a1 = fill_event_id("HYPE", 100, "buy", 1.0, 2.0, raw_id=None)
    a2 = fill_event_id("HYPE", 100, "buy", 1.0, 2.0, raw_id=None)
    assert a1 == a2
