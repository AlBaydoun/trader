from datetime import UTC, datetime, timedelta

from app.domain.models import Candle, Direction
from app.services.candlestick_patterns import detect_candlestick_patterns


def candle(
    index: int, opening: float, closing: float, high: float | None = None, low: float | None = None
) -> Candle:
    return Candle(
        symbol="TEST",
        timeframe="15m",
        ts=datetime(2026, 1, 1, tzinfo=UTC) + timedelta(minutes=index * 15),
        open=opening,
        high=high if high is not None else max(opening, closing) + 1,
        low=low if low is not None else min(opening, closing) - 1,
        close=closing,
        volume=100,
        source="mt5",
    )


def test_detects_bullish_engulfing_and_direction() -> None:
    patterns = detect_candlestick_patterns(
        [
            candle(0, 101, 100),
            candle(1, 100, 98),
            candle(2, 97.5, 101, high=102, low=97),
        ]
    )

    match = next(pattern for pattern in patterns if pattern.id == "bullish-engulfing")
    assert match.direction == Direction.buy
    assert match.label == "Bullish engulfing"


def test_detects_morning_star_and_doji() -> None:
    morning = detect_candlestick_patterns(
        [candle(0, 105, 100), candle(1, 99.8, 100.2), candle(2, 100, 104)]
    )
    doji = detect_candlestick_patterns(
        [candle(0, 100, 99), candle(1, 99, 99), candle(2, 99, 99.05, high=100, low=98)]
    )

    assert any(
        pattern.id == "morning-star" and pattern.direction == Direction.buy for pattern in morning
    )
    assert any(pattern.id == "doji" and pattern.direction == Direction.hold for pattern in doji)


def test_detects_three_black_crows() -> None:
    patterns = detect_candlestick_patterns(
        [candle(0, 103, 100), candle(1, 102, 99), candle(2, 101, 98)]
    )

    match = next(pattern for pattern in patterns if pattern.id == "three-black-crows")
    assert match.direction == Direction.sell
