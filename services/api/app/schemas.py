from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ReasonDTO(APIModel):
    category: str
    message: str
    impact: Literal["bullish", "bearish", "neutral", "risk"]
    weight: float


class SignalDTO(APIModel):
    symbol: str
    timeframe: str
    direction: Literal["buy", "sell", "hold"]
    confidence: float
    entry: float
    stop_loss: float | None
    take_profit: float | None
    reasons: list[ReasonDTO]
    source: Literal["demo", "mt5"]
    created_at: datetime


class CandleDTO(APIModel):
    symbol: str
    timeframe: str
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    source: Literal["demo", "mt5"]


class OrderRequestDTO(APIModel):
    symbol: str
    direction: Literal["buy", "sell", "hold"]
    volume: float = Field(gt=0)
    entry: float = Field(gt=0)
    stop_loss: float | None = None
    take_profit: float | None = None
    mode: Literal["signal_only", "auto_trade"] = "signal_only"


class RiskDecisionDTO(APIModel):
    approved: bool
    reason: str
    max_volume: float


class PositionDTO(APIModel):
    id: str
    symbol: str
    direction: Literal["buy", "sell", "hold"]
    volume: float
    entry: float
    stop_loss: float | None
    take_profit: float | None
    opened_at: datetime


class BacktestDTO(APIModel):
    symbol: str
    timeframe: str
    trades: int
    win_rate: float
    net_return_pct: float
    max_drawdown_pct: float
    source: Literal["demo", "mt5"]


class StrategyDTO(APIModel):
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


class MarketImpactDTO(APIModel):
    symbol: str
    direction: Literal["bullish", "bearish", "mixed", "neutral"]
    confidence: float
    horizon: str
    thesis: str
    causal_chain: list[str]
    bullish_trigger: str
    bearish_trigger: str
    invalidation: str


class MarketEventDTO(APIModel):
    id: str
    title: str
    category: str
    scope: Literal["global", "symbol"]
    symbols: list[str]
    severity: Literal["low", "medium", "high"]
    source: str
    source_url: str | None
    published_at: datetime
    event_time: datetime
    analysis: str
    why_it_matters: list[str]
    risk_window: str
    actual: float | None
    forecast: float | None
    previous: float | None
    impacts: list[MarketImpactDTO]


class NewsStatusDTO(APIModel):
    provider: str
    state: Literal["live", "stale", "config_required", "error"]
    message: str
    calendar_connected: bool
    headlines_connected: bool
    updated_at: datetime


class NewsFeedDTO(APIModel):
    status: NewsStatusDTO
    events: list[MarketEventDTO]


class ScanDTO(APIModel):
    signals: list[SignalDTO]
    events: list[MarketEventDTO]
    news_status: NewsStatusDTO


class BrokerAccountDTO(APIModel):
    id: str
    provider: str
    server: str
    account_type: str
    login_masked: str
    active: bool
    profile_configured: bool
    terminal_configured: bool
    connection_verified: bool
    connection_ready: bool


class AccountListDTO(APIModel):
    active_account_id: str | None
    accounts: list[BrokerAccountDTO]


class ActiveAccountRequestDTO(APIModel):
    account_id: str = Field(min_length=3)


class MT5ConnectionDTO(APIModel):
    status: str
    message: str
    read_only: bool
    package_available: bool
    initialized: bool
    terminal_connected: bool
    account_matches: bool
    server_matches: bool
    connection_verified: bool
    selected_login_masked: str
    terminal_login_masked: str
    terminal_server: str
    package_version: str
    terminal_version: str
    company: str
    currency: str
    leverage: int
    balance: float | None
    equity: float | None
    profit: float | None
    margin: float | None
    margin_free: float | None
    margin_level: float | None
    trade_allowed: bool
    expert_orders_allowed: bool
    symbols_count: int
    positions_count: int
    updated_at: datetime


class MT5QuoteDTO(APIModel):
    requested_symbol: str
    symbol: str
    bid: float
    ask: float
    spread: float
    digits: int
    visible: bool
    trade_mode: int
    updated_at: datetime


class MT5PositionDTO(APIModel):
    ticket: str
    symbol: str
    direction: Literal["buy", "sell"]
    volume: float
    price_open: float
    price_current: float
    stop_loss: float | None
    take_profit: float | None
    profit: float
    opened_at: datetime


class MarketSymbolDTO(APIModel):
    symbol: str
    description: str
    category: str
    currency_base: str
    currency_profit: str
    digits: int
    bid: float
    ask: float
    spread_points: float
    visible: bool
    trade_mode: int
    last_tick_at: datetime | None
    source: Literal["mt5", "configured"]


class MarketOpportunityDTO(APIModel):
    rank: int
    symbol: str
    description: str
    category: str
    direction: Literal["buy", "sell", "hold"]
    confidence: float
    opportunity_score: float
    estimated_move_pct: float
    spread_pct: float
    market_active: bool
    quote_age_seconds: int | None
    recommendation: str
    reasons: list[ReasonDTO]


class MarketScanDTO(APIModel):
    source: str
    timeframe: str
    available_symbols: int
    scanned_symbols: int
    generated_at: datetime
    disclaimer: str
    opportunities: list[MarketOpportunityDTO]


class StatusDTO(APIModel):
    trading_mode: str
    broker_adapter: str
    live_trading_enabled: bool
    live_trading_unlocked: bool
    default_symbols: list[str]
    guardrails: dict[str, float | int]
    broker_account: BrokerAccountDTO | None
    mt5: MT5ConnectionDTO
