#property copyright "TraderAI"
#property version   "1.0"
#property description "Closed-candle EMA regime, EMA 9/36, and higher-timeframe MACD signals."
#property description "Signal-only indicator: it never sends or modifies broker orders."
#property indicator_chart_window
#property indicator_buffers 5
#property indicator_plots   5

#property indicator_label1  "Video BUY"
#property indicator_type1   DRAW_ARROW
#property indicator_color1  clrLime
#property indicator_width1  2
#property indicator_label2  "Video SELL"
#property indicator_type2   DRAW_ARROW
#property indicator_color2  clrTomato
#property indicator_width2  2
#property indicator_label3  "EMA 200"
#property indicator_type3   DRAW_LINE
#property indicator_color3  clrGold
#property indicator_width3  1
#property indicator_label4  "EMA 9"
#property indicator_type4   DRAW_LINE
#property indicator_color4  clrDeepSkyBlue
#property indicator_width4  1
#property indicator_label5  "EMA 36"
#property indicator_type5   DRAW_LINE
#property indicator_color5  clrOrange
#property indicator_width5  1

input group "Signal rules"
input int TrendMAPeriod = 200;
input int FastMAPeriod = 9;
input int SlowMAPeriod = 36;
input int MACDFast = 12;
input int MACDSlow = 26;
input int MACDSignal = 9;
input ENUM_TIMEFRAMES ConfirmationTimeframe = PERIOD_M15;
input int ATRPeriod = 14;
input double ATRArrowOffset = 0.35;
input bool RequireFreshCrossOrReclaim = true;

input group "Display and alerts"
input bool ShowSignals = true;
input bool ShowEMA200 = true;
input bool EnableAlerts = false;
input bool EnableSoundAlert = true;
input bool EnablePushAlert = false;
input bool EnableEmailAlert = false;

double BuyBuffer[];
double SellBuffer[];
double TrendBuffer[];
double FastBuffer[];
double SlowBuffer[];

int TrendMAHandle = INVALID_HANDLE;
int FastMAHandle = INVALID_HANDLE;
int SlowMAHandle = INVALID_HANDLE;
int MACDHandle = INVALID_HANDLE;
int ATRHandle = INVALID_HANDLE;
int HigherMACDHandle = INVALID_HANDLE;
datetime LastAlertBar = 0;
string LastAlertDirection = "";

bool ReadBufferValue(const int handle, const int buffer, const int shift, double &value)
  {
   double values[1];
   if(CopyBuffer(handle, buffer, shift, 1, values) != 1)
      return false;
   value = values[0];
   return true;
  }

string TimeframeName()
  {
   return EnumToString((ENUM_TIMEFRAMES)_Period);
  }

void NotifySignal(const string direction, const datetime bar_time, const double price)
  {
   if(!EnableAlerts || (bar_time == LastAlertBar && direction == LastAlertDirection))
      return;
   LastAlertBar = bar_time;
   LastAlertDirection = direction;
   string message = StringFormat(
      "TraderAI Video MA + MTF MACD | %s %s | %s | closed candle %.5f | paper/signal only",
      _Symbol,
      TimeframeName(),
      direction,
      price
   );
   Alert(message);
   if(EnableSoundAlert)
      PlaySound("alert.wav");
   if(EnablePushAlert)
      SendNotification(message);
   if(EnableEmailAlert)
      SendMail("TraderAI video strategy signal", message);
  }

int OnInit()
  {
   if(TrendMAPeriod < 2 || FastMAPeriod < 2 || SlowMAPeriod <= FastMAPeriod ||
      MACDFast < 2 || MACDSlow <= MACDFast || MACDSignal < 2 || ATRPeriod < 2)
      return INIT_PARAMETERS_INCORRECT;

   SetIndexBuffer(0, BuyBuffer, INDICATOR_DATA);
   SetIndexBuffer(1, SellBuffer, INDICATOR_DATA);
   SetIndexBuffer(2, TrendBuffer, INDICATOR_DATA);
   SetIndexBuffer(3, FastBuffer, INDICATOR_DATA);
   SetIndexBuffer(4, SlowBuffer, INDICATOR_DATA);
   ArraySetAsSeries(BuyBuffer, true);
   ArraySetAsSeries(SellBuffer, true);
   ArraySetAsSeries(TrendBuffer, true);
   ArraySetAsSeries(FastBuffer, true);
   ArraySetAsSeries(SlowBuffer, true);
   PlotIndexSetInteger(0, PLOT_ARROW, 233);
   PlotIndexSetInteger(1, PLOT_ARROW, 234);
   PlotIndexSetInteger(0, PLOT_DRAW_BEGIN, TrendMAPeriod);
   PlotIndexSetInteger(1, PLOT_DRAW_BEGIN, TrendMAPeriod);
   PlotIndexSetInteger(2, PLOT_DRAW_BEGIN, TrendMAPeriod);
   PlotIndexSetInteger(3, PLOT_DRAW_BEGIN, FastMAPeriod);
   PlotIndexSetInteger(4, PLOT_DRAW_BEGIN, SlowMAPeriod);
   PlotIndexSetDouble(0, PLOT_EMPTY_VALUE, EMPTY_VALUE);
   PlotIndexSetDouble(1, PLOT_EMPTY_VALUE, EMPTY_VALUE);
   PlotIndexSetDouble(2, PLOT_EMPTY_VALUE, EMPTY_VALUE);
   PlotIndexSetDouble(3, PLOT_EMPTY_VALUE, EMPTY_VALUE);
   PlotIndexSetDouble(4, PLOT_EMPTY_VALUE, EMPTY_VALUE);

   TrendMAHandle = iMA(_Symbol, _Period, TrendMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   FastMAHandle = iMA(_Symbol, _Period, FastMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   SlowMAHandle = iMA(_Symbol, _Period, SlowMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
   MACDHandle = iMACD(_Symbol, _Period, MACDFast, MACDSlow, MACDSignal, PRICE_CLOSE);
   ATRHandle = iATR(_Symbol, _Period, ATRPeriod);
   HigherMACDHandle = iMACD(
      _Symbol,
      ConfirmationTimeframe,
      MACDFast,
      MACDSlow,
      MACDSignal,
      PRICE_CLOSE
   );
   if(TrendMAHandle == INVALID_HANDLE || FastMAHandle == INVALID_HANDLE ||
      SlowMAHandle == INVALID_HANDLE || MACDHandle == INVALID_HANDLE ||
      ATRHandle == INVALID_HANDLE || HigherMACDHandle == INVALID_HANDLE)
      return INIT_FAILED;
   IndicatorSetString(INDICATOR_SHORTNAME, "Video MA + MTF MACD (signal only)");
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   if(TrendMAHandle != INVALID_HANDLE)
      IndicatorRelease(TrendMAHandle);
   if(FastMAHandle != INVALID_HANDLE)
      IndicatorRelease(FastMAHandle);
   if(SlowMAHandle != INVALID_HANDLE)
      IndicatorRelease(SlowMAHandle);
   if(MACDHandle != INVALID_HANDLE)
      IndicatorRelease(MACDHandle);
   if(ATRHandle != INVALID_HANDLE)
      IndicatorRelease(ATRHandle);
   if(HigherMACDHandle != INVALID_HANDLE)
      IndicatorRelease(HigherMACDHandle);
  }

int OnCalculate(
   const int rates_total,
   const int prev_calculated,
   const datetime &time[],
   const double &open[],
   const double &high[],
   const double &low[],
   const double &close[],
   const long &tick_volume[],
   const long &volume[],
   const int &spread[]
  )
  {
   if(rates_total < TrendMAPeriod + 5)
      return 0;
   ArraySetAsSeries(time, true);
   ArraySetAsSeries(open, true);
   ArraySetAsSeries(high, true);
   ArraySetAsSeries(low, true);
   ArraySetAsSeries(close, true);
   ArraySetAsSeries(tick_volume, true);
   ArraySetAsSeries(volume, true);
   ArraySetAsSeries(spread, true);
   int first = prev_calculated > 0 ? rates_total - prev_calculated + 2 : rates_total - TrendMAPeriod - 2;
   first = MathMin(first, rates_total - TrendMAPeriod - 2);
   if(first < 1)
      first = 1;
   for(int shift = first; shift >= 0; shift--)
     {
      BuyBuffer[shift] = EMPTY_VALUE;
      SellBuffer[shift] = EMPTY_VALUE;
      double trend, fast_current, slow_current;
      if(!ReadBufferValue(TrendMAHandle, 0, shift, trend) ||
         !ReadBufferValue(FastMAHandle, 0, shift, fast_current) ||
         !ReadBufferValue(SlowMAHandle, 0, shift, slow_current))
         continue;
      TrendBuffer[shift] = ShowEMA200 ? trend : EMPTY_VALUE;
      FastBuffer[shift] = fast_current;
      SlowBuffer[shift] = slow_current;
      if(shift == 0 || !ShowSignals)
         continue;

      double fast_previous, slow_previous;
      double macd_current, signal_current;
      double atr;
      if(!ReadBufferValue(FastMAHandle, 0, shift + 1, fast_previous) ||
         !ReadBufferValue(SlowMAHandle, 0, shift + 1, slow_previous) ||
         !ReadBufferValue(MACDHandle, 0, shift, macd_current) ||
         !ReadBufferValue(MACDHandle, 1, shift, signal_current) ||
         !ReadBufferValue(ATRHandle, 0, shift, atr))
         continue;
      int higher_shift = iBarShift(_Symbol, ConfirmationTimeframe, time[shift], false);
      if(higher_shift < 0)
         continue;
      double higher_macd, higher_signal;
      if(!ReadBufferValue(HigherMACDHandle, 0, higher_shift, higher_macd) ||
         !ReadBufferValue(HigherMACDHandle, 1, higher_shift, higher_signal))
         continue;
      double body = MathAbs(close[shift] - open[shift]);
      double candle_range = high[shift] - low[shift];
      if(candle_range <= 0 || atr <= 0)
         continue;
      bool bullish_trigger = (fast_current > slow_current && fast_previous <= slow_previous) ||
         (close[shift + 1] <= fast_previous && close[shift] > fast_current);
      bool bearish_trigger = (fast_current < slow_current && fast_previous >= slow_previous) ||
         (close[shift + 1] >= fast_previous && close[shift] < fast_current);
      if(!RequireFreshCrossOrReclaim)
        {
         bullish_trigger = fast_current > slow_current;
         bearish_trigger = fast_current < slow_current;
        }
      bool bullish = close[shift] > trend && fast_current > slow_current &&
         macd_current > signal_current && macd_current - signal_current > 0 &&
         higher_macd > higher_signal && close[shift] > open[shift] &&
         body / candle_range >= 0.35 && bullish_trigger;
      bool bearish = close[shift] < trend && fast_current < slow_current &&
         macd_current < signal_current && macd_current - signal_current < 0 &&
         higher_macd < higher_signal && close[shift] < open[shift] &&
         body / candle_range >= 0.35 && bearish_trigger;
      if(bullish)
        {
         BuyBuffer[shift] = low[shift] - atr * ATRArrowOffset;
         if(shift == 1)
            NotifySignal("BUY", time[shift], close[shift]);
        }
      else if(bearish)
        {
         SellBuffer[shift] = high[shift] + atr * ATRArrowOffset;
         if(shift == 1)
            NotifySignal("SELL", time[shift], close[shift]);
        }
     }
   return rates_total;
  }
