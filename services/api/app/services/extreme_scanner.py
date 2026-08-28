from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from math import tanh
from threading import RLock
from uuid import uuid4

from app.domain.models import Candle
from app.services.accounts import BrokerAccountProfile
from app.services.mt5_bridge import MT5ReadOnlyBridge


@dataclass(frozen=True)
class ExtremeReading:
    symbol: str
    price: float
    score: float
    level: str
    rsi1: float
    macd: float
    macd_signal: float
    macd_histogram: float
    ema_fast: float
    ema_slow: float
    recommendation: str
    reasons: list[str]
    source: str
    detected_at: datetime


@dataclass(frozen=True)
class ExtremeAlert:
    id: str
    symbol: str
    level: str
    score: float
    rsi1: float
    macd: float
    macd_signal: float
    ema_fast: float
    ema_slow: float
    recommendation: str
    reasons: list[str]
    triggered_at: datetime
    source: str


@dataclass(frozen=True)
class ExtremeScanResult:
    source: str
    timeframe: str
    available_symbols: int
    scanned_symbols: int
    generated_at: datetime
    upper_level: float
    lower_level: float
    readings: list[ExtremeReading]
    alerts: list[ExtremeAlert]
    recent_alerts: list[ExtremeAlert]
    disclaimer: str


class ExtremeSignalScanner:
    """Whole-catalog RSI/MACD/MA monitor with threshold-crossing alerts."""

    upper_level = 85.0
    lower_level = 15.0

    def __init__(
        self,
        bridge: MT5ReadOnlyBridge,
        cache_seconds: int = 10,
        alert_cooldown_seconds: int = 300,
    ) -> None:
        self.bridge = bridge
        self.cache_for = timedelta(seconds=cache_seconds)
        self.alert_cooldown = timedelta(seconds=alert_cooldown_seconds)
        self._states: dict[str, tuple[str, datetime]] = {}
        self._recent_alerts: list[ExtremeAlert] = []
        self._cache_key = ""
        self._cached_at: datetime | None = None
        self._cached: ExtremeScanResult | None = None
        self._lock = RLock()

    def scan(
        self,
        account: BrokerAccountProfile | None,
        timeframe: str,
        max_symbols: int,
        result_limit: int,
        force: bool = False,
    ) -> ExtremeScanResult:
        with self._lock:
            now = datetime.now(UTC)
            key = f"{account.id if account else 'none'}:{timeframe}:{max_symbols}"
            if (
                not force
                and self._cached is not None
                and self._cache_key == key
                and self._cached_at is not None
                and now - self._cached_at < self.cache_for
            ):
                return self._limited(self._cached, result_limit)

            symbols, candles_by_symbol = self.bridge.scan_market_candles(
                account,
                timeframe,
                60,
                max_symbols,
            )
            readings: list[ExtremeReading] = []
            alerts: list[ExtremeAlert] = []
            for symbol, candles in candles_by_symbol.items():
                reading = self._reading(symbol, candles)
                readings.append(reading)
                alert = self._threshold_alert(reading)
                if alert is not None:
                    alerts.append(alert)
                    self._recent_alerts.insert(0, alert)
            self._recent_alerts = self._recent_alerts[:200]
            readings.sort(key=lambda item: abs(item.score - 50), reverse=True)
            result = ExtremeScanResult(
                source="mt5" if symbols else "unavailable",
                timeframe=timeframe,
                available_symbols=len(symbols),
                scanned_symbols=len(candles_by_symbol),
                generated_at=now,
                upper_level=self.upper_level,
                lower_level=self.lower_level,
                readings=readings,
                alerts=alerts,
                recent_alerts=list(self._recent_alerts),
                disclaimer=(
                    "RSI(1) is intentionally highly reactive and can remain extreme. MACD and "
                    "moving average values are confirmation context, not a guaranteed reversal "
                    "signal. Alerts are decision support and never place orders."
                ),
            )
            self._cache_key = key
            self._cached_at = now
            self._cached = result
            return self._limited(result, result_limit)

    def _reading(self, symbol: str, candles: list[Candle]) -> ExtremeReading:
        closes = [candle.close for candle in candles]
        ema_fast = self._ema(closes, 5)
        ema_slow = self._ema(closes, 6)
        macd = ema_fast - ema_slow
        macd_signal = macd
        macd_histogram = macd - macd_signal
        atr = self._atr(candles[-15:])
        macd_bias = 50.0 + 50.0 * tanh((macd / atr) * 3.0) if atr else 50.0
        rsi1 = self._rsi_one(closes)
        trend_bias = 100.0 if ema_fast >= ema_slow else 0.0
        score = max(0.0, min(100.0, rsi1 * 0.7 + macd_bias * 0.2 + trend_bias * 0.1))
        level = self._level(score)
        recommendation, reasons = self._recommendation(level, rsi1, macd, ema_fast, ema_slow, atr)
        return ExtremeReading(
            symbol=symbol,
            price=closes[-1],
            score=round(score, 2),
            level=level,
            rsi1=round(rsi1, 2),
            macd=round(macd, 8),
            macd_signal=round(macd_signal, 8),
            macd_histogram=round(macd_histogram, 8),
            ema_fast=round(ema_fast, 8),
            ema_slow=round(ema_slow, 8),
            recommendation=recommendation,
            reasons=reasons,
            source=candles[-1].source,
            detected_at=candles[-1].ts,
        )

    def _threshold_alert(self, reading: ExtremeReading) -> ExtremeAlert | None:
        if reading.level == "neutral":
            self._states[reading.symbol] = ("neutral", datetime.now(UTC))
            return None
        now = datetime.now(UTC)
        previous_level, previous_alert_at = self._states.get(reading.symbol, ("neutral", now))
        self._states[reading.symbol] = (reading.level, now)
        entered_level = previous_level != reading.level
        cooldown_elapsed = now - previous_alert_at >= self.alert_cooldown
        if not entered_level and not cooldown_elapsed:
            return None
        return ExtremeAlert(
            id=f"extreme-{uuid4().hex[:12]}",
            symbol=reading.symbol,
            level=reading.level,
            score=reading.score,
            rsi1=reading.rsi1,
            macd=reading.macd,
            macd_signal=reading.macd_signal,
            ema_fast=reading.ema_fast,
            ema_slow=reading.ema_slow,
            recommendation=reading.recommendation,
            reasons=reading.reasons,
            triggered_at=now,
            source=reading.source,
        )

    def _recommendation(
        self,
        level: str,
        rsi1: float,
        macd: float,
        ema_fast: float,
        ema_slow: float,
        atr: float,
    ) -> tuple[str, list[str]]:
        if level == "upper_85":
            confirmed = macd < 0 and ema_fast < ema_slow
            recommendation = (
                "Reversal sell watch: MACD and MA confirm weakness."
                if confirmed
                else "Overbought watch: wait for MACD/MA reversal before selling."
            )
        elif level == "lower_15":
            confirmed = macd > 0 and ema_fast > ema_slow
            recommendation = (
                "Reversal buy watch: MACD and MA confirm recovery."
                if confirmed
                else "Oversold watch: wait for MACD/MA recovery before buying."
            )
        else:
            recommendation = "No extreme-level action."
        macd_state = "above" if macd >= 0 else "below"
        ma_state = "above" if ema_fast >= ema_slow else "below"
        reasons = [
            (
                f"RSI(1) is {rsi1:.2f}, with alert levels at {self.upper_level:.2f} "
                f"and {self.lower_level:.2f}."
            ),
            (
                f"MACD(5,6,1) is {macd_state} zero at {macd:.8g}; period-1 signal "
                f"makes the histogram {0.0:.8g}."
            ),
            f"Fast moving average is {ma_state} the slow moving average; ATR context is {atr:.8g}.",
        ]
        return recommendation, reasons

    def _level(self, score: float) -> str:
        if score >= self.upper_level:
            return "upper_85"
        if score <= self.lower_level:
            return "lower_15"
        return "neutral"

    @staticmethod
    def _rsi_one(closes: list[float]) -> float:
        if len(closes) < 2:
            return 50.0
        change = closes[-1] - closes[-2]
        if change > 0:
            return 100.0
        if change < 0:
            return 0.0
        return 50.0

    @staticmethod
    def _ema(values: list[float], period: int) -> float:
        multiplier = 2 / (period + 1)
        value = values[0]
        for item in values[1:]:
            value = (item - value) * multiplier + value
        return value

    @staticmethod
    def _atr(candles: list[Candle]) -> float:
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

    @staticmethod
    def _limited(result: ExtremeScanResult, limit: int) -> ExtremeScanResult:
        return ExtremeScanResult(
            source=result.source,
            timeframe=result.timeframe,
            available_symbols=result.available_symbols,
            scanned_symbols=result.scanned_symbols,
            generated_at=result.generated_at,
            upper_level=result.upper_level,
            lower_level=result.lower_level,
            readings=result.readings[:limit],
            alerts=result.alerts,
            recent_alerts=result.recent_alerts,
            disclaimer=result.disclaimer,
        )
