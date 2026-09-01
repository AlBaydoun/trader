from dataclasses import replace
from datetime import UTC, datetime, timedelta

from app.domain.models import Candle, Direction
from app.services.market_scanner import MarketScanResult
from app.services.mt5_bridge import MT5MarketSymbol
from app.services.paper_trading import PaperTradingService
from app.services.video_ma_mtf_macd import (
    VideoMAMTFMACDBotService,
    _aggregate_candles,
    _histogram_state,
    _macd,
)


def history(direction: Direction | None = None) -> list[Candle]:
    closes = [100.0] * 220
    if direction == Direction.buy:
        closes.extend(100.0 + index * 0.15 for index in range(30))
        closes.extend([104.0, 103.0, 106.0])
    elif direction == Direction.sell:
        closes.extend(100.0 - index * 0.15 for index in range(30))
        closes.extend([96.0, 97.0, 94.0])
    else:
        closes.extend([100.0, 100.05, 100.0])
    candles: list[Candle] = []
    start = datetime(2026, 1, 1, tzinfo=UTC)
    for index, close in enumerate(closes):
        opening = closes[index - 1] if index else close
        candles.append(
            Candle(
                symbol="TEST",
                timeframe="5m",
                ts=start + timedelta(minutes=index * 5),
                open=opening,
                high=max(opening, close) + 0.2,
                low=min(opening, close) - 0.2,
                close=close,
                volume=100.0,
                source="mt5",
            )
        )
    return candles


def metadata(price: float = 100.0) -> MT5MarketSymbol:
    return MT5MarketSymbol(
        symbol="TEST",
        description="Test symbol",
        category="Test",
        currency_base="USD",
        currency_profit="USD",
        digits=2,
        point=0.01,
        bid=price,
        ask=price + 0.01,
        spread_points=1.0,
        visible=True,
        trade_mode=1,
        last_tick_at=datetime.now(UTC),
    )


def paper_candle(*, low: float, high: float, close: float, now: datetime) -> Candle:
    return Candle("TEST", "5m", now, 100, high, low, close, 1000, "mt5")


def bot(tmp_path) -> VideoMAMTFMACDBotService:
    ledger = PaperTradingService(
        tmp_path / "video-paper.json",
        enabled=True,
        timeframe="5m",
        starting_balance=10000.0,
        risk_per_trade_pct=0.05,
        max_open_positions=5,
        minimum_opportunity_score=68.0,
        commission_bps=1.0,
        slippage_bps=1.0,
        cycle_interval_seconds=60,
        max_position_minutes=60,
    )
    return VideoMAMTFMACDBotService(ledger, object())


def test_aggregates_m5_candles_into_m15() -> None:
    aggregated = _aggregate_candles(history(Direction.buy), "15m")

    assert len(aggregated) == 85
    assert aggregated[-1].timeframe == "15m"
    assert aggregated[-1].close == 106.0


def test_video_macd_matches_cm_signal_sma_and_histogram_colors() -> None:
    main, signal, histogram = _macd([1.0, 2.0, 4.0, 3.0], 2, 3, 2)

    assert signal == [0.0, 0.08333333333333326, 0.3194444444444444, 0.33564814814814836]
    assert histogram[-1] == main[-1] - signal[-1]
    assert _histogram_state(1.0, 0.5) == "aqua"
    assert _histogram_state(0.5, 1.0) == "blue"
    assert _histogram_state(-1.0, -0.5) == "red"
    assert _histogram_state(-0.5, -1.0) == "maroon"


def test_video_strategy_creates_bullish_setup(tmp_path) -> None:
    setup = bot(tmp_path)._opportunity(
        "TEST",
        history(Direction.buy),
        metadata(106.0),
        "5m",
        datetime.now(UTC),
    )

    assert setup is not None
    assert setup.direction == Direction.buy
    assert setup.recommendation == "BUY"
    assert setup.take_profit > setup.entry > setup.stop_loss
    assert any("ribbon" in reason.message for reason in setup.reasons)
    assert any(reason.category == "macd" for reason in setup.reasons)
    assert any(reason.category == "momentum" for reason in setup.reasons)
    assert setup.partial_take_profit > setup.entry


def test_video_strategy_creates_bearish_setup(tmp_path) -> None:
    setup = bot(tmp_path)._opportunity(
        "TEST",
        history(Direction.sell),
        metadata(94.0),
        "5m",
        datetime.now(UTC),
    )

    assert setup is not None
    assert setup.direction == Direction.sell
    assert setup.recommendation == "SELL"
    assert setup.stop_loss > setup.entry > setup.take_profit


def test_video_strategy_rejects_unconfirmed_market(tmp_path) -> None:
    setup = bot(tmp_path)._opportunity(
        "TEST",
        history(),
        metadata(),
        "5m",
        datetime.now(UTC),
    )

    assert setup is None


def test_video_strategy_paper_ledger_takes_tp1_and_moves_stop_to_breakeven(tmp_path) -> None:
    service = PaperTradingService(
        tmp_path / "partial-paper.json",
        enabled=True,
        timeframe="5m",
        starting_balance=10000.0,
        risk_per_trade_pct=0.1,
        max_open_positions=5,
        minimum_opportunity_score=0.0,
        commission_bps=1.0,
        slippage_bps=0.0,
        cycle_interval_seconds=60,
        max_position_minutes=60,
    )
    first = datetime(2026, 1, 1, tzinfo=UTC)
    setup = bot(tmp_path)._opportunity(
        "TEST",
        history(Direction.buy),
        metadata(106.0),
        "5m",
        first,
    )
    assert setup is not None
    item = replace(setup, entry=100.0, stop_loss=99.0, take_profit=102.0, partial_take_profit=101.0)
    first_result = service.process_cycle(
        MarketScanResult(
            source="mt5",
            timeframe="5m",
            available_symbols=1,
            scanned_symbols=1,
            generated_at=first,
            disclaimer="Virtual test",
            opportunities=[item],
        ),
        {},
        "test-account",
        first,
    )
    trade = first_result.open_positions[0]

    partial_result = service.process_cycle(
        MarketScanResult(
            source="mt5",
            timeframe="5m",
            available_symbols=1,
            scanned_symbols=1,
            generated_at=first + timedelta(minutes=1),
            disclaimer="Virtual test",
            opportunities=[item],
        ),
        {"TEST": paper_candle(low=99.5, high=101.2, close=100.5, now=first)},
        "test-account",
        first + timedelta(minutes=1),
    )

    protected = partial_result.open_positions[0]
    assert protected.id == trade.id
    assert protected.breakeven_activated is True
    assert protected.quantity_closed == protected.initial_quantity / 2
    assert protected.stop_loss == protected.entry_price
    assert protected.partial_pnl > 0

    finished = service.process_cycle(
        MarketScanResult(
            source="mt5",
            timeframe="5m",
            available_symbols=1,
            scanned_symbols=1,
            generated_at=first + timedelta(minutes=2),
            disclaimer="Virtual test",
            opportunities=[item],
        ),
        {"TEST": paper_candle(low=100.1, high=102.2, close=102, now=first)},
        "test-account",
        first + timedelta(minutes=2),
    )

    assert finished.metrics.open_positions == 0
    assert finished.closed_trades[0].exit_reason == "take_profit"
    assert finished.closed_trades[0].net_pnl > 0
