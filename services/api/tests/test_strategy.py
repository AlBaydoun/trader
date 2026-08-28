from app.services.market_data import MarketDataService
from app.services.strategy import SignalEngine


def test_signal_has_explainable_reasons() -> None:
    candles = MarketDataService().candles("XAUUSD", "1m", 120)

    signal = SignalEngine().generate(candles)

    assert signal.symbol == "XAUUSD"
    assert signal.reasons
    assert 0 <= signal.confidence <= 1
