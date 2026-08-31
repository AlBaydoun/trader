#property copyright "Trader AI Workstation"
#property version   "1.00"
#property strict
#property description "Closed-candle candlestick pattern recognition indicator. Signal only; no order placement."

#property indicator_chart_window
#property indicator_buffers 3
#property indicator_plots   3

#property indicator_label1  "Bullish pattern"
#property indicator_type1   DRAW_ARROW
#property indicator_color1  clrLimeGreen
#property indicator_width1  2

#property indicator_label2  "Bearish pattern"
#property indicator_type2   DRAW_ARROW
#property indicator_color2  clrTomato
#property indicator_width2  2

#property indicator_label3  "Doji"
#property indicator_type3   DRAW_ARROW
#property indicator_color3  clrLightSteelBlue
#property indicator_width3  1

// Signal-only indicator: intentionally contains no trade execution calls.

input group "Pattern display"
input bool   ShowLabels             = true;
input bool   ShowArrows             = true;
input bool   ShowDoji               = true;
input int    LabelFontSize          = 8;
input double LabelOffsetPercent     = 20.0;

input group "Pattern rules"
input double DojiMaxBodyPercent     = 10.0;
input double StarMiddleMaxPercent   = 45.0;
input double StrongBodyMinPercent   = 45.0;

input group "Alerts"
input bool   EnableAlerts           = false;
input bool   EnableSoundAlert       = true;
input string SoundFile              = "alert.wav";
input bool   EnablePushAlert        = false;
input bool   EnableEmailAlert       = false;

double BullishPatternBuffer[];
double BearishPatternBuffer[];
double DojiBuffer[];

datetime LastAlertBar = 0;
string ObjectPrefix = "TraderAI_CandlestickPattern_";

int OnInit()
  {
   SetIndexBuffer(0,BullishPatternBuffer,INDICATOR_DATA);
   SetIndexBuffer(1,BearishPatternBuffer,INDICATOR_DATA);
   SetIndexBuffer(2,DojiBuffer,INDICATOR_DATA);

   ArraySetAsSeries(BullishPatternBuffer,true);
   ArraySetAsSeries(BearishPatternBuffer,true);
   ArraySetAsSeries(DojiBuffer,true);

   PlotIndexSetInteger(0,PLOT_ARROW,233);
   PlotIndexSetInteger(1,PLOT_ARROW,234);
   PlotIndexSetInteger(2,PLOT_ARROW,159);
   PlotIndexSetDouble(0,PLOT_EMPTY_VALUE,EMPTY_VALUE);
   PlotIndexSetDouble(1,PLOT_EMPTY_VALUE,EMPTY_VALUE);
   PlotIndexSetDouble(2,PLOT_EMPTY_VALUE,EMPTY_VALUE);

   IndicatorSetString(INDICATOR_SHORTNAME,"TraderAI Candlestick Patterns");
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   ObjectsDeleteAll(0,ObjectPrefix);
  }

int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
  {
   if(rates_total < 4)
      return(0);

   ArraySetAsSeries(time,true);
   ArraySetAsSeries(open,true);
   ArraySetAsSeries(high,true);
   ArraySetAsSeries(low,true);
   ArraySetAsSeries(close,true);

   int oldest_shift = rates_total-3;
   if(prev_calculated > 0)
      oldest_shift = MathMin(rates_total-prev_calculated+3,rates_total-3);

   if(prev_calculated == 0)
     {
      ArrayInitialize(BullishPatternBuffer,EMPTY_VALUE);
      ArrayInitialize(BearishPatternBuffer,EMPTY_VALUE);
      ArrayInitialize(DojiBuffer,EMPTY_VALUE);
      ObjectsDeleteAll(0,ObjectPrefix);
     }

   oldest_shift = MathMax(1,oldest_shift);
   for(int shift=oldest_shift;shift>=1;shift--)
     {
      BullishPatternBuffer[shift] = EMPTY_VALUE;
      BearishPatternBuffer[shift] = EMPTY_VALUE;
      DojiBuffer[shift] = EMPTY_VALUE;
      RemovePatternObjects(time[shift]);

      bool bullish_engulfing = IsBullishEngulfing(shift,open,close);
      bool bearish_engulfing = IsBearishEngulfing(shift,open,close);
      bool morning_star = IsMorningStar(shift,open,high,low,close);
      bool evening_star = IsEveningStar(shift,open,high,low,close);
      bool three_soldiers = IsThreeWhiteSoldiers(shift,open,high,low,close);
      bool three_crows = IsThreeBlackCrows(shift,open,high,low,close);
      bool doji = IsDoji(shift,open,high,low,close);

      bool bullish_pattern = bullish_engulfing || morning_star || three_soldiers;
      bool bearish_pattern = bearish_engulfing || evening_star || three_crows;
      double offset = MathMax((high[shift]-low[shift])*(LabelOffsetPercent/100.0),_Point*10.0);

      if(ShowArrows && bullish_pattern)
         BullishPatternBuffer[shift] = low[shift]-offset;
      if(ShowArrows && bearish_pattern)
         BearishPatternBuffer[shift] = high[shift]+offset;
      if(ShowArrows && ShowDoji && doji)
         DojiBuffer[shift] = (high[shift]+low[shift])/2.0;

      if(ShowLabels)
        {
         if(bullish_engulfing)
            CreatePatternLabel("Bullish engulfing",time[shift],low[shift]-offset,true,clrLimeGreen);
         if(bearish_engulfing)
            CreatePatternLabel("Bearish engulfing",time[shift],high[shift]+offset,false,clrTomato);
         if(morning_star)
            CreatePatternLabel("Morning star",time[shift],low[shift]-offset,true,clrLimeGreen);
         if(evening_star)
            CreatePatternLabel("Evening star",time[shift],high[shift]+offset,false,clrTomato);
         if(three_soldiers)
            CreatePatternLabel("Three white soldiers",time[shift],low[shift]-offset,true,clrLimeGreen);
         if(three_crows)
            CreatePatternLabel("Three black crows",time[shift],high[shift]+offset,false,clrTomato);
         if(ShowDoji && doji)
            CreatePatternLabel("Doji",time[shift],(high[shift]+low[shift])/2.0,false,clrLightSteelBlue);
        }
     }

   // Alerts use shift 1 only, so an unfinished candle cannot trigger a signal.
   AlertClosedBar(time,open,high,low,close);
   return(rates_total);
  }

double CandleBody(const int shift,const double &open[],const double &close[])
  {
   return(MathAbs(close[shift]-open[shift]));
  }

double CandleRange(const int shift,const double &high[],const double &low[])
  {
   return(MathMax(high[shift]-low[shift],_Point));
  }

bool IsBullish(const int shift,const double &open[],const double &close[])
  {
   return(close[shift] > open[shift]);
  }

bool IsBearish(const int shift,const double &open[],const double &close[])
  {
   return(close[shift] < open[shift]);
  }

bool IsDoji(const int shift,
           const double &open[],
           const double &high[],
           const double &low[],
           const double &close[])
  {
   return(CandleBody(shift,open,close) <= CandleRange(shift,high,low)*(DojiMaxBodyPercent/100.0));
  }

bool IsBullishEngulfing(const int shift,const double &open[],const double &close[])
  {
   if(!IsBullish(shift,open,close) || !IsBearish(shift+1,open,close))
      return(false);
   return(open[shift] <= close[shift+1] && close[shift] >= open[shift+1] &&
          CandleBody(shift,open,close) > CandleBody(shift+1,open,close));
  }

bool IsBearishEngulfing(const int shift,const double &open[],const double &close[])
  {
   if(!IsBearish(shift,open,close) || !IsBullish(shift+1,open,close))
      return(false);
   return(open[shift] >= close[shift+1] && close[shift] <= open[shift+1] &&
          CandleBody(shift,open,close) > CandleBody(shift+1,open,close));
  }

bool IsMorningStar(const int shift,
                  const double &open[],
                  const double &high[],
                  const double &low[],
                  const double &close[])
  {
   int oldest = shift+2;
   bool first_bearish = IsBearish(oldest,open,close) &&
                        CandleBody(oldest,open,close) >= CandleRange(oldest,high,low)*0.50;
   bool middle_small = CandleBody(shift+1,open,close) <=
                       CandleBody(oldest,open,close)*(StarMiddleMaxPercent/100.0);
   double midpoint = open[oldest]-(CandleBody(oldest,open,close)/2.0);
   return(first_bearish && middle_small && IsBullish(shift,open,close) && close[shift] >= midpoint);
  }

bool IsEveningStar(const int shift,
                  const double &open[],
                  const double &high[],
                  const double &low[],
                  const double &close[])
  {
   int oldest = shift+2;
   bool first_bullish = IsBullish(oldest,open,close) &&
                        CandleBody(oldest,open,close) >= CandleRange(oldest,high,low)*0.50;
   bool middle_small = CandleBody(shift+1,open,close) <=
                       CandleBody(oldest,open,close)*(StarMiddleMaxPercent/100.0);
   double midpoint = open[oldest]+(CandleBody(oldest,open,close)/2.0);
   return(first_bullish && middle_small && IsBearish(shift,open,close) && close[shift] <= midpoint);
  }

bool IsStrongBullish(const int shift,
                    const double &open[],
                    const double &high[],
                    const double &low[],
                    const double &close[])
  {
   return(IsBullish(shift,open,close) &&
          CandleBody(shift,open,close) >= CandleRange(shift,high,low)*(StrongBodyMinPercent/100.0));
  }

bool IsStrongBearish(const int shift,
                    const double &open[],
                    const double &high[],
                    const double &low[],
                    const double &close[])
  {
   return(IsBearish(shift,open,close) &&
          CandleBody(shift,open,close) >= CandleRange(shift,high,low)*(StrongBodyMinPercent/100.0));
  }

bool IsThreeWhiteSoldiers(const int shift,
                          const double &open[],
                          const double &high[],
                          const double &low[],
                          const double &close[])
  {
   bool strong = IsStrongBullish(shift,open,high,low,close) &&
                 IsStrongBullish(shift+1,open,high,low,close) &&
                 IsStrongBullish(shift+2,open,high,low,close);
   bool rising = close[shift] > close[shift+1] && close[shift+1] > close[shift+2];
   bool opens_inside = open[shift] >= open[shift+1] && open[shift] <= close[shift+1] &&
                       open[shift+1] >= open[shift+2] && open[shift+1] <= close[shift+2];
   return(strong && rising && opens_inside);
  }

bool IsThreeBlackCrows(const int shift,
                       const double &open[],
                       const double &high[],
                       const double &low[],
                       const double &close[])
  {
   bool strong = IsStrongBearish(shift,open,high,low,close) &&
                 IsStrongBearish(shift+1,open,high,low,close) &&
                 IsStrongBearish(shift+2,open,high,low,close);
   bool falling = close[shift] < close[shift+1] && close[shift+1] < close[shift+2];
   bool opens_inside = open[shift] <= open[shift+1] && open[shift] >= close[shift+1] &&
                       open[shift+1] <= open[shift+2] && open[shift+1] >= close[shift+2];
   return(strong && falling && opens_inside);
  }

string AddPattern(const string current,const string pattern)
  {
   if(StringLen(current) == 0)
      return(pattern);
   return(current+", "+pattern);
  }

string PatternSummary(const int shift,
                      const double &open[],
                      const double &high[],
                      const double &low[],
                      const double &close[])
  {
   string summary = "";
   if(IsBullishEngulfing(shift,open,close))
      summary = AddPattern(summary,"Bullish engulfing");
   if(IsBearishEngulfing(shift,open,close))
      summary = AddPattern(summary,"Bearish engulfing");
   if(IsMorningStar(shift,open,high,low,close))
      summary = AddPattern(summary,"Morning star");
   if(IsEveningStar(shift,open,high,low,close))
      summary = AddPattern(summary,"Evening star");
   if(IsThreeWhiteSoldiers(shift,open,high,low,close))
      summary = AddPattern(summary,"Three white soldiers");
   if(IsThreeBlackCrows(shift,open,high,low,close))
      summary = AddPattern(summary,"Three black crows");
   if(ShowDoji && IsDoji(shift,open,high,low,close))
      summary = AddPattern(summary,"Doji");
   return(summary);
  }

void AlertClosedBar(const datetime &time[],
                    const double &open[],
                    const double &high[],
                    const double &low[],
                    const double &close[])
  {
   if(!EnableAlerts || ArraySize(time) < 3)
      return;

   string summary = PatternSummary(1,open,high,low,close);
   if(StringLen(summary) == 0 || time[1] == LastAlertBar)
      return;

   LastAlertBar = time[1];
   string message = StringFormat("Candlestick pattern | %s %s | %s | closed %s",
                                 _Symbol,
                                 EnumToString((ENUM_TIMEFRAMES)_Period),
                                 summary,
                                 TimeToString(time[1],TIME_DATE|TIME_MINUTES));
   Print(message);
   if(EnableSoundAlert)
      PlaySound(SoundFile);
   if(EnablePushAlert)
      SendNotification(message);
   if(EnableEmailAlert)
      SendMail("TraderAI candlestick pattern",message);
   Alert(message);
  }

string PatternObjectName(const string pattern,const datetime bar_time)
  {
   return(ObjectPrefix+pattern+"_"+StringFormat("%I64d",(long)bar_time));
  }

void RemovePatternObjects(const datetime bar_time)
  {
   ObjectDelete(0,PatternObjectName("Bullish engulfing",bar_time));
   ObjectDelete(0,PatternObjectName("Bearish engulfing",bar_time));
   ObjectDelete(0,PatternObjectName("Morning star",bar_time));
   ObjectDelete(0,PatternObjectName("Evening star",bar_time));
   ObjectDelete(0,PatternObjectName("Three white soldiers",bar_time));
   ObjectDelete(0,PatternObjectName("Three black crows",bar_time));
   ObjectDelete(0,PatternObjectName("Doji",bar_time));
  }

void CreatePatternLabel(const string pattern,
                        const datetime bar_time,
                        const double price,
                        const bool bullish,
                        const color label_color)
  {
   string name = PatternObjectName(pattern,bar_time);
   if(!ObjectCreate(0,name,OBJ_TEXT,0,bar_time,price))
      return;
   ObjectSetString(0,name,OBJPROP_TEXT,pattern);
   ObjectSetInteger(0,name,OBJPROP_COLOR,label_color);
   ObjectSetInteger(0,name,OBJPROP_FONTSIZE,MathMax(6,LabelFontSize));
   ObjectSetInteger(0,name,OBJPROP_ANCHOR,bullish ? ANCHOR_UPPER : ANCHOR_LOWER);
   ObjectSetInteger(0,name,OBJPROP_SELECTABLE,false);
   ObjectSetInteger(0,name,OBJPROP_SELECTED,false);
   ObjectSetInteger(0,name,OBJPROP_HIDDEN,true);
  }
