from collections.abc import Sequence
from dataclasses import replace
from typing import Literal, Protocol

from app.domain.models import Candle, Direction, Position, SignalReason
from app.services.accounts import BrokerAccountProfile
from app.services.market_scanner import MarketOpportunity, MarketScanResult
from app.services.paper_trading import PaperPortfolio, PaperTimeframeMode, PaperTradingService
from app.services.timeframe_selector import choose_best_scan


class RigorGateScanner(Protocol):
    def scan(
        self,
        account: BrokerAccountProfile | None,
        timeframe: str,
        max_symbols: int,
        result_limit: int,
        force: bool,
    ) -> MarketScanResult: ...


class RigorGatePriceProvider(Protocol):
    def candles(
        self,
        account: BrokerAccountProfile | None,
        symbol: str,
        timeframe: str,
        limit: int,
    ) -> list[Candle]: ...


class RigorGateService:
    """Applies the linked RigorGate action semantics to a separate paper ledger."""

    name = "RigorGate"

    def __init__(
        self,
        ledger: PaperTradingService,
        scanner: RigorGateScanner,
        bridge: RigorGatePriceProvider,
        timeframe_options: Sequence[str] = ("1m", "5m", "15m", "1h", "4h", "1d"),
    ) -> None:
        self.ledger = ledger
        self.scanner = scanner
        self.bridge = bridge
        self.timeframe_options = tuple(timeframe_options)

    @property
    def enabled(self) -> bool:
        return self.ledger.enabled

    def snapshot(self) -> PaperPortfolio:
        return self.ledger.snapshot()

    def positions(self) -> list[Position]:
        return self.ledger.positions()

    def update_control(
        self,
        *,
        enabled: bool | None = None,
        timeframe: str | None = None,
        timeframe_mode: PaperTimeframeMode | None = None,
        minimum_opportunity_score: float | None = None,
        max_open_positions: int | None = None,
    ) -> PaperPortfolio:
        return self.ledger.update_control(
            enabled=enabled,
            timeframe=timeframe,
            timeframe_mode=timeframe_mode,
            minimum_opportunity_score=minimum_opportunity_score,
            max_open_positions=max_open_positions,
        )

    def close_trade(self, trade_id: str, price: float) -> PaperPortfolio:
        return self.ledger.close_trade(trade_id, price)

    def reset(self) -> PaperPortfolio:
        return self.ledger.reset()

    def process_cycle(
        self,
        account: BrokerAccountProfile | None,
        max_symbols: int,
        result_limit: int = 50,
        force: bool = False,
    ) -> PaperPortfolio:
        timeframes = (
            [self.ledger.timeframe]
            if self.ledger.timeframe_mode == "manual"
            else list(self.timeframe_options)
        )
        scans = [
            self.scanner.scan(
                account,
                timeframe,
                max_symbols,
                result_limit,
                force=force,
            )
            for timeframe in timeframes
        ]
        scan = choose_best_scan(scans)
        if scan.source != "mt5" or account is None:
            self.ledger.record_error(
                "The RigorGate virtual cycle was skipped because verified MT5 market data "
                "is unavailable."
            )
            return self.ledger.snapshot()

        open_long_symbols = {
            position.symbol
            for position in self.ledger.positions()
            if position.direction == Direction.buy
        }
        gated_opportunities = [
            gated
            for item in scan.opportunities
            if (gated := self._gate(item, open_long_symbols)) is not None
        ]
        prices: dict[str, Candle] = {}
        for position in self.ledger.positions():
            candles = self.bridge.candles(
                account,
                position.symbol,
                scan.timeframe,
                80,
            )
            if candles:
                prices[position.symbol] = candles[-1]

        gated_scan = MarketScanResult(
            source=scan.source,
            timeframe=scan.timeframe,
            available_symbols=scan.available_symbols,
            scanned_symbols=scan.scanned_symbols,
            generated_at=scan.generated_at,
            disclaimer=(
                "RigorGate is a paper-only action adapter based on the linked conversation's "
                "BUY, WAIT, and SELL behavior. Its market inputs come from the workstation's "
                "read-only MT5 evidence pipeline. It does not predict or guarantee profit."
            ),
            opportunities=gated_opportunities,
        )
        return self.ledger.process_cycle(
            gated_scan,
            prices,
            account.id,
            now=scan.generated_at,
        )

    def _gate(
        self,
        opportunity: MarketOpportunity,
        open_long_symbols: set[str],
    ) -> MarketOpportunity | None:
        if opportunity.opportunity_score < self.ledger.minimum_opportunity_score:
            return None
        if opportunity.direction == Direction.buy:
            action = "BUY"
            message = "RigorGate BUY passed the configured evidence and score gate."
            impact: Literal["bullish", "bearish"] = "bullish"
        elif opportunity.direction == Direction.sell and opportunity.symbol in open_long_symbols:
            action = "SELL"
            message = "RigorGate SELL will close the matching long paper position."
            impact = "bearish"
        else:
            # WAIT and SELL without a matching long are intentionally no-op actions.
            return None
        return replace(
            opportunity,
            reasons=[
                SignalReason("rigorgate", message, impact, 1.0),
                *opportunity.reasons,
            ],
            recommendation=action,
            signal_recommendation=action,
        )
