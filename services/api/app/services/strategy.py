from dataclasses import dataclass
from statistics import mean

from app.domain.models import Candle, Direction, Signal, SignalReason


@dataclass(frozen=True)
class StrategyDefinition:
    name: str
    version: str
    summary: str
    components: list[str]
    minimum_candles: int
    entry_threshold: float
    stop_model: str
    target_model: str
    adaptive_learning: bool
    caveat: str


class SignalEngine:
    @staticmethod
    def definition() -> StrategyDefinition:
        return StrategyDefinition(
            name="Trend, Momentum and Structure",
            version="1.0",
            summary=(
                "A deterministic multi-factor strategy that waits for trend and momentum "
                "agreement, checks breakouts, and reduces conviction in elevated volatility."
            ),
            components=[
                "12-candle versus 36-candle trend",
                "8-candle price momentum",
                "24-candle support and resistance breakout",
                "15-candle average true range risk filter",
            ],
            minimum_candles=40,
            entry_threshold=0.38,
            stop_model="1.5 ATR or 0.2% of price, whichever is wider",
            target_model="2:1 target distance relative to stop distance",
            adaptive_learning=False,
            caveat=(
                "The strategy is rule-based and does not retrain itself in live trading. "
                "Changes require backtesting and operator approval."
            ),
        )

    def generate(self, candles: list[Candle]) -> Signal:
        if len(candles) < 40:
            raise ValueError("At least 40 candles are required to generate a signal")

        closes = [candle.close for candle in candles]
        highs = [candle.high for candle in candles]
        lows = [candle.low for candle in candles]
        current = candles[-1]
        fast_ma = mean(closes[-12:])
        slow_ma = mean(closes[-36:])
        momentum = (closes[-1] - closes[-8]) / closes[-8]
        atr = self._average_true_range(candles[-15:])
        volatility_pct = atr / closes[-1]

        score = 0.0
        reasons: list[SignalReason] = []

        if fast_ma > slow_ma:
            score += 0.32
            reasons.append(
                SignalReason("trend", "Fast trend is above the slower baseline.", "bullish", 0.32)
            )
        else:
            score -= 0.32
            reasons.append(
                SignalReason("trend", "Fast trend is below the slower baseline.", "bearish", 0.32)
            )

        if momentum > 0.0015:
            score += 0.28
            reasons.append(
                SignalReason(
                    "momentum",
                    "Recent candles show positive continuation.",
                    "bullish",
                    0.28,
                )
            )
        elif momentum < -0.0015:
            score -= 0.28
            reasons.append(
                SignalReason(
                    "momentum",
                    "Recent candles show downside continuation.",
                    "bearish",
                    0.28,
                )
            )
        else:
            reasons.append(
                SignalReason(
                    "momentum",
                    "Momentum is not strong enough for conviction.",
                    "neutral",
                    0.12,
                )
            )

        breakout_high = max(highs[-24:-1])
        breakdown_low = min(lows[-24:-1])
        if current.close > breakout_high:
            score += 0.2
            reasons.append(
                SignalReason("structure", "Price closed above recent resistance.", "bullish", 0.2)
            )
        elif current.close < breakdown_low:
            score -= 0.2
            reasons.append(
                SignalReason("structure", "Price closed below recent support.", "bearish", 0.2)
            )
        else:
            reasons.append(
                SignalReason("structure", "Price is still inside the recent range.", "neutral", 0.1)
            )

        if volatility_pct > 0.018:
            score *= 0.65
            reasons.append(
                SignalReason("risk", "Volatility is elevated, reducing confidence.", "risk", 0.25)
            )

        direction = Direction.hold
        if score >= 0.38:
            direction = Direction.buy
        elif score <= -0.38:
            direction = Direction.sell

        confidence = min(0.92, max(0.05, abs(score) + 0.3))
        stop_distance = max(atr * 1.5, current.close * 0.002)
        take_distance = stop_distance * 2.0

        if direction == Direction.buy:
            stop_loss = current.close - stop_distance
            take_profit = current.close + take_distance
        elif direction == Direction.sell:
            stop_loss = current.close + stop_distance
            take_profit = current.close - take_distance
        else:
            stop_loss = None
            take_profit = None

        return Signal(
            symbol=current.symbol,
            timeframe=current.timeframe,
            direction=direction,
            confidence=round(confidence, 3),
            entry=round(current.close, 5),
            stop_loss=round(stop_loss, 5) if stop_loss else None,
            take_profit=round(take_profit, 5) if take_profit else None,
            reasons=reasons,
            source=current.source,
        )

    @staticmethod
    def _average_true_range(candles: list[Candle]) -> float:
        ranges = []
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
        return mean(ranges) if ranges else 0.0
