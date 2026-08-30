from datetime import UTC, datetime

import pytest

from app.domain.models import Direction, SignalReason
from app.services.market_scanner import MarketOpportunity, MarketScanResult
from app.services.timeframe_selector import choose_best_scan


def opportunity(
    *,
    symbol: str,
    direction: Direction,
    score: float,
    market_active: bool = True,
) -> MarketOpportunity:
    return MarketOpportunity(
        rank=1,
        symbol=symbol,
        description="Test market",
        category="Test",
        direction=direction,
        confidence=0.8,
        entry=100,
        stop_loss=99 if direction == Direction.buy else 101,
        take_profit=102 if direction == Direction.buy else 98,
        opportunity_score=score,
        estimated_move_pct=2,
        spread_pct=0.01,
        market_active=market_active,
        quote_age_seconds=1,
        recommendation="Candidate" if direction != Direction.hold else "Watch",
        reasons=[SignalReason("trend", "Trend confirmed.", "bullish", 0.4)],
    )


def scan(timeframe: str, *items: MarketOpportunity) -> MarketScanResult:
    return MarketScanResult(
        source="mt5",
        timeframe=timeframe,
        available_symbols=len(items),
        scanned_symbols=len(items),
        generated_at=datetime.now(UTC),
        disclaimer="Virtual test",
        opportunities=list(items),
    )


def test_choose_best_scan_prefers_strongest_active_direction() -> None:
    result = choose_best_scan(
        [
            scan("1m", opportunity(symbol="XAUUSD", direction=Direction.sell, score=46)),
            scan("15m", opportunity(symbol="BTCUSD", direction=Direction.buy, score=78)),
        ]
    )

    assert result.timeframe == "15m"


def test_choose_best_scan_ignores_inactive_and_hold_candidates() -> None:
    result = choose_best_scan(
        [
            scan("1m", opportunity(symbol="XAUUSD", direction=Direction.sell, score=99, market_active=False)),
            scan("5m", opportunity(symbol="BTCUSD", direction=Direction.hold, score=99)),
        ]
    )

    assert result.timeframe == "1m"


def test_choose_best_scan_requires_at_least_one_scan() -> None:
    with pytest.raises(ValueError):
        choose_best_scan([])
