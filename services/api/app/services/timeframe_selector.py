from collections.abc import Sequence

from app.domain.models import Direction
from app.services.market_scanner import MarketScanResult


def choose_best_scan(scans: Sequence[MarketScanResult]) -> MarketScanResult:
    """Choose the strongest current directional scan without lowering entry standards."""
    if not scans:
        raise ValueError("At least one market scan is required.")
    return max(scans, key=_scan_rank)


def _scan_rank(scan: MarketScanResult) -> tuple[int, float, float, float]:
    candidates = [
        item
        for item in scan.opportunities
        if item.market_active and item.direction != Direction.hold
    ]
    if not candidates:
        return (0, 0.0, 0.0, 0.0)
    strongest = max(
        candidates,
        key=lambda item: (
            item.opportunity_score,
            item.confidence,
            -item.spread_pct,
        ),
    )
    return (
        1,
        strongest.opportunity_score,
        strongest.confidence,
        -strongest.spread_pct,
    )
