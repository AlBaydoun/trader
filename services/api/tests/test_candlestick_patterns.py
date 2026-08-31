from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.domain.models import Candle, Direction
from app.services.accounts import BrokerAccountProfile
from app.services.candlestick_patterns import (
    CandlestickPatternBotService,
    detect_candlestick_patterns,
)
from app.services.mt5_bridge import MT5MarketSymbol
from app.services.paper_trading import PaperTradingService


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


class PatternBridge:
    def __init__(self, candles: list[Candle]) -> None:
        self.candles = candles

    def scan_market_candles(
        self,
        account: BrokerAccountProfile,
        timeframe: str,
        limit: int,
        max_symbols: int,
        force: bool = False,
    ) -> tuple[list[MT5MarketSymbol], dict[str, list[Candle]]]:
        del account, timeframe, limit, max_symbols, force
        latest = self.candles[-1]
        return [
            MT5MarketSymbol(
                symbol="TEST",
                description="Test market",
                category="Test",
                currency_base="USD",
                currency_profit="USD",
                digits=2,
                point=0.01,
                bid=latest.close,
                ask=latest.close + 0.01,
                spread_points=1,
                visible=True,
                trade_mode=1,
                last_tick_at=datetime.now(UTC),
            )
        ], {"TEST": self.candles}


def bullish_engulfing_history() -> list[Candle]:
    candles = [
        Candle(
            symbol="TEST",
            timeframe="15m",
            ts=datetime(2026, 1, 1, tzinfo=UTC) + timedelta(minutes=index * 15),
            open=110 - index * 0.05,
            high=110.2 - index * 0.05,
            low=109.7 - index * 0.05,
            close=109.95 - index * 0.05,
            volume=100,
            source="mt5",
        )
        for index in range(58)
    ]
    candles.extend(
        [
            candle(58, 108, 106, high=108.2, low=105.8),
            candle(59, 105.5, 109, high=109.4, low=105.2),
        ]
    )
    return candles


def test_m15_bullish_engulfing_opens_with_automatic_sl_and_tp(tmp_path: Path) -> None:
    ledger = PaperTradingService(
        str(tmp_path / "candlestick.json"),
        enabled=True,
        starting_balance=10000,
        risk_per_trade_pct=0.05,
        max_open_positions=3,
        minimum_opportunity_score=60,
        commission_bps=1,
        slippage_bps=0,
        cycle_interval_seconds=60,
        max_position_minutes=240,
        timeframe_mode="manual",
        timeframe="15m",
    )
    bot = CandlestickPatternBotService(ledger, PatternBridge(bullish_engulfing_history()))
    account = BrokerAccountProfile(
        id="test-account",
        provider="JustMarkets",
        login="1000000002",
        server="JustMarkets-Live",
        account_type="Standard",
    )

    portfolio = bot.process_cycle(account, max_symbols=10, force=True)

    assert portfolio.engine.timeframe == "15m"
    assert portfolio.metrics.open_positions == 1
    trade = portfolio.open_positions[0]
    assert trade.direction == Direction.buy
    assert trade.timeframe == "15m"
    assert trade.stop_loss is not None and trade.stop_loss < trade.entry_price
    assert trade.take_profit is not None and trade.take_profit > trade.entry_price
    assert "Bullish engulfing" in trade.reasons[0]
