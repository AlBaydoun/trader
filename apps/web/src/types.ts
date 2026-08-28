export type Direction = "buy" | "sell" | "hold";
export type TradeMode = "signal_only" | "auto_trade";

export interface Candle {
  symbol: string;
  timeframe: string;
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: "demo" | "mt5";
}

export interface SignalReason {
  category: string;
  message: string;
  impact: "bullish" | "bearish" | "neutral" | "risk";
  weight: number;
}

export interface Signal {
  symbol: string;
  timeframe: string;
  direction: Direction;
  confidence: number;
  entry: number;
  stop_loss: number | null;
  take_profit: number | null;
  reasons: SignalReason[];
  source: "demo" | "mt5";
  created_at: string;
}

export interface MarketEvent {
  id: string;
  title: string;
  category: string;
  scope: "global" | "symbol";
  symbols: string[];
  severity: "low" | "medium" | "high";
  source: string;
  source_url: string | null;
  published_at: string;
  event_time: string;
  analysis: string;
  why_it_matters: string[];
  risk_window: string;
  actual: number | null;
  forecast: number | null;
  previous: number | null;
  impacts: MarketImpact[];
}

export interface MarketImpact {
  symbol: string;
  direction: "bullish" | "bearish" | "mixed" | "neutral";
  confidence: number;
  horizon: string;
  thesis: string;
  causal_chain: string[];
  bullish_trigger: string;
  bearish_trigger: string;
  invalidation: string;
}

export interface NewsStatus {
  provider: string;
  state: "live" | "stale" | "config_required" | "error";
  message: string;
  calendar_connected: boolean;
  headlines_connected: boolean;
  updated_at: string;
}

export interface NewsFeed {
  status: NewsStatus;
  events: MarketEvent[];
}

export interface ScanResponse {
  signals: Signal[];
  events: MarketEvent[];
  news_status: NewsStatus;
}

export interface Status {
  trading_mode: string;
  broker_adapter: string;
  live_trading_enabled: boolean;
  live_trading_unlocked: boolean;
  default_symbols: string[];
  guardrails: Record<string, number>;
  broker_account: BrokerAccount | null;
  mt5: MT5Connection;
}

export interface BrokerAccount {
  id: string;
  provider: string;
  server: string;
  account_type: string;
  login_masked: string;
  active: boolean;
  profile_configured: boolean;
  terminal_configured: boolean;
  connection_verified: boolean;
  connection_ready: boolean;
}

export interface AccountList {
  active_account_id: string | null;
  accounts: BrokerAccount[];
}

export interface MT5Connection {
  status: string;
  message: string;
  read_only: boolean;
  package_available: boolean;
  initialized: boolean;
  terminal_connected: boolean;
  account_matches: boolean;
  server_matches: boolean;
  connection_verified: boolean;
  selected_login_masked: string;
  terminal_login_masked: string;
  terminal_server: string;
  package_version: string;
  terminal_version: string;
  company: string;
  currency: string;
  leverage: number;
  balance: number | null;
  equity: number | null;
  profit: number | null;
  margin: number | null;
  margin_free: number | null;
  margin_level: number | null;
  trade_allowed: boolean;
  expert_orders_allowed: boolean;
  symbols_count: number;
  positions_count: number;
  updated_at: string;
}

export interface MT5Quote {
  requested_symbol: string;
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  digits: number;
  visible: boolean;
  trade_mode: number;
  last_tick_at: string | null;
  updated_at: string;
}

export interface MT5Position {
  ticket: string;
  symbol: string;
  direction: "buy" | "sell";
  volume: number;
  price_open: number;
  price_current: number;
  stop_loss: number | null;
  take_profit: number | null;
  profit: number;
  opened_at: string;
}

export interface Backtest {
  symbol: string;
  timeframe: string;
  trades: number;
  win_rate: number;
  net_return_pct: number;
  max_drawdown_pct: number;
  source: "demo" | "mt5";
}

export interface MarketSymbol {
  symbol: string;
  description: string;
  category: string;
  currency_base: string;
  currency_profit: string;
  digits: number;
  bid: number;
  ask: number;
  spread_points: number;
  visible: boolean;
  trade_mode: number;
  source: "mt5" | "configured";
}

export interface MarketOpportunity {
  rank: number;
  symbol: string;
  description: string;
  category: string;
  direction: Direction;
  confidence: number;
  opportunity_score: number;
  estimated_move_pct: number;
  spread_pct: number;
  market_active: boolean;
  quote_age_seconds: number | null;
  recommendation: string;
  reasons: SignalReason[];
}

export interface MarketScan {
  source: string;
  timeframe: string;
  available_symbols: number;
  scanned_symbols: number;
  generated_at: string;
  disclaimer: string;
  opportunities: MarketOpportunity[];
}

export interface StrategyDefinition {
  name: string;
  version: string;
  summary: string;
  components: string[];
  minimum_candles: number;
  entry_threshold: number;
  stop_model: string;
  target_model: string;
  adaptive_learning: boolean;
  caveat: string;
}
