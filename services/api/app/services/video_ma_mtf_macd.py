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
VIDEO_MA_SPECS = (
    ("ema", 200),
    ("ema", 100),
    ("ema", 50),
    ("ema", 20),
    ("sma", 1),
)


class VideoMAMTFMACDBotService:
    """Paper-only scalping interpretation of the supplied MA ribbon/MACD rules."""

    name = "Video MA + MTF MACD Bot"
    default_timeframe = "5m"

    def __init__(
        self,
        ledger: PaperTradingService,
        bridge: MT5ReadOnlyBridge,
        *,
        timeframe_options: Sequence[str] = SUPPORTED_TIMEFRAMES,
        target_r_multiple: float = 1.5,
        ma_specs: Sequence[tuple[str, int]] = VIDEO_MA_SPECS,
        ma_periods: Sequence[int] | None = None,
        rsi_period: int = 14,
        macd_fast: int = 12,
        macd_slow: int = 26,
        macd_signal: int = 9,
        swing_lookback: int = 5,
        pullback_atr_tolerance: float = 0.75,
        partial_r_multiple: float = 1.0,
    ) -> None:
        self.ledger = ledger
        self.bridge = bridge
        self.timeframe_options = (
            tuple(item for item in timeframe_options if item in SUPPORTED_TIMEFRAMES)
            or SUPPORTED_TIMEFRAMES
        )
        self.target_r_multiple = target_r_multiple
        if ma_periods is not None:
            ma_specs = tuple(("ema", period) for period in ma_periods)
        self.ma_specs = _normalise_ma_specs(ma_specs)
        self.rsi_period = rsi_period
        self.macd_fast = macd_fast
        self.macd_slow = macd_slow
        self.macd_signal = macd_signal
        self.swing_lookback = swing_lookback
        self.pullback_atr_tolerance = pullback_atr_tolerance
        self.partial_r_multiple = partial_r_multiple
        if target_r_multiple <= partial_r_multiple:
            raise ValueError("The final target must be greater than the partial target.")

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
            max(260, max(period for _, period in self.ma_specs) + 20),
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
                "This is a configurable, paper-only interpretation of the supplied fast-scalping "
                "rules: a 10-in-1 EMA ribbon, pullback, RSI/reversal-candle momentum, and custom "
                "multi-timeframe MACD confirmation. The exact TradingView script settings were not "
                "provided, so this is not a pixel-identical or proprietary-script clone. It does "
                "not guarantee profit."
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
        minimum_candles = max(
            max(period for _, period in self.ma_specs) + 3,
            self.macd_slow + self.macd_signal + 3,
            220,
        )
        if len(candles) < minimum_candles or metadata is None:
            return None
        values = [candle.close for candle in candles]
        moving_averages = [
            _moving_average_series(values, method, period)
            for method, period in self.ma_specs
        ]
        current_macd, current_signal, current_histogram = _macd(
            values,
            self.macd_fast,
            self.macd_slow,
            self.macd_signal,
        )
        higher_timeframe = HIGHER_TIMEFRAME.get(timeframe, timeframe)
        higher_candles = _aggregate_candles(candles, higher_timeframe)
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

        trend_series = [
            series
            for (_, period), series in zip(self.ma_specs, moving_averages, strict=True)
            if period > 1
        ][::-1]
        latest_ribbon = [series[-1] for series in trend_series]
        previous_ribbon = [series[-2] for series in trend_series]
        alignment_required = max(3, len(latest_ribbon) - 2)
        bullish_alignment = _ribbon_alignment(latest_ribbon, True)
        bearish_alignment = _ribbon_alignment(latest_ribbon, False)
        bullish_slope = latest_ribbon[-1] > trend_series[-1][-3]
        bearish_slope = latest_ribbon[-1] < trend_series[-1][-3]
        pullback_window = candles[-max(self.swing_lookback * 2 + 2, 8) : -1]
        support = min(item.low for item in pullback_window)
        resistance = max(item.high for item in pullback_window)
        tolerance = atr * self.pullback_atr_tolerance
        bullish_pullback = _pullback_touched(
            previous,
            previous_ribbon[:5],
            support,
            tolerance,
            True,
        )
        bearish_pullback = _pullback_touched(
            previous,
            previous_ribbon[:5],
            resistance,
            tolerance,
            False,
        )
        rsi = _rsi_series(values, self.rsi_period)
        bullish_rsi_reversal = _rsi_reversal(rsi, True)
        bearish_rsi_reversal = _rsi_reversal(rsi, False)
        bullish_candle_reversal = _bullish_reversal_candle(previous, latest)
        bearish_candle_reversal = _bearish_reversal_candle(previous, latest)
        current_histogram_state = _histogram_state(
            current_histogram[-1], current_histogram[-2]
        )
        higher_histogram_state = _histogram_state(
            higher_histogram[-1], higher_histogram[-2]
        )
        bullish_macd = (
            current_macd[-1] > current_signal[-1]
            and current_histogram[-1] > 0
            and higher_macd[-1] > higher_signal[-1]
            and higher_histogram[-1] > 0
        )
        bearish_macd = (
            current_macd[-1] < current_signal[-1]
            and current_histogram[-1] < 0
            and higher_macd[-1] < higher_signal[-1]
            and higher_histogram[-1] < 0
        )
        bullish = (
            latest.close > latest_ribbon[0]
            and bullish_alignment >= alignment_required
            and bullish_slope
            and bullish_pullback
            and (bullish_candle_reversal or bullish_rsi_reversal)
            and bullish_macd
        )
        bearish = (
            latest.close < latest_ribbon[0]
            and bearish_alignment >= alignment_required
            and bearish_slope
            and bearish_pullback
            and (bearish_candle_reversal or bearish_rsi_reversal)
            and bearish_macd
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
            stop_loss = min(item.low for item in candles[-self.swing_lookback - 1 : -1]) - atr * 0.2
            risk_distance = latest.close - stop_loss
            take_profit = latest.close + risk_distance * self.target_r_multiple
            partial_take_profit = latest.close + risk_distance * self.partial_r_multiple
            impact: Literal["bullish", "bearish"] = "bullish"
            trend_message = (
                f"Closed price is above the fastest trend MA and {bullish_alignment}/"
                f"{len(latest_ribbon) - 1} ribbon "
                "relationships are bullish."
            )
            direction_message = (
                "The prior candle pulled back into the fast EMA ribbon or recent support, "
                "then the latest candle reclaimed direction."
            )
            candle_message = _momentum_message(
                bullish_candle_reversal,
                bullish_rsi_reversal,
                True,
            )
            macd_message = (
                "Current and higher-timeframe CM MACD lines and histograms agree bullishly; "
                f"histogram states are {current_histogram_state}/{higher_histogram_state}."
            )
        else:
            stop_loss = (
                max(item.high for item in candles[-self.swing_lookback - 1 : -1]) + atr * 0.2
            )
            risk_distance = stop_loss - latest.close
            take_profit = latest.close - risk_distance * self.target_r_multiple
            partial_take_profit = latest.close - risk_distance * self.partial_r_multiple
            impact = "bearish"
            trend_message = (
                f"Closed price is below the fastest trend MA and {bearish_alignment}/"
                f"{len(latest_ribbon) - 1} ribbon "
                "relationships are bearish."
            )
            direction_message = (
                "The prior candle pulled back into the fast EMA ribbon or recent resistance, "
                "then the latest candle rejected lower."
            )
            candle_message = _momentum_message(
                bearish_candle_reversal,
                bearish_rsi_reversal,
                False,
            )
            macd_message = (
                "Current and higher-timeframe CM MACD lines and histograms agree bearishly; "
                f"histogram states are {current_histogram_state}/{higher_histogram_state}."
            )
        if stop_loss <= 0 or take_profit <= 0 or partial_take_profit <= 0 or risk_distance <= 0:
            return None

        alignment = bullish_alignment if direction == Direction.buy else bearish_alignment
        candle_reversal = bullish_candle_reversal or bearish_candle_reversal
        rsi_reversal = bullish_rsi_reversal or bearish_rsi_reversal
        histogram_rising = (
            current_histogram[-1] > current_histogram[-2]
            if direction == Direction.buy
            else current_histogram[-1] < current_histogram[-2]
        )
        body_ratio = _body(latest) / max(_range(latest), 1e-12)
        score = 70.0
        score += min(9.0, float(alignment))
        score += 3.0 if candle_reversal else 0.0
        score += 3.0 if rsi_reversal else 0.0
        score += min(4.0, body_ratio * 4.0)
        score += 2.0 if histogram_rising else 0.0
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
            description=f"{symbol} 10-in-1 MA setup with pullback + CM MTF MACD",
            category=self.name,
            direction=direction,
            confidence=round(min(0.96, 0.72 + score / 400), 3),
            entry=latest.close,
            stop_loss=round(stop_loss, 8),
            take_profit=round(take_profit, 8),
            partial_take_profit=round(partial_take_profit, 8),
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
                    f"{macd_message} Confirmation timeframe: {higher_timeframe}.",
                    impact,
                    0.28,
                ),
                SignalReason("momentum", candle_message, impact, 0.12),
                SignalReason(
                    "risk",
                    (
                        f"Swing/ATR stop is {risk_distance:.8g} away; TP1 is "
                        f"{self.partial_r_multiple:.2f}R, final target is "
                        f"{self.target_r_multiple:.2f}R. After TP1 the paper ledger closes half "
                        "and moves the remaining stop to breakeven."
                    ),
                    "risk",
                    0.2,
                ),
            ],
            signal_at=latest.ts,
            signal_price=latest.close,
            signal_level="video-ma-ribbon-mtf-macd",
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
    # CM_Ult_MacD_MTF uses SMA(macd, signalLength), not the EMA signal used by
    # many standard MACD implementations.
    signal = _sma_series(main, signal_period)
    histogram = [
        main_value - signal_value
        for main_value, signal_value in zip(main, signal, strict=True)
    ]
    return main, signal, histogram


def _sma_series(values: Sequence[float], period: int) -> list[float]:
    if not values:
        return []
    result: list[float] = []
    running_total = 0.0
    for index, value in enumerate(values):
        running_total += float(value)
        if index >= period:
            running_total -= float(values[index - period])
        window = min(index + 1, period)
        result.append(running_total / window)
    return result


def _normalise_ma_specs(specs: Sequence[tuple[str, int]]) -> tuple[tuple[str, int], ...]:
    normalised = tuple((str(method).casefold(), int(period)) for method, period in specs)
    if not 1 <= len(normalised) <= 10:
        raise ValueError("The video strategy supports one to ten moving-average lines.")
    if any(method not in {"ema", "sma"} or period < 1 for method, period in normalised):
        raise ValueError("Moving-average lines must use EMA or SMA with a period >= 1.")
    if sum(period > 1 for _, period in normalised) < 2:
        raise ValueError("The video strategy needs at least two trend moving-average lines.")
    return normalised


def _moving_average_series(values: Sequence[float], method: str, period: int) -> list[float]:
    return _sma_series(values, period) if method == "sma" else _ema_series(values, period)


def _ribbon_alignment(values: Sequence[float], bullish: bool) -> int:
    return sum(
        left > right if bullish else left < right
        for left, right in zip(values, values[1:], strict=False)
    )


def _pullback_touched(
    candle: Candle,
    moving_average_levels: Sequence[float],
    structure_level: float,
    tolerance: float,
    bullish: bool,
) -> bool:
    levels = [*moving_average_levels, structure_level]
    touched = any(
        candle.low <= level + tolerance and candle.high >= level - tolerance
        for level in levels
    )
    return touched and (candle.close < candle.open if bullish else candle.close > candle.open)


def _rsi_series(values: Sequence[float], period: int) -> list[float]:
    if not values:
        return []
    if period < 2 or len(values) <= period:
        return [50.0] * len(values)
    gains = [0.0] * len(values)
    losses = [0.0] * len(values)
    for index in range(1, len(values)):
        change = float(values[index]) - float(values[index - 1])
        gains[index] = max(change, 0.0)
        losses[index] = max(-change, 0.0)
    average_gain = sum(gains[1 : period + 1]) / period
    average_loss = sum(losses[1 : period + 1]) / period
    result = [50.0] * len(values)

    def value() -> float:
        if average_loss == 0:
            return 100.0 if average_gain > 0 else 50.0
        relative_strength = average_gain / average_loss
        return 100.0 - 100.0 / (1.0 + relative_strength)

    result[period] = value()
    for index in range(period + 1, len(values)):
        average_gain = ((average_gain * (period - 1)) + gains[index]) / period
        average_loss = ((average_loss * (period - 1)) + losses[index]) / period
        result[index] = value()
    return result


def _rsi_reversal(values: Sequence[float], bullish: bool) -> bool:
    if len(values) < 2:
        return False
    previous, current = values[-2], values[-1]
    if bullish:
        return current > previous and current >= 45.0 and (previous <= 50.0 or current >= 52.0)
    return current < previous and current <= 55.0 and (previous >= 50.0 or current <= 48.0)


def _histogram_state(current: float, previous: float) -> str:
    """Return the four-color CM MACD histogram state used by the supplied script."""
    if current > previous and current > 0:
        return "aqua"
    if current < previous and current > 0:
        return "blue"
    if current < previous and current <= 0:
        return "red"
    if current > previous and current <= 0:
        return "maroon"
    return "yellow"


def _bullish_reversal_candle(previous: Candle, latest: Candle) -> bool:
    previous_bearish = previous.close < previous.open
    latest_bullish = latest.close > latest.open
    engulfing = (
        previous_bearish
        and latest_bullish
        and latest.open <= previous.close
        and latest.close >= previous.open
    )
    body = _body(latest)
    lower_wick = min(latest.open, latest.close) - latest.low
    pin_reversal = (
        latest_bullish
        and lower_wick >= max(body * 1.25, _range(latest) * 0.35)
        and latest.close > previous.close
    )
    breakout = latest_bullish and latest.close > previous.high
    return engulfing or pin_reversal or breakout


def _bearish_reversal_candle(previous: Candle, latest: Candle) -> bool:
    previous_bullish = previous.close > previous.open
    latest_bearish = latest.close < latest.open
    engulfing = (
        previous_bullish
        and latest_bearish
        and latest.open >= previous.close
        and latest.close <= previous.open
    )
    body = _body(latest)
    upper_wick = latest.high - max(latest.open, latest.close)
    pin_reversal = (
        latest_bearish
        and upper_wick >= max(body * 1.25, _range(latest) * 0.35)
        and latest.close < previous.close
    )
    breakout = latest_bearish and latest.close < previous.low
    return engulfing or pin_reversal or breakout


def _momentum_message(
    candle_reversal: bool,
    rsi_reversal: bool,
    bullish: bool,
) -> str:
    direction = "bullish" if bullish else "bearish"
    signals = []
    if candle_reversal:
        signals.append(f"a {direction} reversal candle or breakout")
    if rsi_reversal:
        signals.append("an RSI reversal")
    evidence = " and ".join(signals) if signals else "confirmed momentum"
    return f"The latest closed candle confirms {direction} momentum through {evidence}."


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
