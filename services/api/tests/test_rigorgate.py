from datetime import UTC, datetime
from pathlib import Path

from app.domain.models import Candle, Direction, SignalReason
from app.services.accounts import BrokerAccountProfile
from app.services.market_scanner import MarketOpportunity, MarketScanResult
from app.services.paper_trading import PaperTradingService
from app.services.rigorgate import RigorGateService


class SequenceScanner:
    def __init__(self, scans: list[MarketScanResult]) -> None:
        self.scans = scans

    def scan(
        self,
        account: BrokerAccountProfile | None,
        timeframe: str,
        max_symbols: int,
        result_limit: int,
        force: bool,
    ) -> MarketScanResult:
        del account, timeframe, max_symbols, result_limit, force
        return self.scans.pop(0)


class PriceBridge:
    def candles(
        self,
        account: BrokerAccountProfile | None,
        symbol: str,
        timeframe: str,
        limit: int,
    ) -> list[Candle]:
        del account, limit
        now = datetime(2026, 1, 1, tzinfo=UTC)
        return [Candle(symbol, timeframe, now, 100, 100.5, 99.5, 100, 1000, "mt5")]


def account() -> BrokerAccountProfile:
    return BrokerAccountProfile(
        id="test-account",
        provider="JustMarkets",
        login="1000000002",
        server="JustMarkets-Live",
        account_type="Standard",
    )


def opportunity(direction: Direction, score: float = 70) -> MarketOpportunity:
    return MarketOpportunity(
        rank=1,
        symbol="XAUUSD",
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
        market_active=True,
        quote_age_seconds=1,
        recommendation="Candidate",
        reasons=[SignalReason("trend", "Trend confirmed.", "bullish", 0.4)],
    )


def scan(item: MarketOpportunity) -> MarketScanResult:
    return MarketScanResult(
        source="mt5",
        timeframe="1m",
        available_symbols=1,
        scanned_symbols=1,
        generated_at=datetime(2026, 1, 1, tzinfo=UTC),
        disclaimer="Virtual test",
        opportunities=[item],
    )


def service(path: Path, scans: list[MarketScanResult]) -> RigorGateService:
    return RigorGateService(
        PaperTradingService(
            str(path),
            enabled=True,
            starting_balance=10000,
            risk_per_trade_pct=0.1,
            max_open_positions=3,
            minimum_opportunity_score=60,
            commission_bps=0,
            slippage_bps=0,
            cycle_interval_seconds=60,
            max_position_minutes=120,
            trade_source="rigorgate-virtual",
        ),
        SequenceScanner(scans),
        PriceBridge(),
    )


def test_rigorgate_buy_wait_sell_lifecycle_is_paper_only(tmp_path: Path) -> None:
    bot = service(
        tmp_path / "rigorgate.json",
        [scan(opportunity(Direction.buy)), scan(opportunity(Direction.sell))],
    )

    opened = bot.process_cycle(account(), 50, 50, force=True)
    closed = bot.process_cycle(account(), 50, 50, force=True)

    assert opened.metrics.open_positions == 1
    assert opened.open_positions[0].source == "rigorgate-virtual"
    assert "RigorGate BUY" in opened.open_positions[0].reasons[0]
    assert closed.metrics.open_positions == 0
    assert closed.metrics.closed_trades == 1
    assert closed.closed_trades[0].exit_reason == "signal_reversal"


def test_rigorgate_wait_and_sell_without_long_do_nothing(tmp_path: Path) -> None:
    bot = service(
        tmp_path / "rigorgate.json",
        [scan(opportunity(Direction.hold)), scan(opportunity(Direction.sell))],
    )

    first = bot.process_cycle(account(), 50, 50, force=True)
    second = bot.process_cycle(account(), 50, 50, force=True)

    assert first.metrics.open_positions == 0
    assert second.metrics.open_positions == 0
    assert second.metrics.closed_trades == 0
