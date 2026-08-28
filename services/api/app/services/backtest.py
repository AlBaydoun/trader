from dataclasses import dataclass

from app.domain.models import Candle, Direction
from app.services.strategy import SignalEngine


@dataclass(frozen=True)
class BacktestResult:
    symbol: str
    timeframe: str
    trades: int
    win_rate: float
    net_return_pct: float
    max_drawdown_pct: float
    source: str


class BacktestService:
    def __init__(self, signal_engine: SignalEngine) -> None:
        self.signal_engine = signal_engine

    def run(self, candles: list[Candle], window: int = 80) -> BacktestResult:
        if len(candles) < window + 5:
            raise ValueError("Not enough candles for the requested backtest window")

        equity = 10000.0
        peak = equity
        wins = 0
        trades = 0
        max_drawdown = 0.0

        for index in range(window, len(candles) - 1):
            signal = self.signal_engine.generate(candles[index - window : index])
            if signal.direction == Direction.hold:
                continue
            next_close = candles[index + 1].close
            pnl = next_close - signal.entry
            if signal.direction == Direction.sell:
                pnl *= -1
            pct = pnl / signal.entry
            equity *= 1 + pct
            trades += 1
            if pnl > 0:
                wins += 1
            peak = max(peak, equity)
            max_drawdown = max(max_drawdown, (peak - equity) / peak)

        return BacktestResult(
            symbol=candles[-1].symbol,
            timeframe=candles[-1].timeframe,
            trades=trades,
            win_rate=round(wins / trades, 3) if trades else 0.0,
            net_return_pct=round(((equity - 10000.0) / 10000.0) * 100, 3),
            max_drawdown_pct=round(max_drawdown * 100, 3),
            source=candles[-1].source,
        )
