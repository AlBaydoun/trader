from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from math import isfinite
from typing import Literal

from app.domain.models import Candle, Direction, Position, SignalReason
from app.services.accounts import BrokerAccountProfile
from app.services.market_scanner import MarketOpportunity, MarketScanResult
from app.services.mt5_bridge import MT5MarketSymbol, MT5ReadOnlyBridge
from app.services.paper_trading import PaperPortfolio, PaperTimeframeMode, PaperTradingService
from app.services.timeframe_selector import choose_best_scan

SUPPORTED_TIMEFRAMES = ("1m", "5m", "15m", "1h", "4h", "1d")


@dataclass(frozen=True)
class CandlestickPattern:
    id: str
    label: str
    direction: Direction
    strength: float


class CandlestickPatternBotService:
    """Paper-only bot based on closed-candle reversal and continuation patterns."""

    name = "Candlestick Pattern Bot"
    default_timeframe = "15m"

    def __init__(
        self,
        ledger: PaperTradingService,
        bridge: MT5ReadOnlyBridge,
        *,
        timeframe_options: Sequence[str] = SUPPORTED_TIMEFRAMES,
        target_r_multiple: float = 1.35,
        pattern_id: str | None = None,
        bot_name: str | None = None,
    ) -> None:
        self.ledger = ledger
        self.bridge = bridge
        self.timeframe_options = (
            tuple(timeframe for timeframe in timeframe_options if timeframe in SUPPORTED_TIMEFRAMES)
            or SUPPORTED_TIMEFRAMES
        )
        self.target_r_multiple = target_r_multiple
        self.pattern_id = pattern_id
        self.bot_name = bot_name or self.name

    @property
    def enabled(self) -> bool:
        return self.ledger.enabled

    @property
    def timeframe(self) -> str:
        return self.ledger.timeframe

    @property
    def timeframe_mode(self) -> PaperTimeframeMode:
        return self.ledger.timeframe_mode

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
        scans = self._scans(account, max_symbols, result_limit, force)
        scan = choose_best_scan(scans)
        if scan.source != "mt5" or account is None:
            self.ledger.record_error(
                "The candlestick virtual cycle was skipped because verified MT5 market data "
                "is unavailable."
            )
            return self.ledger.snapshot()

        prices = {}
        for trade in self.ledger.snapshot().open_positions:
            candles = self.bridge.candles(account, trade.symbol, trade.timeframe, 80)
            if candles:
                prices[trade.symbol] = candles[-1]
        return self.ledger.process_cycle(scan, prices, account.id, now=scan.generated_at)

    def _scans(
        self,
        account: BrokerAccountProfile | None,
        max_symbols: int,
        result_limit: int,
        force: bool,
    ) -> list[MarketScanResult]:
        timeframes = (
            [self.timeframe] if self.timeframe_mode == "manual" else list(self.timeframe_options)
        )
        scan_force = force
        return [
            self.scan(account, timeframe, max_symbols, result_limit, scan_force)
            for timeframe in timeframes
        ]

    def scan(
        self,
        account: BrokerAccountProfile | None,
        timeframe: str,
        max_symbols: int,
        result_limit: int = 50,
        force: bool = False,
    ) -> MarketScanResult:
        now = datetime.now(UTC)
        if account is None:
            return self._empty_scan(timeframe, now)

        symbols, candles_by_symbol = self.bridge.scan_market_candles(
            account,
            timeframe,
            120,
            max_symbols,
            force=force,
        )
        metadata = {symbol.symbol: symbol for symbol in symbols}
        ranked: list[MarketOpportunity] = []
        for symbol, candles in candles_by_symbol.items():
            opportunity = self._opportunity(symbol, candles, metadata.get(symbol), timeframe, now)
            if opportunity is not None:
                ranked.append(opportunity)
        ranked.sort(
            key=lambda item: (
                item.market_active,
                item.opportunity_score,
                item.confidence,
                -item.spread_pct,
            ),
            reverse=True,
        )
        opportunities = [
            MarketOpportunity(**{**item.__dict__, "rank": rank})
            for rank, item in enumerate(ranked[:result_limit], start=1)
        ]
        return MarketScanResult(
            source="mt5" if symbols else "unavailable",
            timeframe=timeframe,
            available_symbols=len(symbols),
            scanned_symbols=len(candles_by_symbol),
            generated_at=now,
            disclaimer=(
                f"{self.bot_name} is paper-only. It recognizes common formations on the "
                "latest available candles, then requires trend, volatility, spread, and risk "
                "checks. A pattern is not a guaranteed reversal or profit signal."
            ),
            opportunities=opportunities,
        )

    def _opportunity(
        self,
        symbol: str,
        candles: list[Candle],
        metadata: MT5MarketSymbol | None,
        timeframe: str,
        now: datetime,
    ) -> MarketOpportunity | None:
        if len(candles) < 60 or metadata is None:
            return None
        patterns = detect_candlestick_patterns(candles)
        directional = [pattern for pattern in patterns if pattern.direction != Direction.hold]
        if self.pattern_id is not None:
            directional = [pattern for pattern in directional if pattern.id == self.pattern_id]
        if not directional:
            return None
        bullish_engulfing = next(
            (pattern for pattern in directional if pattern.id == "bullish-engulfing"),
            None,
        )
        bearish_engulfing = next(
            (pattern for pattern in directional if pattern.id == "bearish-engulfing"),
            None,
        )
        # On M15, an engulfing candle is the explicit entry trigger in either direction.
        # This keeps a confirmed red bearish engulfing from being replaced by another
        # formation that happens to share the same closing sequence.
        strongest = (
            directional[0]
            if self.pattern_id is not None
            else bullish_engulfing
            if timeframe == "15m" and bullish_engulfing is not None
            else bearish_engulfing
            if timeframe == "15m" and bearish_engulfing is not None
            else max(directional, key=lambda pattern: pattern.strength)
        )
        latest = candles[-1]
        atr = _atr(candles[-15:])
        if not isfinite(atr) or atr <= 0 or latest.close <= 0:
            return None
        fast = _ema([candle.close for candle in candles], 20)
        slow = _ema([candle.close for candle in candles], 50)
        trend_direction = Direction.buy if fast >= slow else Direction.sell
        trend_agrees = trend_direction == strongest.direction
        score = strongest.strength + (10.0 if trend_agrees else -6.0)
        body_ratio = _body(latest) / max(_range(latest), 1e-12)
        score += min(7.0, body_ratio * 7.0)
        midpoint = (
            (metadata.bid + metadata.ask) / 2 if metadata.bid and metadata.ask else latest.close
        )
        spread_pct = (metadata.ask - metadata.bid) / midpoint * 100 if midpoint > 0 else 0.0
        score -= min(8.0, spread_pct * 150)
        score = round(max(0.0, min(100.0, score)), 1)
        if score < 60:
            return None

        impact: Literal["bullish", "bearish"]
        if strongest.direction == Direction.buy:
            stop_loss = min(latest.low, candles[-2].low) - atr * 0.15
            risk_distance = latest.close - stop_loss
            take_profit = latest.close + risk_distance * self.target_r_multiple
            impact = "bullish"
        else:
            stop_loss = max(latest.high, candles[-2].high) + atr * 0.15
            risk_distance = stop_loss - latest.close
            take_profit = latest.close - risk_distance * self.target_r_multiple
            impact = "bearish"
        if stop_loss <= 0 or take_profit <= 0 or risk_distance <= 0:
            return None

        trend_status = (
            "above"
            if trend_agrees and strongest.direction == Direction.buy
            else "below"
            if trend_agrees
            else "not aligned with"
        )

        quote_age_seconds = (
            max(0, int((now - metadata.last_tick_at).total_seconds()))
            if metadata.last_tick_at
            else None
        )
        market_active = bool(
            metadata.bid > 0
            and metadata.ask > 0
            and quote_age_seconds is not None
            and quote_age_seconds <= 300
        )
        labels = ", ".join(
            pattern.label
            for pattern in patterns
            if self.pattern_id is None or pattern.id == self.pattern_id
        )
        trend_impact: Literal["bullish", "bearish", "risk"] = (
            impact if trend_agrees else "risk"
        )
        return MarketOpportunity(
            rank=0,
            symbol=symbol,
            description=f"{symbol} {strongest.label}",
            category=self.bot_name,
            direction=strongest.direction,
            confidence=round(min(0.96, 0.68 + score / 350), 3),
            entry=latest.close,
            stop_loss=round(stop_loss, 8),
            take_profit=round(take_profit, 8),
            opportunity_score=score if market_active else round(score * 0.25, 1),
            estimated_move_pct=round(abs(take_profit - latest.close) / latest.close * 100, 3),
            spread_pct=round(spread_pct, 4),
            market_active=market_active,
            quote_age_seconds=quote_age_seconds,
            recommendation=strongest.direction.value.upper(),
            reasons=[
                SignalReason(
                    "candlestick",
                    f"{labels} detected on the latest {timeframe} candle sequence.",
                    impact,
                    0.45,
                ),
                SignalReason(
                    "trend",
                    f"EMA(20) is {trend_status} EMA(50); trend agreement changes the setup score.",
                    trend_impact,
                    0.2,
                ),
                SignalReason(
                    "volatility",
                    (
                        f"ATR-based risk distance is {risk_distance:.8g}; the target is "
                        f"{self.target_r_multiple:.2f}R."
                    ),
                    "neutral",
                    0.15,
                ),
                SignalReason(
                    "risk",
                    (
                        "Entry is simulated only after spread and active-quote checks; no broker "
                        "order is sent."
                    ),
                    "risk",
                    0.2,
                ),
            ],
            signal_at=latest.ts,
            signal_price=latest.close,
            signal_level=f"candlestick-{strongest.id}",
            signal_recommendation=strongest.direction.value.upper(),
        )

    @staticmethod
    def _empty_scan(timeframe: str, generated_at: datetime) -> MarketScanResult:
        return MarketScanResult(
            source="unavailable",
            timeframe=timeframe,
            available_symbols=0,
            scanned_symbols=0,
            generated_at=generated_at,
            disclaimer="Candlestick Pattern Bot is waiting for verified MT5 market data.",
            opportunities=[],
        )


def detect_candlestick_patterns(candles: Sequence[Candle]) -> list[CandlestickPattern]:
    """Return named formations ending at the latest available candle."""
    if len(candles) < 3:
        return []
    previous = candles[-2]
    latest = candles[-1]
    first = candles[-3]
    matches: list[CandlestickPattern] = []
    if _is_doji(latest):
        matches.append(CandlestickPattern("doji", "Doji", Direction.hold, 0.0))
    if _bullish_engulfing(previous, latest):
        matches.append(
            CandlestickPattern("bullish-engulfing", "Bullish engulfing", Direction.buy, 74.0)
        )
    if _bearish_engulfing(previous, latest):
        matches.append(
            CandlestickPattern("bearish-engulfing", "Bearish engulfing", Direction.sell, 74.0)
        )
    if _morning_star(first, previous, latest):
        matches.append(CandlestickPattern("morning-star", "Morning star", Direction.buy, 78.0))
    if _evening_star(first, previous, latest):
        matches.append(CandlestickPattern("evening-star", "Evening star", Direction.sell, 78.0))
    if _three_white_soldiers(candles[-3:]):
        matches.append(
            CandlestickPattern("three-white-soldiers", "Three white soldiers", Direction.buy, 76.0)
        )
    if _three_black_crows(candles[-3:]):
        matches.append(
            CandlestickPattern("three-black-crows", "Three black crows", Direction.sell, 76.0)
        )
    return matches


def _bullish_engulfing(previous: Candle, latest: Candle) -> bool:
    return (
        _bearish(previous)
        and _bullish(latest)
        and latest.open <= previous.close
        and latest.close >= previous.open
        and _body(latest) > _body(previous)
    )


def _bearish_engulfing(previous: Candle, latest: Candle) -> bool:
    return (
        _bullish(previous)
        and _bearish(latest)
        and latest.open >= previous.close
        and latest.close <= previous.open
        and _body(latest) > _body(previous)
    )


def _morning_star(first: Candle, middle: Candle, latest: Candle) -> bool:
    return (
        _bearish(first)
        and _body(first) / max(_range(first), 1e-12) >= 0.5
        and _body(middle) <= _body(first) * 0.45
        and _bullish(latest)
        and latest.close >= (first.open + first.close) / 2
    )


def _evening_star(first: Candle, middle: Candle, latest: Candle) -> bool:
    return (
        _bullish(first)
        and _body(first) / max(_range(first), 1e-12) >= 0.5
        and _body(middle) <= _body(first) * 0.45
        and _bearish(latest)
        and latest.close <= (first.open + first.close) / 2
    )


def _three_white_soldiers(candles: Sequence[Candle]) -> bool:
    return (
        len(candles) == 3
        and all(_bullish(candle) for candle in candles)
        and all(_body(candle) / max(_range(candle), 1e-12) >= 0.45 for candle in candles)
        and all(
            current.close > previous.close and previous.open <= current.open <= previous.close
            for previous, current in zip(candles[:-1], candles[1:], strict=True)
        )
    )


def _three_black_crows(candles: Sequence[Candle]) -> bool:
    return (
        len(candles) == 3
        and all(_bearish(candle) for candle in candles)
        and all(_body(candle) / max(_range(candle), 1e-12) >= 0.45 for candle in candles)
        and all(
            current.close < previous.close and previous.close <= current.open <= previous.open
            for previous, current in zip(candles[:-1], candles[1:], strict=True)
        )
    )


def _bullish(candle: Candle) -> bool:
    return candle.close > candle.open


def _bearish(candle: Candle) -> bool:
    return candle.close < candle.open


def _body(candle: Candle) -> float:
    return abs(candle.close - candle.open)


def _range(candle: Candle) -> float:
    return max(0.0, candle.high - candle.low)


def _is_doji(candle: Candle) -> bool:
    return _range(candle) > 0 and _body(candle) <= _range(candle) * 0.1


def _ema(values: Sequence[float], period: int) -> float:
    if not values:
        return 0.0
    alpha = 2 / (period + 1)
    result = values[0]
    for value in values[1:]:
        result = alpha * value + (1 - alpha) * result
    return result


def _atr(candles: Sequence[Candle]) -> float:
    if len(candles) < 2:
        return 0.0
    ranges: list[float] = []
    previous_close = candles[0].close
    for candle in candles[1:]:
        ranges.append(
            max(
                candle.high - candle.low,
                abs(candle.high - previous_close),
                abs(candle.low - previous_close),
            )
        )
        previous_close = candle.close
    return sum(ranges) / len(ranges) if ranges else 0.0
