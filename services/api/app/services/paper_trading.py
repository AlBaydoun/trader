import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import RLock
from typing import Any, Literal
from uuid import uuid4

from app.domain.models import Candle, Direction, OrderRequest, Position
from app.services.market_scanner import MarketOpportunity, MarketScanResult

PaperTradeStatus = Literal["open", "closed"]
PaperExitReason = Literal[
    "stop_loss",
    "take_profit",
    "signal_reversal",
    "time_limit",
    "operator",
]
PaperDecisionAction = Literal["cycle", "opened", "closed", "error", "control"]


@dataclass
class PaperTrade:
    id: str
    symbol: str
    direction: Direction
    timeframe: str
    status: PaperTradeStatus
    quantity: float
    entry_price: float
    current_price: float
    stop_loss: float | None
    take_profit: float | None
    risk_amount: float
    entry_fee: float
    exit_fee: float
    gross_pnl: float
    net_pnl: float
    unrealized_pnl: float
    return_pct: float
    r_multiple: float
    confidence: float
    opportunity_score: float
    scan_rank: int
    reasons: list[str]
    source: str
    source_account_id: str
    opened_at: datetime
    updated_at: datetime
    closed_at: datetime | None = None
    exit_price: float | None = None
    exit_reason: PaperExitReason | None = None
    max_favorable_excursion: float = 0.0
    max_adverse_excursion: float = 0.0


@dataclass
class PaperDecision:
    id: str
    cycle_id: str
    created_at: datetime
    action: PaperDecisionAction
    outcome: str
    reason: str
    symbol: str | None = None
    trade_id: str | None = None
    signal_direction: Direction | None = None
    opportunity_score: float | None = None


@dataclass
class PaperEquityPoint:
    timestamp: datetime
    equity: float
    balance: float
    unrealized_pnl: float


@dataclass
class PaperEngineStatus:
    enabled: bool
    virtual_only: bool
    timeframe: str
    minimum_opportunity_score: float
    max_open_positions: int
    risk_per_trade_pct: float
    cycle_interval_seconds: int
    cycle_count: int
    last_cycle_at: datetime | None
    last_scan_at: datetime | None
    next_cycle_at: datetime | None
    last_error: str
    market_source: str
    source_account_id: str
    scanned_symbols: int
    eligible_candidates: int
    opened_last_cycle: int
    closed_last_cycle: int


@dataclass
class PaperMetrics:
    starting_balance: float
    balance: float
    equity: float
    realized_pnl: float
    unrealized_pnl: float
    total_return_pct: float
    open_positions: int
    closed_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    profit_factor: float | None
    average_r_multiple: float
    max_drawdown_pct: float
    open_risk_amount: float
    fees_paid: float
    best_trade: float | None
    worst_trade: float | None


@dataclass
class PaperPortfolio:
    engine: PaperEngineStatus
    metrics: PaperMetrics
    open_positions: list[PaperTrade]
    closed_trades: list[PaperTrade]
    decisions: list[PaperDecision]
    equity_curve: list[PaperEquityPoint]
    disclaimer: str


class PaperTradingService:
    """Persistent virtual portfolio. It never calls a broker order function."""

    def __init__(
        self,
        state_file: str,
        *,
        enabled: bool,
        starting_balance: float,
        risk_per_trade_pct: float,
        max_open_positions: int,
        minimum_opportunity_score: float,
        commission_bps: float,
        slippage_bps: float,
        cycle_interval_seconds: int,
        max_position_minutes: int,
    ) -> None:
        self.state_file = Path(state_file)
        self.starting_balance = starting_balance
        self.enabled = enabled
        self.risk_per_trade_pct = risk_per_trade_pct
        self.max_open_positions = max_open_positions
        self.minimum_opportunity_score = minimum_opportunity_score
        self.commission_bps = commission_bps
        self.slippage_bps = slippage_bps
        self.cycle_interval_seconds = cycle_interval_seconds
        self.max_position_minutes = max_position_minutes
        self.timeframe = "1m"
        self.trades: list[PaperTrade] = []
        self.decisions: list[PaperDecision] = []
        self.equity_curve: list[PaperEquityPoint] = []
        self.cycle_count = 0
        self.last_cycle_at: datetime | None = None
        self.last_scan_at: datetime | None = None
        self.last_error = ""
        self.market_source = "waiting"
        self.source_account_id = ""
        self.scanned_symbols = 0
        self.eligible_candidates = 0
        self.opened_last_cycle = 0
        self.closed_last_cycle = 0
        self._lock = RLock()
        self._load()

    def positions(self) -> list[Position]:
        with self._lock:
            return [
                Position(
                    id=trade.id,
                    symbol=trade.symbol,
                    direction=trade.direction,
                    volume=trade.quantity,
                    entry=trade.entry_price,
                    stop_loss=trade.stop_loss,
                    take_profit=trade.take_profit,
                    opened_at=trade.opened_at,
                )
                for trade in self._open_trades()
            ]

    def place_order(self, order: OrderRequest) -> Position:
        if order.direction == Direction.hold:
            raise ValueError("Hold signals cannot be opened in the paper portfolio.")
        with self._lock:
            now = datetime.now(UTC)
            risk_distance = abs(order.entry - float(order.stop_loss or order.entry))
            trade = PaperTrade(
                id=f"paper-{uuid4().hex[:12]}",
                symbol=order.symbol,
                direction=order.direction,
                timeframe=self.timeframe,
                status="open",
                quantity=order.volume,
                entry_price=order.entry,
                current_price=order.entry,
                stop_loss=order.stop_loss,
                take_profit=order.take_profit,
                risk_amount=round(risk_distance * order.volume, 2),
                entry_fee=self._fee(order.entry, order.volume),
                exit_fee=0.0,
                gross_pnl=0.0,
                net_pnl=0.0,
                unrealized_pnl=0.0,
                return_pct=0.0,
                r_multiple=0.0,
                confidence=0.0,
                opportunity_score=0.0,
                scan_rank=0,
                reasons=["Manual paper order submitted through the API."],
                source="manual",
                source_account_id=self.source_account_id,
                opened_at=now,
                updated_at=now,
            )
            self.trades.append(trade)
            self._decision(
                cycle_id="manual",
                action="opened",
                outcome="accepted",
                reason="Manual order opened in the virtual portfolio only.",
                symbol=trade.symbol,
                trade=trade,
            )
            self._save()
            return self.positions()[-1]

    def process_cycle(
        self,
        scan: MarketScanResult,
        prices: dict[str, Candle],
        source_account_id: str,
        now: datetime | None = None,
    ) -> PaperPortfolio:
        with self._lock:
            cycle_time = now or datetime.now(UTC)
            cycle_id = f"cycle-{uuid4().hex[:10]}"
            self.timeframe = scan.timeframe
            self.market_source = scan.source
            self.source_account_id = source_account_id
            self.scanned_symbols = scan.scanned_symbols
            self.last_scan_at = scan.generated_at
            self.opened_last_cycle = 0
            self.closed_last_cycle = 0
            by_symbol = {item.symbol: item for item in scan.opportunities}

            closed_symbols: set[str] = set()
            for trade in list(self._open_trades()):
                candle = prices.get(trade.symbol)
                if candle is None:
                    continue
                self._mark_trade(trade, candle)
                exit_price, exit_reason = self._exit_trigger(trade, candle, cycle_time)
                current_opportunity = by_symbol.get(trade.symbol)
                if (
                    exit_price is None
                    and current_opportunity is not None
                    and current_opportunity.direction not in {Direction.hold, trade.direction}
                ):
                    exit_price = candle.close
                    exit_reason = "signal_reversal"
                if exit_price is not None and exit_reason is not None:
                    self._close_trade(trade, exit_price, exit_reason, cycle_time, cycle_id)
                    closed_symbols.add(trade.symbol)

            actionable = [
                item
                for item in scan.opportunities
                if item.market_active
                and item.direction != Direction.hold
                and item.opportunity_score >= self.minimum_opportunity_score
            ]
            self.eligible_candidates = len(actionable)
            open_symbols = {trade.symbol for trade in self._open_trades()}
            blocked_by_limit = 0
            for opportunity in actionable:
                if opportunity.symbol in open_symbols or opportunity.symbol in closed_symbols:
                    continue
                if len(open_symbols) >= self.max_open_positions:
                    blocked_by_limit += 1
                    continue
                new_trade = self._open_opportunity(opportunity, source_account_id, cycle_time)
                if new_trade is None:
                    continue
                open_symbols.add(new_trade.symbol)
                self.opened_last_cycle += 1
                self._decision(
                    cycle_id=cycle_id,
                    action="opened",
                    outcome="accepted",
                    reason=(
                        "Actionable strategy signal passed the virtual portfolio limits. "
                        f"Risk budget {new_trade.risk_amount:.2f}; estimated entry fee "
                        f"{new_trade.entry_fee:.2f}."
                    ),
                    symbol=new_trade.symbol,
                    trade=new_trade,
                    opportunity=opportunity,
                )

            self.cycle_count += 1
            self.last_cycle_at = cycle_time
            self.last_error = ""
            self._decision(
                cycle_id=cycle_id,
                action="cycle",
                outcome="completed",
                reason=(
                    f"Scanned {scan.scanned_symbols} instruments; found {len(actionable)} "
                    f"actionable signals; opened {self.opened_last_cycle}; closed "
                    f"{self.closed_last_cycle}; {blocked_by_limit} blocked by the virtual "
                    "position limit."
                ),
            )
            self._append_equity_point(cycle_time)
            self._trim()
            self._save()
            return self.snapshot()

    def record_error(self, message: str) -> None:
        with self._lock:
            self.last_error = message
            self._decision(
                cycle_id=f"cycle-{uuid4().hex[:10]}",
                action="error",
                outcome="failed",
                reason=message,
            )
            self._save()

    def update_control(
        self,
        *,
        enabled: bool | None = None,
        timeframe: str | None = None,
        minimum_opportunity_score: float | None = None,
        max_open_positions: int | None = None,
    ) -> PaperPortfolio:
        with self._lock:
            if enabled is not None:
                self.enabled = enabled
            if timeframe is not None:
                self.timeframe = timeframe
            if minimum_opportunity_score is not None:
                self.minimum_opportunity_score = minimum_opportunity_score
            if max_open_positions is not None:
                self.max_open_positions = max_open_positions
            self._decision(
                cycle_id="control",
                action="control",
                outcome="updated",
                reason=(
                    f"Virtual engine {'running' if self.enabled else 'paused'}; timeframe "
                    f"{self.timeframe}; minimum score {self.minimum_opportunity_score:.1f}; "
                    f"maximum {self.max_open_positions} open positions."
                ),
            )
            self._save()
            return self.snapshot()

    def close_trade(self, trade_id: str, price: float) -> PaperPortfolio:
        with self._lock:
            trade = next(
                (item for item in self.trades if item.id == trade_id and item.status == "open"),
                None,
            )
            if trade is None:
                raise KeyError(trade_id)
            self._close_trade(
                trade,
                price,
                "operator",
                datetime.now(UTC),
                "operator",
            )
            self._append_equity_point(datetime.now(UTC))
            self._save()
            return self.snapshot()

    def reset(self) -> PaperPortfolio:
        with self._lock:
            self.trades = []
            self.decisions = []
            self.equity_curve = []
            self.cycle_count = 0
            self.last_cycle_at = None
            self.last_scan_at = None
            self.last_error = ""
            self.market_source = "waiting"
            self.scanned_symbols = 0
            self.eligible_candidates = 0
            self.opened_last_cycle = 0
            self.closed_last_cycle = 0
            self._decision(
                cycle_id="control",
                action="control",
                outcome="reset",
                reason="Virtual portfolio reset to its starting balance.",
            )
            self._save()
            return self.snapshot()

    def snapshot(self) -> PaperPortfolio:
        with self._lock:
            open_positions = sorted(self._open_trades(), key=lambda item: item.opened_at)
            closed_trades = sorted(
                (trade for trade in self.trades if trade.status == "closed"),
                key=lambda item: item.closed_at or item.updated_at,
                reverse=True,
            )
            metrics = self._metrics(open_positions, closed_trades)
            next_cycle_at = (
                self.last_cycle_at + timedelta(seconds=self.cycle_interval_seconds)
                if self.enabled and self.last_cycle_at
                else None
            )
            engine = PaperEngineStatus(
                enabled=self.enabled,
                virtual_only=True,
                timeframe=self.timeframe,
                minimum_opportunity_score=self.minimum_opportunity_score,
                max_open_positions=self.max_open_positions,
                risk_per_trade_pct=self.risk_per_trade_pct,
                cycle_interval_seconds=self.cycle_interval_seconds,
                cycle_count=self.cycle_count,
                last_cycle_at=self.last_cycle_at,
                last_scan_at=self.last_scan_at,
                next_cycle_at=next_cycle_at,
                last_error=self.last_error,
                market_source=self.market_source,
                source_account_id=self.source_account_id,
                scanned_symbols=self.scanned_symbols,
                eligible_candidates=self.eligible_candidates,
                opened_last_cycle=self.opened_last_cycle,
                closed_last_cycle=self.closed_last_cycle,
            )
            return PaperPortfolio(
                engine=engine,
                metrics=metrics,
                open_positions=open_positions,
                closed_trades=closed_trades[:500],
                decisions=list(reversed(self.decisions[-500:])),
                equity_curve=self.equity_curve[-1000:],
                disclaimer=(
                    "Virtual results use observed prices plus configured simulation costs. They "
                    "do not place MT5 orders, use real money, or predict future live performance."
                ),
            )

    def _open_opportunity(
        self,
        opportunity: MarketOpportunity,
        source_account_id: str,
        now: datetime,
    ) -> PaperTrade | None:
        if opportunity.stop_loss is None or opportunity.take_profit is None:
            return None
        slip = opportunity.entry * (self.slippage_bps / 10_000)
        entry = (
            opportunity.entry + slip
            if opportunity.direction == Direction.buy
            else opportunity.entry - slip
        )
        risk_distance = abs(entry - opportunity.stop_loss)
        if risk_distance <= 0:
            return None
        equity = self._metrics(self._open_trades(), self._closed_trades()).equity
        risk_amount = max(0.01, equity * (self.risk_per_trade_pct / 100))
        quantity = risk_amount / risk_distance
        trade = PaperTrade(
            id=f"paper-{uuid4().hex[:12]}",
            symbol=opportunity.symbol,
            direction=opportunity.direction,
            timeframe=self.timeframe,
            status="open",
            quantity=round(quantity, 8),
            entry_price=round(entry, 8),
            current_price=round(entry, 8),
            stop_loss=opportunity.stop_loss,
            take_profit=opportunity.take_profit,
            risk_amount=round(risk_amount, 2),
            entry_fee=self._fee(entry, quantity),
            exit_fee=0.0,
            gross_pnl=0.0,
            net_pnl=0.0,
            unrealized_pnl=0.0,
            return_pct=0.0,
            r_multiple=0.0,
            confidence=opportunity.confidence,
            opportunity_score=opportunity.opportunity_score,
            scan_rank=opportunity.rank,
            reasons=[reason.message for reason in opportunity.reasons],
            source="mt5-virtual",
            source_account_id=source_account_id,
            opened_at=now,
            updated_at=now,
        )
        self.trades.append(trade)
        return trade

    def _mark_trade(self, trade: PaperTrade, candle: Candle) -> None:
        trade.current_price = candle.close
        trade.updated_at = datetime.now(UTC)
        favorable_price = candle.high if trade.direction == Direction.buy else candle.low
        adverse_price = candle.low if trade.direction == Direction.buy else candle.high
        favorable = self._gross_pnl(trade, favorable_price)
        adverse = self._gross_pnl(trade, adverse_price)
        trade.max_favorable_excursion = round(max(trade.max_favorable_excursion, favorable), 2)
        trade.max_adverse_excursion = round(min(trade.max_adverse_excursion, adverse), 2)
        estimated_exit_fee = self._fee(candle.close, trade.quantity)
        gross = self._gross_pnl(trade, candle.close)
        trade.unrealized_pnl = round(gross - trade.entry_fee - estimated_exit_fee, 2)
        notional = abs(trade.entry_price * trade.quantity)
        trade.return_pct = round(trade.unrealized_pnl / notional * 100, 3) if notional else 0.0
        trade.r_multiple = (
            round(trade.unrealized_pnl / trade.risk_amount, 3) if trade.risk_amount else 0.0
        )

    def _exit_trigger(
        self,
        trade: PaperTrade,
        candle: Candle,
        now: datetime,
    ) -> tuple[float | None, PaperExitReason | None]:
        if trade.direction == Direction.buy:
            if trade.stop_loss is not None and candle.low <= trade.stop_loss:
                return trade.stop_loss, "stop_loss"
            if trade.take_profit is not None and candle.high >= trade.take_profit:
                return trade.take_profit, "take_profit"
        else:
            if trade.stop_loss is not None and candle.high >= trade.stop_loss:
                return trade.stop_loss, "stop_loss"
            if trade.take_profit is not None and candle.low <= trade.take_profit:
                return trade.take_profit, "take_profit"
        if now - trade.opened_at >= timedelta(minutes=self.max_position_minutes):
            return candle.close, "time_limit"
        return None, None

    def _close_trade(
        self,
        trade: PaperTrade,
        exit_price: float,
        exit_reason: PaperExitReason,
        now: datetime,
        cycle_id: str,
    ) -> None:
        trade.status = "closed"
        trade.current_price = exit_price
        trade.exit_price = exit_price
        trade.exit_reason = exit_reason
        trade.closed_at = now
        trade.updated_at = now
        trade.exit_fee = self._fee(exit_price, trade.quantity)
        trade.gross_pnl = round(self._gross_pnl(trade, exit_price), 2)
        trade.net_pnl = round(trade.gross_pnl - trade.entry_fee - trade.exit_fee, 2)
        trade.unrealized_pnl = 0.0
        notional = abs(trade.entry_price * trade.quantity)
        trade.return_pct = round(trade.net_pnl / notional * 100, 3) if notional else 0.0
        trade.r_multiple = round(trade.net_pnl / trade.risk_amount, 3) if trade.risk_amount else 0.0
        self.closed_last_cycle += 1
        self._decision(
            cycle_id=cycle_id,
            action="closed",
            outcome="profit" if trade.net_pnl > 0 else "loss",
            reason=(
                f"Closed by {exit_reason.replace('_', ' ')} at {exit_price:.8g}. "
                f"Net virtual result {trade.net_pnl:.2f} ({trade.r_multiple:.2f}R)."
            ),
            symbol=trade.symbol,
            trade=trade,
        )

    def _metrics(
        self,
        open_positions: list[PaperTrade],
        closed_trades: list[PaperTrade],
    ) -> PaperMetrics:
        realized = sum(trade.net_pnl for trade in closed_trades)
        unrealized = sum(trade.unrealized_pnl for trade in open_positions)
        balance = self.starting_balance + realized
        equity = balance + unrealized
        winners = [trade for trade in closed_trades if trade.net_pnl > 0]
        losers = [trade for trade in closed_trades if trade.net_pnl < 0]
        gross_profit = sum(trade.net_pnl for trade in winners)
        gross_loss = abs(sum(trade.net_pnl for trade in losers))
        profit_factor = round(gross_profit / gross_loss, 3) if gross_loss > 0 else None
        average_r = (
            sum(trade.r_multiple for trade in closed_trades) / len(closed_trades)
            if closed_trades
            else 0.0
        )
        drawdown = self._max_drawdown_pct(equity)
        results = [trade.net_pnl for trade in closed_trades]
        return PaperMetrics(
            starting_balance=round(self.starting_balance, 2),
            balance=round(balance, 2),
            equity=round(equity, 2),
            realized_pnl=round(realized, 2),
            unrealized_pnl=round(unrealized, 2),
            total_return_pct=round((equity / self.starting_balance - 1) * 100, 3),
            open_positions=len(open_positions),
            closed_trades=len(closed_trades),
            winning_trades=len(winners),
            losing_trades=len(losers),
            win_rate=round(len(winners) / len(closed_trades) * 100, 1) if closed_trades else 0.0,
            profit_factor=profit_factor,
            average_r_multiple=round(average_r, 3),
            max_drawdown_pct=round(drawdown, 3),
            open_risk_amount=round(sum(trade.risk_amount for trade in open_positions), 2),
            fees_paid=round(
                sum(trade.entry_fee + trade.exit_fee for trade in closed_trades)
                + sum(trade.entry_fee for trade in open_positions),
                2,
            ),
            best_trade=round(max(results), 2) if results else None,
            worst_trade=round(min(results), 2) if results else None,
        )

    def _append_equity_point(self, timestamp: datetime) -> None:
        metrics = self._metrics(self._open_trades(), self._closed_trades())
        self.equity_curve.append(
            PaperEquityPoint(
                timestamp=timestamp,
                equity=metrics.equity,
                balance=metrics.balance,
                unrealized_pnl=metrics.unrealized_pnl,
            )
        )

    def _max_drawdown_pct(self, current_equity: float) -> float:
        values = [point.equity for point in self.equity_curve] + [current_equity]
        peak = self.starting_balance
        maximum = 0.0
        for value in values:
            peak = max(peak, value)
            if peak > 0:
                maximum = max(maximum, (peak - value) / peak * 100)
        return maximum

    def _decision(
        self,
        *,
        cycle_id: str,
        action: PaperDecisionAction,
        outcome: str,
        reason: str,
        symbol: str | None = None,
        trade: PaperTrade | None = None,
        opportunity: MarketOpportunity | None = None,
    ) -> None:
        self.decisions.append(
            PaperDecision(
                id=f"decision-{uuid4().hex[:12]}",
                cycle_id=cycle_id,
                created_at=datetime.now(UTC),
                action=action,
                outcome=outcome,
                reason=reason,
                symbol=symbol,
                trade_id=trade.id if trade else None,
                signal_direction=(
                    opportunity.direction
                    if opportunity
                    else trade.direction if trade else None
                ),
                opportunity_score=(
                    opportunity.opportunity_score
                    if opportunity
                    else trade.opportunity_score if trade else None
                ),
            )
        )

    def _fee(self, price: float, quantity: float) -> float:
        return round(abs(price * quantity) * (self.commission_bps / 10_000), 2)

    @staticmethod
    def _gross_pnl(trade: PaperTrade, price: float) -> float:
        multiplier = 1 if trade.direction == Direction.buy else -1
        return (price - trade.entry_price) * trade.quantity * multiplier

    def _open_trades(self) -> list[PaperTrade]:
        return [trade for trade in self.trades if trade.status == "open"]

    def _closed_trades(self) -> list[PaperTrade]:
        return [trade for trade in self.trades if trade.status == "closed"]

    def _trim(self) -> None:
        open_positions = self._open_trades()
        closed_positions = sorted(
            self._closed_trades(),
            key=lambda item: item.closed_at or item.updated_at,
            reverse=True,
        )[:2000]
        self.trades = open_positions + closed_positions
        self.decisions = self.decisions[-2000:]
        self.equity_curve = self.equity_curve[-5000:]

    def _save(self) -> None:
        payload = {
            "version": 1,
            "starting_balance": self.starting_balance,
            "enabled": self.enabled,
            "risk_per_trade_pct": self.risk_per_trade_pct,
            "max_open_positions": self.max_open_positions,
            "minimum_opportunity_score": self.minimum_opportunity_score,
            "timeframe": self.timeframe,
            "cycle_count": self.cycle_count,
            "last_cycle_at": self._datetime_text(self.last_cycle_at),
            "last_scan_at": self._datetime_text(self.last_scan_at),
            "last_error": self.last_error,
            "market_source": self.market_source,
            "source_account_id": self.source_account_id,
            "scanned_symbols": self.scanned_symbols,
            "eligible_candidates": self.eligible_candidates,
            "opened_last_cycle": self.opened_last_cycle,
            "closed_last_cycle": self.closed_last_cycle,
            "trades": [self._serialize(item) for item in self.trades],
            "decisions": [self._serialize(item) for item in self.decisions],
            "equity_curve": [self._serialize(item) for item in self.equity_curve],
        }
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.state_file.with_suffix(f"{self.state_file.suffix}.tmp")
        temporary.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        temporary.replace(self.state_file)

    def _load(self) -> None:
        if not self.state_file.is_file():
            return
        try:
            payload = json.loads(self.state_file.read_text(encoding="utf-8"))
            self.starting_balance = float(payload.get("starting_balance", self.starting_balance))
            self.enabled = bool(payload.get("enabled", self.enabled))
            self.risk_per_trade_pct = float(
                payload.get("risk_per_trade_pct", self.risk_per_trade_pct)
            )
            self.max_open_positions = int(
                payload.get("max_open_positions", self.max_open_positions)
            )
            self.minimum_opportunity_score = float(
                payload.get("minimum_opportunity_score", self.minimum_opportunity_score)
            )
            self.timeframe = str(payload.get("timeframe", self.timeframe))
            self.cycle_count = int(payload.get("cycle_count", 0))
            self.last_cycle_at = self._parse_datetime(payload.get("last_cycle_at"))
            self.last_scan_at = self._parse_datetime(payload.get("last_scan_at"))
            self.last_error = str(payload.get("last_error", ""))
            self.market_source = str(payload.get("market_source", "waiting"))
            self.source_account_id = str(payload.get("source_account_id", ""))
            self.scanned_symbols = int(payload.get("scanned_symbols", 0))
            self.eligible_candidates = int(payload.get("eligible_candidates", 0))
            self.opened_last_cycle = int(payload.get("opened_last_cycle", 0))
            self.closed_last_cycle = int(payload.get("closed_last_cycle", 0))
            self.trades = [self._trade_from_dict(item) for item in payload.get("trades", [])]
            self.decisions = [
                self._decision_from_dict(item) for item in payload.get("decisions", [])
            ]
            self.equity_curve = [
                self._equity_from_dict(item) for item in payload.get("equity_curve", [])
            ]
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            self.last_error = "The virtual portfolio state could not be loaded; using a new ledger."

    @staticmethod
    def _serialize(item: Any) -> dict[str, Any]:
        payload = asdict(item)
        for key, value in list(payload.items()):
            if isinstance(value, datetime):
                payload[key] = value.isoformat()
            elif isinstance(value, Direction):
                payload[key] = value.value
        return payload

    @staticmethod
    def _trade_from_dict(payload: dict[str, Any]) -> PaperTrade:
        return PaperTrade(
            **{
                **payload,
                "direction": Direction(payload["direction"]),
                "opened_at": PaperTradingService._parse_datetime(payload["opened_at"]),
                "updated_at": PaperTradingService._parse_datetime(payload["updated_at"]),
                "closed_at": PaperTradingService._parse_datetime(payload.get("closed_at")),
            }
        )

    @staticmethod
    def _decision_from_dict(payload: dict[str, Any]) -> PaperDecision:
        direction = payload.get("signal_direction")
        return PaperDecision(
            **{
                **payload,
                "created_at": PaperTradingService._parse_datetime(payload["created_at"]),
                "signal_direction": Direction(direction) if direction else None,
            }
        )

    @staticmethod
    def _equity_from_dict(payload: dict[str, Any]) -> PaperEquityPoint:
        return PaperEquityPoint(
            **{
                **payload,
                "timestamp": PaperTradingService._parse_datetime(payload["timestamp"]),
            }
        )

    @staticmethod
    def _datetime_text(value: datetime | None) -> str | None:
        return value.isoformat() if value else None

    @staticmethod
    def _parse_datetime(value: Any) -> datetime | None:
        if not value:
            return None
        parsed = datetime.fromisoformat(str(value))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
