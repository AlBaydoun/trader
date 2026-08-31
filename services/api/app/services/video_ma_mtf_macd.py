from collections.abc import Sequence
from dataclasses import replace
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
TIMEFRAME_MINUTES = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "1h": 60,
    "4h": 240,
    "1d": 1440,
}
HIGHER_TIMEFRAME = {
    "1m": "5m",
    "5m": "15m",
    "15m": "1h",
    "1h": "4h",
    "4h": "1d",
    "1d": "1d",
}


class VideoMAMTFMACDBotService:
    """Paper-only interpretation of the MA + multi-timeframe MACD setup in the video."""

    name = "Video MA + MTF MACD Bot"
    default_timeframe = "5m"

    def __init__(
        self,
        ledger: PaperTradingService,
        bridge: MT5ReadOnlyBridge,
        *,
        timeframe_options: Sequence[str] = SUPPORTED_TIMEFRAMES,
        target_r_multiple: float = 2.0,
        trend_period: int = 200,
        fast_period: int = 9,
        slow_period: int = 36,
        macd_fast: int = 12,
        macd_slow: int = 26,
        macd_signal: int = 9,
        swing_lookback: int = 5,
    ) -> None:
        self.ledger = ledger
        self.bridge = bridge
        self.timeframe_options = (
            tuple(item for item in timeframe_options if item in SUPPORTED_TIMEFRAMES)
            or SUPPORTED_TIMEFRAMES
        )
        self.target_r_multiple = target_r_multiple
        self.trend_period = trend_period
        self.fast_period = fast_period
        self.slow_period = slow_period
        self.macd_fast = macd_fast
        self.macd_slow = macd_slow
        self.macd_signal = macd_signal
        self.swing_lookback = swing_lookback

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
                "The video-derived virtual cycle was skipped because verified MT5 market "
                "data is unavailable."
            )
            return self.ledger.snapshot()

        prices: dict[str, Candle] = {}
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
        return [
            self.scan(account, timeframe, max_symbols, result_limit, force)
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
            260,
            max_symbols,
            force=force,
        )
        metadata = {item.symbol: item for item in symbols}
        ranked: list[MarketOpportunity] = []
        for symbol, candles in candles_by_symbol.items():
            opportunity = self._opportunity(
                symbol,
                candles,
                metadata.get(symbol),
                timeframe,
                now,
            )
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
            replace(item, rank=rank)
            for rank, item in enumerate(ranked[:result_limit], start=1)
        ]
        return MarketScanResult(
            source="mt5" if symbols else "unavailable",
            timeframe=timeframe,
            available_symbols=len(symbols),
            scanned_symbols=len(candles_by_symbol),
            generated_at=now,
            disclaimer=(
                "This is a configurable, video-derived interpretation of EMA 200, EMA 9/36, "
                "and higher-timeframe MACD confirmation. The source video does not establish "
                "a complete proprietary rule set. Results are paper-only and do not guarantee "
                "profit."
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
        minimum_candles = max(self.trend_period + 2, self.slow_period + 3, 220)
        if len(candles) < minimum_candles or metadata is None:
            return None
        values = [candle.close for candle in candles]
        ema200 = _ema_series(values, self.trend_period)
        fast = _ema_series(values, self.fast_period)
        slow = _ema_series(values, self.slow_period)
        current_macd, current_signal, current_histogram = _macd(
            values,
            self.macd_fast,
            self.macd_slow,
            self.macd_signal,
        )
        higher_candles = _aggregate_candles(candles, HIGHER_TIMEFRAME.get(timeframe, timeframe))
        if len(higher_candles) < self.macd_slow + self.macd_signal + 2:
            return None
        higher_values = [candle.close for candle in higher_candles]
        higher_macd, higher_signal, higher_histogram = _macd(
            higher_values,
            self.macd_fast,
            self.macd_slow,
            self.macd_signal,
        )
        latest = candles[-1]
        previous = candles[-2]
        atr = _atr(candles[-15:])
        if not isfinite(atr) or atr <= 0 or latest.close <= 0:
            return None

        bullish_candle = latest.close > latest.open
        bearish_candle = latest.close < latest.open
        body_ratio = _body(latest) / max(_range(latest), 1e-12)
        bullish_trigger = _fresh_cross_or_reclaim(
            fast[-2], slow[-2], fast[-1], slow[-1], previous.close, latest.close, fast[-2], True
        )
        bearish_trigger = _fresh_cross_or_reclaim(
            fast[-2], slow[-2], fast[-1], slow[-1], previous.close, latest.close, fast[-2], False
        )
        bullish = (
            latest.close > ema200[-1]
            and fast[-1] > slow[-1]
            and current_macd[-1] > current_signal[-1]
            and current_histogram[-1] > 0
            and higher_macd[-1] > higher_signal[-1]
            and higher_histogram[-1] > 0
            and bullish_candle
            and body_ratio >= 0.35
            and bullish_trigger
        )
        bearish = (
            latest.close < ema200[-1]
            and fast[-1] < slow[-1]
            and current_macd[-1] < current_signal[-1]
            and current_histogram[-1] < 0
            and higher_macd[-1] < higher_signal[-1]
            and higher_histogram[-1] < 0
            and bearish_candle
            and body_ratio >= 0.35
            and bearish_trigger
        )
        if not bullish and not bearish:
            return None

        direction = Direction.buy if bullish else Direction.sell
        midpoint = (
            (metadata.bid + metadata.ask) / 2
            if metadata.bid and metadata.ask
            else latest.close
        )
        spread_pct = (metadata.ask - metadata.bid) / midpoint * 100 if midpoint > 0 else 0.0
        if direction == Direction.buy:
            stop_loss = min(item.low for item in candles[-self.swing_lookback:]) - atr * 0.2
            risk_distance = latest.close - stop_loss
            take_profit = latest.close + risk_distance * self.target_r_multiple
            impact: Literal["bullish", "bearish"] = "bullish"
            trend_message = "Closed price is above EMA(200); the regime is bullish."
            direction_message = "EMA(9) is above EMA(36) after a fresh cross or reclaim."
            candle_message = "The latest closed candle is bullish with a meaningful body."
            macd_message = "Current and higher-timeframe MACD histograms are positive."
        else:
            stop_loss = max(item.high for item in candles[-self.swing_lookback:]) + atr * 0.2
            risk_distance = stop_loss - latest.close
            take_profit = latest.close - risk_distance * self.target_r_multiple
            impact = "bearish"
            trend_message = "Closed price is below EMA(200); the regime is bearish."
            direction_message = "EMA(9) is below EMA(36) after a fresh cross or reclaim."
            candle_message = "The latest closed candle is bearish with a meaningful body."
            macd_message = "Current and higher-timeframe MACD histograms are negative."
        if stop_loss <= 0 or take_profit <= 0 or risk_distance <= 0:
            return None

        score = 76.0
        score += min(8.0, abs(fast[-1] - slow[-1]) / atr * 2.0)
        score += min(6.0, body_ratio * 6.0)
        score += min(5.0, abs(higher_histogram[-1]) / max(atr, 1e-12) * 2.0)
        score -= min(8.0, spread_pct * 150)
        score = round(max(0.0, min(100.0, score)), 1)
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
        return MarketOpportunity(
            rank=0,
            symbol=symbol,
            description=f"{symbol} video-derived MA + MTF MACD setup",
            category=self.name,
            direction=direction,
            confidence=round(min(0.96, 0.72 + score / 400), 3),
            entry=latest.close,
            stop_loss=round(stop_loss, 8),
            take_profit=round(take_profit, 8),
            opportunity_score=score if market_active else round(score * 0.25, 1),
            estimated_move_pct=round(abs(take_profit - latest.close) / latest.close * 100, 3),
            spread_pct=round(spread_pct, 4),
            market_active=market_active,
            quote_age_seconds=quote_age_seconds,
            recommendation=direction.value.upper(),
            reasons=[
                SignalReason("trend", trend_message, impact, 0.2),
                SignalReason("moving-average", direction_message, impact, 0.2),
                SignalReason(
                    "macd",
                    (
                        f"{macd_message} Confirmation timeframe: "
                        f"{HIGHER_TIMEFRAME.get(timeframe, timeframe)}."
                    ),
                    impact,
                    0.28,
                ),
                SignalReason("candle", candle_message, impact, 0.12),
                SignalReason(
                    "risk",
                    (
                        f"Swing/ATR stop is {risk_distance:.8g} away and target is "
                        f"{self.target_r_multiple:.2f}R; paper fill only."
                    ),
                    "risk",
                    0.2,
                ),
            ],
            signal_at=latest.ts,
            signal_price=latest.close,
            signal_level="video-ma-mtf-macd",
            signal_recommendation=direction.value.upper(),
        )

    @staticmethod
    def _empty_scan(timeframe: str, generated_at: datetime) -> MarketScanResult:
        return MarketScanResult(
            source="unavailable",
            timeframe=timeframe,
            available_symbols=0,
            scanned_symbols=0,
            generated_at=generated_at,
            disclaimer="Video MA + MTF MACD Bot is waiting for verified MT5 market data.",
            opportunities=[],
        )


def _ema_series(values: Sequence[float], period: int) -> list[float]:
    if not values:
        return []
    alpha = 2 / (period + 1)
    result = [float(values[0])]
    for value in values[1:]:
        result.append(alpha * float(value) + (1 - alpha) * result[-1])
    return result


def _macd(
    values: Sequence[float],
    fast_period: int,
    slow_period: int,
    signal_period: int,
) -> tuple[list[float], list[float], list[float]]:
    fast = _ema_series(values, fast_period)
    slow = _ema_series(values, slow_period)
    main = [fast_value - slow_value for fast_value, slow_value in zip(fast, slow, strict=True)]
    signal = _ema_series(main, signal_period)
    histogram = [
        main_value - signal_value
        for main_value, signal_value in zip(main, signal, strict=True)
    ]
    return main, signal, histogram


def _fresh_cross_or_reclaim(
    previous_fast: float,
    previous_slow: float,
    current_fast: float,
    current_slow: float,
    previous_close: float,
    current_close: float,
    previous_fast_value: float,
    bullish: bool,
) -> bool:
    if bullish:
        return (current_fast > current_slow and previous_fast <= previous_slow) or (
            previous_close <= previous_fast_value and current_close > current_fast
        )
    return (current_fast < current_slow and previous_fast >= previous_slow) or (
        previous_close >= previous_fast_value and current_close < current_fast
    )


def _aggregate_candles(candles: Sequence[Candle], timeframe: str) -> list[Candle]:
    if not candles:
        return []
    minutes = TIMEFRAME_MINUTES.get(timeframe, 5)
    buckets: list[Candle] = []
    current_bucket: int | None = None
    for candle in candles:
        bucket = int(candle.ts.timestamp()) // (minutes * 60)
        if bucket != current_bucket:
            buckets.append(replace(candle, timeframe=timeframe))
            current_bucket = bucket
            continue
        previous = buckets[-1]
        buckets[-1] = Candle(
            symbol=previous.symbol,
            timeframe=timeframe,
            ts=previous.ts,
            open=previous.open,
            high=max(previous.high, candle.high),
            low=min(previous.low, candle.low),
            close=candle.close,
            volume=previous.volume + candle.volume,
            source=previous.source,
        )
    return buckets


def _atr(candles: Sequence[Candle]) -> float:
    if len(candles) < 2:
        return 0.0
    true_ranges: list[float] = []
    previous_close = candles[0].close
    for candle in candles[1:]:
        true_ranges.append(
            max(
                candle.high - candle.low,
                abs(candle.high - previous_close),
                abs(candle.low - previous_close),
            )
        )
        previous_close = candle.close
    return sum(true_ranges) / len(true_ranges) if true_ranges else 0.0


def _body(candle: Candle) -> float:
    return abs(candle.close - candle.open)


def _range(candle: Candle) -> float:
    return max(0.0, candle.high - candle.low)
