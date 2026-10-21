// MT5 auto-sync — source of the MoblogSync expert advisor. The browser fills
// in this site's address, the account's connection key and the import start
// date, and offers the result as MoblogSync.mq5. In MT5 the EA posts every
// deal of each position it sees to /api/mt5/sync (see ./deals.ts for the
// payload): the full history once when attached, then the last 7 days
// whenever a deal arrives and at least hourly. It never trades.

const SOURCE = String.raw`//+------------------------------------------------------------------+
//| MoblogSync.mq5                                                   |
//| Sends this account's trades to your Moblog journal.              |
//| Read-only: it never places, modifies or closes anything.         |
//+------------------------------------------------------------------+
#property copyright   "Moblog"
#property version     "1.00"
#property description "Sends this account's trades to your Moblog journal automatically."
#property description "Read-only: it never places, modifies or closes trades."

input string   InpUrl  = "__MOBLOG_URL__";   // Moblog address
input string   InpKey  = "__MOBLOG_KEY__";   // Connection key
input datetime InpFrom = __MOBLOG_FROM__;    // Import trades from (1970.01.01 = all history)

#define BATCH_POSITIONS 100   // positions per request
#define RECENT_DAYS     7     // window re-sent after the first full sync
#define HEARTBEAT_SEC   3600  // safety-net re-sync; deals trigger one at once
#define RETRY_SEC       60    // wait after a failed request

bool     g_backfilled = false;  // full history sent since the EA started
bool     g_dirty      = false;  // a deal arrived since the last sync
bool     g_stopped    = false;  // bad key / WebRequest not allowed: needs the user
datetime g_lastSync   = 0;      // local time of the last successful sync
datetime g_retryAt    = 0;

int OnInit()
  {
   if(StringFind(InpKey, "mt5_") != 0 || StringFind(InpUrl, "http") != 0)
     {
      Alert("MoblogSync: the Moblog address or connection key is missing. Download the EA again from Moblog.");
      return(INIT_PARAMETERS_INCORRECT);
     }
   EventSetTimer(5);
   Show("connecting...");
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   Comment("");
  }

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
      g_dirty = true;
  }

void OnTimer()
  {
   if(g_stopped || TimeLocal() < g_retryAt || !TerminalInfoInteger(TERMINAL_CONNECTED))
      return;
   if(!g_backfilled)
     {
      if(Sync(InpFrom))
        {
         g_backfilled = true;
         g_dirty = false;
        }
      return;
     }
   if(!g_dirty && TimeLocal() - g_lastSync < HEARTBEAT_SEC)
      return;
   g_dirty = false;
   datetime from = TimeCurrent() - RECENT_DAYS * 86400;
   if(from < InpFrom)
      from = InpFrom;
   if(!Sync(from))
      g_dirty = true;
  }

// Send every position with a deal since 'from', all of its deals included.
bool Sync(const datetime from)
  {
   if(!HistorySelect(from, TimeCurrent() + 86400))
      return(Retry("could not read the account history"));

   int total = HistoryDealsTotal();
   ulong ids[];
   ArrayResize(ids, 0, total);
   for(int i = 0; i < total; i++)
     {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0 || !IsTradeDeal(deal))
         continue;
      ulong position = (ulong)HistoryDealGetInteger(deal, DEAL_POSITION_ID);
      if(position == 0)
         continue;
      int n = ArraySize(ids);
      ArrayResize(ids, n + 1, total);
      ids[n] = position;
     }
   int count = Unique(ids);

   // Runs once even with nothing to send: checks the key and records the sync.
   for(int start = 0; start == 0 || start < count; start += BATCH_POSITIONS)
     {
      int end = start + BATCH_POSITIONS;
      if(end > count)
         end = count;
      string deals = "";
      for(int k = start; k < end; k++)
         AppendPositionDeals(ids[k], deals);
      if(!Post(deals))
         return(false);
     }

   g_lastSync = TimeLocal();
   Show("last sync " + TimeToString(TimeLocal(), TIME_MINUTES) + " (" + (string)count + " trade(s) checked)");
   return(true);
  }

bool IsTradeDeal(const ulong deal)
  {
   long type = HistoryDealGetInteger(deal, DEAL_TYPE);
   return(type == DEAL_TYPE_BUY || type == DEAL_TYPE_SELL);
  }

// Sort and de-duplicate; returns the new size.
int Unique(ulong &a[])
  {
   int n = ArraySize(a);
   if(n == 0)
      return(0);
   ArraySort(a);
   int m = 1;
   for(int i = 1; i < n; i++)
      if(a[i] != a[m - 1])
         a[m++] = a[i];
   ArrayResize(a, m);
   return(m);
  }

void AppendPositionDeals(const ulong position, string &json)
  {
   if(!HistorySelectByPosition(position))
      return;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0 || !IsTradeDeal(deal))
         continue;
      if(StringLen(json) > 0)
         json += ",";
      json += DealJson(deal);
     }
  }

string DealJson(const ulong deal)
  {
   string symbol = HistoryDealGetString(deal, DEAL_SYMBOL);
   long   type   = HistoryDealGetInteger(deal, DEAL_TYPE);
   long   entry  = HistoryDealGetInteger(deal, DEAL_ENTRY);
   double volume = HistoryDealGetDouble(deal, DEAL_VOLUME);
   double price  = HistoryDealGetDouble(deal, DEAL_PRICE);
   double sl     = HistoryDealGetDouble(deal, DEAL_SL);

   // Money at risk if the original stop is hit, in the account currency.
   string risk = "null";
   if(entry == DEAL_ENTRY_IN && sl > 0)
     {
      double loss = 0;
      ENUM_ORDER_TYPE side = (type == DEAL_TYPE_BUY) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      if(OrderCalcProfit(side, symbol, volume, price, sl, loss) && loss < 0)
         risk = DoubleToString(-loss, 2);
     }

   string j = "{\"ticket\":\"" + (string)deal + "\"";
   j += ",\"position\":\"" + (string)HistoryDealGetInteger(deal, DEAL_POSITION_ID) + "\"";
   j += ",\"time\":" + (string)HistoryDealGetInteger(deal, DEAL_TIME);
   j += ",\"side\":\"" + (type == DEAL_TYPE_BUY ? "buy" : "sell") + "\"";
   j += ",\"entry\":\"" + EntryName(entry) + "\"";
   j += ",\"symbol\":\"" + Esc(symbol) + "\"";
   j += ",\"volume\":" + DoubleToString(volume, 8);
   j += ",\"price\":" + DoubleToString(price, 8);
   j += ",\"profit\":" + DoubleToString(HistoryDealGetDouble(deal, DEAL_PROFIT), 2);
   j += ",\"commission\":" + DoubleToString(HistoryDealGetDouble(deal, DEAL_COMMISSION), 2);
   j += ",\"swap\":" + DoubleToString(HistoryDealGetDouble(deal, DEAL_SWAP), 2);
   j += ",\"fee\":" + DoubleToString(HistoryDealGetDouble(deal, DEAL_FEE), 2);
   j += ",\"sl\":" + DoubleToString(sl, 8);
   j += ",\"tp\":" + DoubleToString(HistoryDealGetDouble(deal, DEAL_TP), 8);
   j += ",\"reason\":\"" + ReasonName(HistoryDealGetInteger(deal, DEAL_REASON)) + "\"";
   j += ",\"risk\":" + risk + "}";
   return(j);
  }

string EntryName(const long entry)
  {
   switch((int)entry)
     {
      case DEAL_ENTRY_IN:     return("in");
      case DEAL_ENTRY_INOUT:  return("inout");
      case DEAL_ENTRY_OUT_BY: return("out_by");
     }
   return("out");
  }

string ReasonName(const long reason)
  {
   switch((int)reason)
     {
      case DEAL_REASON_SL:     return("sl");
      case DEAL_REASON_TP:     return("tp");
      case DEAL_REASON_SO:     return("so");
      case DEAL_REASON_EXPERT: return("expert");
      case DEAL_REASON_CLIENT:
      case DEAL_REASON_MOBILE:
      case DEAL_REASON_WEB:    return("manual");
     }
   return("other");
  }

bool Post(const string deals)
  {
   string body = "{\"version\":1";
   body += ",\"login\":\"" + (string)AccountInfoInteger(ACCOUNT_LOGIN) + "\"";
   body += ",\"server\":\"" + Esc(AccountInfoString(ACCOUNT_SERVER)) + "\"";
   body += ",\"currency\":\"" + Esc(AccountInfoString(ACCOUNT_CURRENCY)) + "\"";
   body += ",\"serverUtcOffset\":" + (string)ServerUtcOffset();
   body += ",\"deals\":[" + deals + "]}";

   char data[];
   char result[];
   string resultHeaders;
   int len = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0)
      ArrayResize(data, len - 1);   // drop the terminating zero
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + InpKey + "\r\n";

   ResetLastError();
   int status = WebRequest("POST", Endpoint(), headers, 30000, data, result, resultHeaders);
   if(status == -1)
     {
      int err = GetLastError();
      if(err == 4014 || err == 4060)   // URL not in the allowed list
         return(Stop("allow WebRequest for " + InpUrl + " in Tools > Options > Expert Advisors, then attach the EA again"));
      return(Retry("can't reach Moblog (error " + (string)err + ")"));
     }
   if(status == 200)
      return(true);

   string message = ErrorText(CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8), status);
   if(status == 401 || status == 409)
      return(Stop(message));
   return(Retry(message));
  }

string Endpoint()
  {
   string url = InpUrl;
   StringTrimLeft(url);
   StringTrimRight(url);
   while(StringLen(url) > 0 && StringGetCharacter(url, StringLen(url) - 1) == '/')
      url = StringSubstr(url, 0, StringLen(url) - 1);
   return(url + "/api/mt5/sync");
  }

// Trade-server clock minus UTC, rounded to 15 minutes.
long ServerUtcOffset()
  {
   long diff = (long)(TimeTradeServer() - TimeGMT());
   return((long)MathRound(diff / 900.0) * 900);
  }

string ErrorText(const string reply, const int status)
  {
   int at = StringFind(reply, "\"error\":\"");
   if(at >= 0)
     {
      at += 9;
      int end = StringFind(reply, "\"", at);
      if(end > at)
         return(StringSubstr(reply, at, end - at));
     }
   return("Moblog returned HTTP " + (string)status);
  }

string Esc(string s)
  {
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\r", " ");
   StringReplace(s, "\n", " ");
   StringReplace(s, "\t", " ");
   return(s);
  }

bool Retry(const string message)
  {
   g_retryAt = TimeLocal() + RETRY_SEC;
   Show(message + " - retrying in a minute");
   return(false);
  }

bool Stop(const string message)
  {
   g_stopped = true;
   Show("stopped: " + message);
   Alert("MoblogSync: " + message);
   return(false);
  }

void Show(const string message)
  {
   Comment("MoblogSync - " + message);
  }
`;

/** MoblogSync.mq5 pre-filled for this site and account. */
export function buildExpertAdvisor(opts: { url: string; key: string; from?: string | null }): string {
  const url = opts.url.replace(/["\\\s]/g, "");
  const key = opts.key.replace(/[^A-Za-z0-9_-]/g, "");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(opts.from ?? "") ? (opts.from as string).replace(/-/g, ".") : "1970.01.01";
  return SOURCE.replace("__MOBLOG_URL__", () => url)
    .replace("__MOBLOG_KEY__", () => key)
    .replace("__MOBLOG_FROM__", () => `D'${from}'`);
}
