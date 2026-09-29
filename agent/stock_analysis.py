# CrewAI Flow framework for building multi-step AI workflows
from crewai.flow.flow import Flow, start, router, listen
from litellm import completion
from pydantic import BaseModel
from typing import Literal, List

# AG UI types for message handling and state management
from ag_ui.core.types import AssistantMessage, SystemMessage, ToolMessage
from ag_ui.core.events import StateDeltaEvent, EventType

# Standard Python libraries
import uuid  
import asyncio  
import json  
import math
import re
from datetime import date, datetime

# External libraries
from dotenv import load_dotenv  
import yfinance as yf  
import numpy as np  
import pandas as pd  

# Import custom prompts for the AI models
from prompts import system_prompt, insights_prompt
from observability.openai_traced import traced_chat_completion
from observability.log import log_event
from safety.input_guard import _last_user_text
from safety.output_guard import sanitize_insights
from safety.tool_guard import (
    _normalize_date,
    is_extracted_ticker,
    is_free_text_ticker,
    sanitize_extract_args,
)

# Load environment variables (like API keys) from .env file
load_dotenv()




extract_relevant_data_from_user_prompt = {
    "type": "function",  # Required field for OpenAI function calling
    "function": {
        "name": "extract_relevant_data_from_user_prompt",
        "description": "Gets the data like ticker symbols, amount of dollars to be invested, interval of investment.",
        "parameters": {
            "type": "object",
            "properties": {
                # List of stock ticker symbols (e.g., ['AAPL', 'GOOGL'])
                "ticker_symbols": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "A list of stock ticker symbols, e.g. ['AAPL', 'GOOGL']."
                },
                # Date when the investment should start
                "investment_date": {
                    "type": "string",
                    "description": "The date of investment, e.g. '2023-01-01'.",
                    "format": "date"
                },
                # Amount of money to invest in each stock (parallel array to ticker_symbols)
                "amount_of_dollars_to_be_invested": {
                    "type": "array",
                    "items": {
                        "type": "number"
                    },
                    "description": "The amount of dollars to be invested, e.g. [10000, 20000, 30000]."
                },
                # Investment strategy: single purchase or dollar-cost averaging over time
                "interval_of_investment": {
                    "type": "string",
                    "description": "The interval of investment, e.g. '1d', '5d', '1mo', '3mo', '6mo', '1y'. If the user did not specify the interval, assume it as 'single_shot'.",
                    "enum": ["1d", "5d", "7d", "1mo", "3mo", "6mo", "1y", "2y", "3y", "4y", "5y", "single_shot"]
                },
                # Whether to add to actual portfolio or sandbox/test portfolio
                "to_be_added_in_portfolio": {
                    "type": "boolean",
                    "description": "True if the user wants to add it to the current portfolio; false if they want to add it to the sandbox portfolio."
                }
            },
            # These fields are required for the tool to function properly
            "required": [
                "ticker_symbols",
                "investment_date",
                "amount_of_dollars_to_be_invested",
                "to_be_added_in_portfolio"
            ]
        }
    }
}

# Tool definition for generating bull/bear insights about stocks or portfolios
# This tool generates positive (bullish) and negative (bearish) analysis
# to provide balanced perspective on investment decisions
generate_insights = {
  "type": "function",
  "function": {
    "name": "generate_insights",
    "description": "Generate positive (bull) and negative (bear) insights for a stock or portfolio.",
    "parameters": {
      "type": "object",
      "properties": {
        # Positive insights (reasons why the investment might perform well)
        "bullInsights": {
          "type": "array",
          "description": "A list of positive insights (bull case) for the stock or portfolio.",
          "items": {
            "type": "object",
            "properties": {
              "title": {
                "type": "string",
                "description": "Short title for the positive insight."
              },
              "description": {
                "type": "string",
                "description": "Detailed description of the positive insight."
              },
              "emoji": {
                "type": "string",
                "description": "Emoji representing the positive insight."
              }
            },
            "required": ["title", "description", "emoji"]
          }
        },
        # Negative insights (potential risks or concerns about the investment)
        "bearInsights": {
          "type": "array",
          "description": "A list of negative insights (bear case) for the stock or portfolio.",
          "items": {
            "type": "object",
            "properties": {
              "title": {
                "type": "string",
                "description": "Short title for the negative insight."
              },
              "description": {
                "type": "string",
                "description": "Detailed description of the negative insight."
              },
              "emoji": {
                "type": "string",
                "description": "Emoji representing the negative insight."
              }
            },
            "required": ["title", "description", "emoji"]
          }
        }
      },
      "required": ["bullInsights", "bearInsights"]
    }
  }
}


class StockAnalysisFlow(Flow):

    def _system_prompt_text(self):
        return (
            system_prompt.replace(
                "{PORTFOLIO_DATA_PLACEHOLDER}",
                json.dumps(self.state.get("investment_portfolio") or []),
            )
            + f"\n\nTODAY'S DATE: {datetime.today().strftime('%Y-%m-%d')}"
        )

    @start()
    def start(self):
        system = self._system_prompt_text()
        messages = self.state['state']["messages"]
        if messages and getattr(messages[0], "role", None) == "system":
            messages[0].content = system
        else:
            messages.insert(
                0,
                SystemMessage(id=str(uuid.uuid4()), role="system", content=system),
            )
        return self.state
    

    @listen("start")
    async def chat(self):
        try:
          tool_log_id = str(uuid.uuid4())
          self.state["state"]["tool_logs"].append(
            {
              "id": tool_log_id,
              "message": "Analyzing user query", 
              "status": "progress"
            }
          )

          self.state.get("emit_event")(
            StateDeltaEvent(
              type = EventType.STATE_DELTA, 
              delta=[
                {
                  "op" : "add",
                  "path" : "/tool_logs/-", 
                  "value" : {
                    "message": "Analyzing user query", 
                    "status" : "processing",
                    "id" : tool_log_id,
                  }
                }
              ]
            )
          )

          await asyncio.sleep(0)

          user_text = _last_user_text(self.state['state']['messages'])
          response = traced_chat_completion(
            self.state.get("run_id", "unknown"),
            "extract",
            model="gpt-4o-mini",
            messages=[
              {"role": "system", "content": self._system_prompt_text()},
              {
                "role": "user",
                "content": user_text or "Analyze my watchlist.",
              },
            ],
            tools=[extract_relevant_data_from_user_prompt],
            tool_choice={
              "type": "function",
              "function": {"name": "extract_relevant_data_from_user_prompt"},
            },
          )

          index = len(self.state['state']['tool_logs']) - 1
          self.state.get("emit_event")(
            StateDeltaEvent(
              type = EventType.STATE_DELTA, 
              delta = [
                {
                  "op" : "replace",
                  "path" : f"/tool_logs/{index}/status",
                  "value" : "completed",
                }
              ]
            )
          )

          await asyncio.sleep(0)

          choice = response.choices[0]
          message = choice.message
          content = message.content or ""
          refusal = getattr(message, "refusal", None) or ""
          log_event(
            self.state.get("run_id", "unknown"),
            "extract_result",
            finish_reason=choice.finish_reason,
            content=content[:300],
            refusal=refusal[:300],
          )
          print(
            f"extract finish_reason={choice.finish_reason} "
            f"content={content[:200]!r} refusal={refusal[:200]!r}"
          )

          if choice.finish_reason == "tool_calls" and message.tool_calls:
            tool_calls = [
              convert_tool_call(tc)
              for tc in message.tool_calls
            ]
            self._append_extract_messages(tool_calls, response.id)
            return "simulation"

          if self._continue_with_watchlist_extract(user_text):
            return "simulation"

          a_message = AssistantMessage(
            id=response.id,
            content=content or refusal,
            role="assistant",
          )
          self.state['state']["messages"].append(a_message)
          return "end"

            
        except Exception as e:
            print(f"Error in chat method: {e}")
            user_text = _last_user_text(self.state['state']['messages'])
            if self._continue_with_watchlist_extract(user_text):
              return "simulation"
            error_id = str(uuid.uuid4())
            a_message = AssistantMessage(id=error_id, content="", role="assistant")
            self.state['state']["messages"].append(a_message)
            return "end"

    def _append_extract_messages(self, tool_calls, message_id):
        self.state['state']["messages"].append(
            AssistantMessage(role="assistant", tool_calls=tool_calls, id=message_id)
        )
        for tc in tool_calls:
            tool_call_id = tc["id"] if isinstance(tc, dict) else tc.id
            self.state['state']["messages"].append(
                ToolMessage(
                    id=str(uuid.uuid4()),
                    role="tool",
                    tool_call_id=tool_call_id,
                    content="Investment parameters extracted successfully",
                )
            )

    def _continue_with_watchlist_extract(self, user_text=""):
        raw_args = watchlist_extract_args(self.state, user_text)
        if not raw_args:
            return False
        guarded = sanitize_extract_args(raw_args)
        if not guarded.ok:
            log_event(
                self.state.get("run_id", "unknown"),
                "extract_watchlist_fallback",
                ok=False,
                reason=guarded.reason,
            )
            return False
        log_event(
            self.state.get("run_id", "unknown"),
            "extract_watchlist_fallback",
            ok=True,
            tickers=guarded.arguments["ticker_symbols"],
            investment_date=guarded.arguments["investment_date"],
            amounts=guarded.arguments["amount_of_dollars_to_be_invested"],
            interval=guarded.arguments["interval_of_investment"],
        )
        print(
            f"extract fallback: {guarded.arguments['ticker_symbols']} "
            f"{guarded.arguments['amount_of_dollars_to_be_invested']} "
            f"{guarded.arguments['interval_of_investment']} "
            f"from {guarded.arguments['investment_date']}"
        )
        self._append_extract_messages(
            [{
                "id": str(uuid.uuid4()),
                "type": "function",
                "function": {
                    "name": "extract_relevant_data_from_user_prompt",
                    "arguments": json.dumps(guarded.arguments),
                },
            }],
            str(uuid.uuid4()),
        )
        return True
    
    
    @listen("chat")
    async def simulation(self):
        """
        Step 3: Gather historical stock data for analysis
        - Extract investment parameters from the previous step
        - Download historical stock price data from Yahoo Finance
        - Prepare data for portfolio simulation
        """
        # Step 3.1: Ensure we have tool calls with investment data
        # Find the last AssistantMessage with tool calls
        last_assistant_message = None
        for message in reversed(self.state['state']['messages']):
            if hasattr(message, 'tool_calls') and message.tool_calls is not None:
                last_assistant_message = message
                break
        
        if last_assistant_message is None:
            return "end"
            
        # Step 3.2: Create tool log entry for stock data gathering
        tool_log_id = str(uuid.uuid4())
        self.state['state']["tool_logs"].append(
            {
                "id": tool_log_id,
                "message": "Gathering Stock Data",
                "status": "processing",
            }
        )
        
        # Step 3.3: Emit state change to update UI
        self.state.get("emit_event")(
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[
                    {
                        "op": "add",
                        "path": "/tool_logs/-",
                        "value": {
                            "message": "Gathering Stock Data",
                            "status": "processing",
                            "id": tool_log_id,
                        },
                    }
                ],
            )
        )
        await asyncio.sleep(0)
        
        # Step 3.4: Parse the extracted investment arguments from previous step
        arguments = json.loads(last_assistant_message.tool_calls[0].function.arguments)
        print(f"Debug: Parsed arguments: {arguments}")
        print(f"Debug: Available keys: {list(arguments.keys())}")
        
        # Step 3.5: Create investment portfolio structure for UI display
        # Combine new investments with existing portfolio (additive approach)
        existing_portfolio = _clean_portfolio(
            self.state.get("investment_portfolio", [])
        )
        
        # Check if this is the final results or initial parameters
        if "investment_summary" in arguments:
            print("Debug: Received final results, skipping simulation step")
            return "end"

        guarded = sanitize_extract_args(arguments)
        if not guarded.ok:
            log_event(
                self.state.get("run_id", "unknown"),
                "safety_tool_block",
                reason=guarded.reason,
            )
            return "end"
        arguments = guarded.arguments
        
        # Create new investments list
        amounts = arguments["amount_of_dollars_to_be_invested"]
        # If only one amount is provided, split it equally among all tickers
        if len(amounts) == 1 and len(arguments["ticker_symbols"]) > 1:
            amount_per_ticker = amounts[0] / len(arguments["ticker_symbols"])
            amounts = [amount_per_ticker] * len(arguments["ticker_symbols"])
        
        new_investments = [
            {
                "ticker": ticker,
                "amount": amounts[index],
            }
            for index, ticker in enumerate(arguments["ticker_symbols"])
        ]
        
        # Combine existing and new investments
        combined_portfolio = existing_portfolio + new_investments
        self.investment_portfolio = json.dumps(combined_portfolio)
        
        # Step 3.6: Update state with new investment portfolio
        self.state.get("emit_event")(
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[
                    {
                        "op": "replace",
                        "path": f"/investment_portfolio",
                        "value": json.loads(self.investment_portfolio),
                    }
                ],
            )
        )
        await asyncio.sleep(2)
        
        # Step 3.7: Extract investment parameters
        tickers = arguments["ticker_symbols"]
        investment_date = arguments["investment_date"]
        current_year = datetime.now().year
        
        # Step 3.8: Validate and adjust investment date (limit to 4 years for data availability)
        if current_year - int(investment_date[:4]) > 4:
            print("investment date is more than 4 years ago")
            investment_date = f"{current_year - 4}-01-01"
            
        # Step 3.9: Calculate appropriate history period for data download
        if current_year - int(investment_date[:4]) == 0:
            history_period = "1y"
        else:
            history_period = f"{current_year - int(investment_date[:4])}y"

        # Step 3.10: Download historical stock data using Yahoo Finance
        # Get all tickers from combined portfolio (existing + new)
        all_tickers = list(set(tickers + [inv["ticker"] for inv in existing_portfolio]))
        print(f"Debug: Downloading data for all tickers: {all_tickers}")
        
        data = yf.download(
            all_tickers,
            start=investment_date,
            end=datetime.today().strftime("%Y-%m-%d"),
            interval="3mo",  # Quarterly data points
        )
        
        # Step 3.11: Keep only tickers that actually returned prices
        close = None
        if data is not None and not getattr(data, "empty", True):
            try:
                close = data["Close"]
            except (KeyError, TypeError):
                close = None
        usable = _tickers_with_prices(close, all_tickers)
        dropped = [ticker for ticker in all_tickers if ticker not in usable]
        if dropped:
            print(f"Dropping tickers with no price data: {dropped}")
            log_event(
                self.state.get("run_id", "unknown"),
                "drop_unpriced_tickers",
                dropped=dropped,
                kept=usable,
            )
        if not usable:
            print("Warning: No stock data retrieved. This might be due to invalid tickers or date range.")
            return "end"

        frame = _price_frame(close, usable)
        self.be_stock_data = frame[usable]
        arguments = _align_extract_args(arguments, usable)
        self.be_arguments = arguments
        
        # Step 3.12: Mark stock data gathering as completed
        index = len(self.state['state']["tool_logs"]) - 1
        self.state.get("emit_event")(
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[
                    {
                        "op": "replace",
                        "path": f"/tool_logs/{index}/status",
                        "value": "completed",
                    }
                ],
            )
        )
        await asyncio.sleep(0)
        
        # Step 3.13: Proceed to portfolio allocation and simulation
        return "allocation"
    
    
    @listen("simulation")
    async def allocation(self):
        """
        Step 4: Calculate portfolio allocation and performance simulation
        - Simulate buying stocks based on investment strategy (single-shot vs DCA)
        - Calculate returns, allocation percentages, and performance metrics
        - Compare portfolio performance against SPY (S&P 500) benchmark
        - Generate performance data for charting
        """
        # Step 4.1: Ensure we have tool calls with investment data
        # Find the last AssistantMessage with tool calls
        last_assistant_message = None
        for message in reversed(self.state['state']['messages']):
            if hasattr(message, 'tool_calls') and message.tool_calls is not None:
                last_assistant_message = message
                break
        
        if last_assistant_message is None:
            return "end"
            
        # Check if this is the final results or initial parameters
        try:
            arguments = json.loads(last_assistant_message.tool_calls[0].function.arguments)
            if "investment_summary" in arguments:
                print("Debug: Received final results, skipping allocation step")
                return "end"
        except (json.JSONDecodeError, KeyError, IndexError):
            pass
            
        # Step 4.2: Create tool log for allocation calculation
        tool_log_id = str(uuid.uuid4())
        # Step 4.2: Create tool log for allocation calculation
        tool_log_id = str(uuid.uuid4())
        self.state['state']["tool_logs"].append(
            {
                "id": tool_log_id,
                "message": "Calculating portfolio allocation",
                "status": "processing",
            }
        )
        
        # Step 4.3: Emit state change to update UI
        self.state.get("emit_event")(
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[
                    {
                        "op": "add",
                        "path": "/tool_logs/-",
                        "value": {
                            "message": "Allocating cash",
                            "status": "processing",
                            "id": tool_log_id,
                        },
                    }
                ],
            )
        )
        await asyncio.sleep(0)
        
        # Step 4.4: Extract data from previous steps
        stock_data = self.be_stock_data  # DataFrame: index=date, columns=tickers
        args = self.be_arguments
        current_tickers = args["ticker_symbols"]  # Tickers from current query
        investment_date = args["investment_date"]
        amounts = args["amount_of_dollars_to_be_invested"]  # list, one per ticker
        # If only one amount is provided, split it equally among all tickers
        if len(amounts) == 1 and len(current_tickers) > 1:
            amount_per_ticker = amounts[0] / len(current_tickers)
            amounts = [amount_per_ticker] * len(current_tickers)
        interval = args.get("interval_of_investment", "single_shot")
        
        # Get all tickers from combined portfolio
        existing_portfolio = _clean_portfolio(
            self.state.get("investment_portfolio", [])
        )
        
        all_tickers = list(set(current_tickers + [inv["ticker"] for inv in existing_portfolio]))
        print(f"Debug: Processing allocation for all tickers: {all_tickers}")

        # Step 4.5: Initialize cash available for investment
        # Use existing available cash or sum of requested amounts
        if self.state['state']["available_cash"] is not None:
            total_cash = self.state['state']["available_cash"]
        else:
            total_cash = sum(amounts)
            
        # Step 4.6: Initialize tracking variables for simulation
        existing_portfolio = _clean_portfolio(
            self.state.get("investment_portfolio", [])
        )
        
        # Initialize holdings with existing portfolio
        holdings = {}
        for investment in existing_portfolio:
            ticker = investment["ticker"]
            if ticker not in holdings:
                holdings[ticker] = 0.0
        
        # Add new tickers from current query
        for ticker in current_tickers:
            if ticker not in holdings:
                holdings[ticker] = 0.0
        
        investment_log = []  # Log of all investment transactions
        add_funds_needed = False  # Flag if more funds are needed
        add_funds_dates = []  # Dates when funds were insufficient

        # Step 4.7: Ensure stock data is sorted chronologically
        stock_data = stock_data.sort_index()

        # Step 4.8: Execute investment strategy based on interval
        if interval == "single_shot":
            # SINGLE-SHOT STRATEGY: Buy all shares at the first available date
            first_date = stock_data.index[0]
            row = stock_data.loc[first_date]
            
            # Loop through each ticker and attempt to buy allocated amount
            for idx, ticker in enumerate(current_tickers):
                price = row[ticker]
                
                # Step 4.8.1: Check if price data is available
                if np.isnan(price):
                    investment_log.append(
                        f"{first_date.date()}: No price data for {ticker}, could not invest."
                    )
                    add_funds_needed = True
                    add_funds_dates.append(
                        (str(first_date.date()), ticker, price, amounts[idx])
                    )
                    continue
                    
                # Step 4.8.2: Calculate how much to invest in this ticker
                allocated = amounts[idx]
                
                # Step 4.8.3: Check if we have enough cash and allocation is sufficient
                if total_cash >= allocated and allocated >= price:
                    shares_to_buy = allocated // price  # Integer division for whole shares
                    if shares_to_buy > 0:
                        cost = shares_to_buy * price
                        holdings[ticker] += shares_to_buy
                        total_cash -= cost
                        investment_log.append(
                            f"{first_date.date()}: Bought {shares_to_buy:.2f} shares of {ticker} at ${price:.2f} (cost: ${cost:.2f})"
                        )
                    else:
                        investment_log.append(
                            f"{first_date.date()}: Not enough allocated cash to buy {ticker} at ${price:.2f}. Allocated: ${allocated:.2f}"
                        )
                        add_funds_needed = True
                        add_funds_dates.append(
                            (str(first_date.date()), ticker, price, allocated)
                        )
                else:
                    # Step 4.8.4: Insufficient funds for this ticker
                    investment_log.append(
                        f"{first_date.date()}: Not enough total cash to buy {ticker} at ${price:.2f}. Allocated: ${allocated:.2f}, Available: ${total_cash:.2f}"
                    )
                    add_funds_needed = True
                    add_funds_dates.append(
                        (str(first_date.date()), ticker, price, total_cash)
                    )
            # No further purchases on subsequent dates for single-shot strategy
        else:
            # DOLLAR-COST AVERAGING (DCA) STRATEGY: Spread investments over time
            for date, row in stock_data.iterrows():
                for i, ticker in enumerate(current_tickers):
                    price = row[ticker]
                    
                    # Step 4.8.5: Skip if no price data available
                    if np.isnan(price):
                        continue  # skip if price is NaN
                        
                    # Step 4.8.6: Invest as much as possible for this ticker at this date
                    if total_cash >= price:
                        shares_to_buy = total_cash // price
                        if shares_to_buy > 0:
                            cost = shares_to_buy * price
                            holdings[ticker] += shares_to_buy
                            total_cash -= cost
                            investment_log.append(
                                f"{date.date()}: Bought {shares_to_buy:.2f} shares of {ticker} at ${price:.2f} (cost: ${cost:.2f})"
                            )
                    else:
                        # Step 4.8.7: Log when funds are insufficient
                        add_funds_needed = True
                        add_funds_dates.append(
                            (str(date.date()), ticker, price, total_cash)
                        )
                        investment_log.append(
                            f"{date.date()}: Not enough cash to buy {ticker} at ${price:.2f}. Available: ${total_cash:.2f}. Please add more funds."
                        )

        # Step 4.9: Calculate final portfolio value and performance metrics
        final_prices = stock_data.iloc[-1]  # Latest prices for each stock
        total_value = 0.0
        returns = {}  # Absolute returns for each ticker
        total_invested_per_stock = {}  # Amount invested in each stock
        percent_allocation_per_stock = {}  # Percentage allocation for each stock
        percent_return_per_stock = {}  # Percentage return for each stock
        total_invested = 0.0
        
        # Step 4.10: Calculate total amount invested per stock
        for idx, ticker in enumerate(current_tickers):
            # Calculate how much was actually invested in this stock
            if interval == "single_shot":
                # Step 4.10.1: For single-shot, only one purchase at first date
                first_date = stock_data.index[0]
                price = finite_float(stock_data.loc[first_date][ticker], default=float("nan"))
                shares_bought = finite_float(holdings.get(ticker, 0.0))
                invested = 0.0 if not math.isfinite(price) else shares_bought * price
            else:
                # Step 4.10.2: For DCA, sum all purchases from the log
                invested = 0.0
                for log in investment_log:
                    if f"shares of {ticker}" in log and "Bought" in log:
                        # Extract cost from log string
                        try:
                            cost_str = log.split("(cost: $")[-1].split(")")[0]
                            invested += float(cost_str)
                        except Exception:
                            pass
            invested = finite_float(invested)
            total_invested_per_stock[ticker] = invested
            total_invested += invested
        total_invested = finite_float(total_invested)
            
        # Step 4.11: Calculate percentage allocations and returns
        for ticker in all_tickers:
            invested = finite_float(total_invested_per_stock.get(ticker, 0.0))
            price_index = getattr(final_prices, "index", [])
            final_price = (
                finite_float(final_prices[ticker]) if ticker in price_index else 0.0
            )
            shares = finite_float(holdings.get(ticker, 0.0))
            holding_value = shares * final_price
            returns[ticker] = holding_value - invested
            total_value += holding_value
            
            # Calculate percentage allocation (what % of total investment went to this stock)
            percent_allocation_per_stock[ticker] = (
                (invested / total_invested * 100) if total_invested > 0 else 0.0
            )
            
            # Calculate percentage return (how much % this stock gained/lost)
            percent_return_per_stock[ticker] = (
                ((holding_value - invested) / invested * 100) if invested > 0 else 0.0
            )
        total_value += total_cash  # Add remaining cash to total portfolio value

        # Step 4.12: Store investment summary results in state
        self.state['state']["investment_summary"] = {
            "holdings": holdings,  # Number of shares owned for each ticker
            "final_prices": final_prices.to_dict(),  # Current prices
            "cash": total_cash,  # Remaining cash
            "returns": returns,  # Absolute returns per ticker
            "total_value": total_value,  # Total portfolio value
            "investment_log": investment_log,  # Transaction history
            "add_funds_needed": add_funds_needed,  # Whether more funds were needed
            "add_funds_dates": add_funds_dates,  # Dates when funds were insufficient
            "total_invested_per_stock": total_invested_per_stock,  # Investment per ticker
            "percent_allocation_per_stock": percent_allocation_per_stock,  # Allocation %
            "percent_return_per_stock": percent_return_per_stock,  # Return %
        }
        self.state['state']["available_cash"] = total_cash  # Update available cash in state

        # ===============================================================================
        # BENCHMARK COMPARISON - Portfolio vs SPY (S&P 500)
        # ===============================================================================
        
        # Step 4.13: Get SPY (S&P 500) prices for benchmark comparison
        spy_ticker = "SPY"
        spy_prices = None
        spy_shares = 0.0
        spy_cash = total_invested
        spy_invested = 0.0
        spy_investment_log = []
        
        try:
            # Download SPY data for the same time period as stock_data
            # Use start and end dates from stock_data, with daily interval for better granularity
            start_date = stock_data.index[0]
            end_date = stock_data.index[-1]
            spy_prices = yf.download(
                spy_ticker,
                start=start_date,
                end=end_date,
                interval="1d",  # Use daily interval for better data alignment
                progress=False  # Suppress download progress
            )["Close"]
            
            # Fix: Use the first available SPY date if our start date doesn't exist
            if spy_prices.index[0] > start_date:
                print(f"Debug SPY: Adjusting start date from {start_date} to {spy_prices.index[0]}")
                # Update our stock_data to start from the first available SPY date
                stock_data = stock_data.loc[spy_prices.index[0]:]
                # Don't recalculate total_invested - keep the original value
                print(f"Debug SPY: Keeping original total_invested: ${total_invested:.2f}")
            
            # Ensure SPY data is properly formatted
            if isinstance(spy_prices, pd.DataFrame):
                spy_prices = spy_prices.iloc[:, 0]  # Take first column if DataFrame
            
            # Align SPY prices to our stock_data dates using forward fill
            spy_prices = spy_prices.reindex(stock_data.index, method="ffill")
        except Exception as e:
            print("Error fetching SPY data:", e)
            # Create dummy SPY data if fetch fails
            spy_prices = pd.Series([None] * len(stock_data), index=stock_data.index)

        # Step 4.14: Simulate investing the same total amount in SPY for comparison
        spy_shares = 0.0
        spy_cash = total_invested  # Use same amount invested in our portfolio
        spy_invested = 0.0
        spy_investment_log = []
        
        print(f"Debug SPY: Initializing with total_invested: ${total_invested:.2f}, spy_cash: ${spy_cash:.2f}")
        
        # SPY data fetched successfully
        
        if interval == "single_shot":
            # Step 4.14.1: Single-shot SPY investment
            first_date = stock_data.index[0]
            spy_price = spy_prices.loc[first_date]
            if isinstance(spy_price, pd.Series):
                spy_price = spy_price.iloc[0]
            if not pd.isna(spy_price) and spy_price > 0:
                spy_shares = spy_cash / spy_price
                spy_invested = spy_shares * spy_price
                spy_cash -= spy_invested
                spy_investment_log.append(
                    f"{first_date.date()}: Bought {spy_shares:.2f} shares of SPY at ${spy_price:.2f} (cost: ${spy_invested:.2f})"
                )
                print(f"Debug SPY: Single-shot investment - Shares: {spy_shares:.4f}, Price: ${spy_price:.2f}, Invested: ${spy_invested:.2f}")
            else:
                print(f"Debug SPY: Invalid price for single-shot investment - Price: {spy_price}")
        else:
            # Step 4.14.2: DCA SPY investment - spread equal amounts over time
            dca_amount = total_invested / len(stock_data)
            for date in stock_data.index:
                spy_price = spy_prices.loc[date]
                if isinstance(spy_price, pd.Series):
                    spy_price = spy_price.iloc[0]
                if not pd.isna(spy_price) and spy_price > 0:
                    shares = dca_amount / spy_price
                    cost = shares * spy_price
                    spy_shares += shares
                    spy_cash -= cost
                    spy_invested += cost
                    spy_investment_log.append(
                        f"{date.date()}: Bought {shares:.2f} shares of SPY at ${spy_price:.2f} (cost: ${cost:.2f})"
                    )
            print(f"Debug SPY: DCA investment - Total shares: {spy_shares:.4f}, Total invested: ${spy_invested:.2f}")

        # Step 4.15: Build performance comparison data for charting
        performanceData = []
        running_holdings = holdings.copy()
        running_cash = total_cash
        
        # Build performance comparison data for charting
        
        for date in stock_data.index:
            # Step 4.15.1: Calculate portfolio value at each date
            port_value = (
                sum(
                    running_holdings[t] * stock_data.loc[date][t]
                    for t in all_tickers
                    if t in running_holdings and not pd.isna(stock_data.loc[date][t])
                )
                # Note: Not adding cash here since we want pure investment performance
            )
            
            # Step 4.15.2: Calculate SPY value at each date
            spy_price = spy_prices.loc[date]
            if isinstance(spy_price, pd.Series):
                spy_price = spy_price.iloc[0]
            
            # SPY price calculation for this date
            
            # Calculate SPY portfolio value: shares * current_price (no cash remaining after investment)
            spy_val = (
                spy_shares * spy_price if not pd.isna(spy_price) else None
            )
            
            # Debug: Print first few SPY calculations
            if len(performanceData) < 3:
                print(f"Debug SPY: Date: {date}, SPY price: {spy_price}, SPY shares: {spy_shares}, SPY value: {spy_val}")
            
            
            # SPY portfolio value calculated for this date
            
            # Step 4.15.3: Add data point for this date
            performanceData.append(
                {
                    "date": str(date.date()),
                    "portfolio": finite_float(port_value, default=None),
                    "spy": finite_float(spy_val, default=None),
                }
            )

        # Step 4.16: Add performance data to investment summary
        self.state['state']["investment_summary"]["performanceData"] = performanceData

        # Step 4.17: Compose summary message for user
        if add_funds_needed:
            msg = "Some investments could not be made due to insufficient funds. Please add more funds to your wallet.\n"
            for d, t, p, c in add_funds_dates:
                msg += f"On {d}, not enough cash for {t}: price ${p:.2f}, available ${c:.2f}\n"
        else:
            msg = "All investments were made successfully.\n"
        msg += f"\nFinal portfolio value: ${finite_float(total_value):.2f}\n"
        msg += "Returns by ticker (percent and $):\n"
        for ticker in all_tickers:
            percent = finite_float(percent_return_per_stock.get(ticker))
            abs_return = finite_float(returns.get(ticker))
            msg += f"{ticker}: {percent:.2f}% (${abs_return:.2f})\n"

        # Step 4.18: Add tool message indicating data extraction is complete
        self.state['state']["messages"].append(
            ToolMessage(
                role="tool",
                id=str(uuid.uuid4()),
                content="The relevant details had been extracted",
                tool_call_id=last_assistant_message.tool_calls[0].id,
            )
        )

        # Step 4.19: Add assistant message with chart rendering tool call
        self.state['state']["messages"].append(
            AssistantMessage(
                role="assistant",
                tool_calls=[
                    {
                        "id": str(uuid.uuid4()),
                        "type": "function",
                        "function": {
                            "name": "render_standard_charts_and_table",
                            "arguments": json.dumps(
                                {
                                    "investment_summary": json_safe(
                                        self.state['state']["investment_summary"]
                                    )
                                },
                                allow_nan=False,
                            ),
                        },
                    }
                ],
                id=str(uuid.uuid4()),
            )
        )
        
        # Step 4.20: Mark allocation calculation as completed
        index = len(self.state['state']["tool_logs"]) - 1
        self.state.get("emit_event")(
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[
                    {
                        "op": "replace",
                        "path": f"/tool_logs/{index}/status",
                        "value": "completed",
                    }
                ],
            )
        )
        await asyncio.sleep(0)
        
        # Add a small delay to allow chart to stabilize before insights generation
        # This prevents the graph from becoming unresponsive too quickly
        await asyncio.sleep(0.8)  # 800ms delay for chart stabilization
        
        return "insights"  # Proceed to insights generation
    
    @listen("allocation")
    async def insights(self):
        """
        Step 5: Generate bull/bear insights about the selected stocks
        - Use OpenAI to generate positive and negative analysis
        - Add insights to the investment summary for balanced perspective
        """
        # Step 5.1: Ensure we have tool calls from previous step
        # Find the last AssistantMessage with tool calls
        last_assistant_message = None
        for message in reversed(self.state['state']['messages']):
            if hasattr(message, 'tool_calls') and message.tool_calls is not None:
                last_assistant_message = message
                break
        
        if last_assistant_message is None:
            return "end"
            
        # Step 5.2: Create tool log for insights generation
        tool_log_id = str(uuid.uuid4())
        self.state['state']["tool_logs"].append(
            {
                "id": tool_log_id,
                "message": "Extracting Key insights",
                "status": "processing",
            }
        )
        
        # Step 5.3: Emit state change to update UI
        self.state.get("emit_event")(
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[
                    {
                        "op": "add",
                        "path": "/tool_logs/-",
                        "value": {
                            "message": "Extracting Key insights",
                            "status": "processing",
                            "id": tool_log_id,
                        },
                    }
                ],
            )
        )
        await asyncio.sleep(0)
        
        # Step 5.4: Use extract args from this run, and annotate the chart tool call
        current_tickers = (getattr(self, "be_arguments", None) or {}).get(
            "ticker_symbols"
        ) or []
        chart_message, chart_call, raw_args = _find_chart_tool_call(
            self.state["state"]["messages"]
        )
        if not current_tickers or chart_call is None:
            return "end"

        # Step 5.5: Call OpenAI to generate bull/bear insights
        response = traced_chat_completion(
            self.state.get("run_id", "unknown"),
            "insights",
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": insights_prompt},
                {"role": "user", "content": json.dumps(current_tickers)},
            ],
            tools=[generate_insights],
        )
        
        # Step 5.6: Merge insights into the chart payload the UI actually renders
        args_dict = _parse_tool_args(raw_args)
        if response.choices[0].finish_reason == "tool_calls":
            raw_insights = json.loads(
                response.choices[0].message.tool_calls[0].function.arguments
            )
            guarded = sanitize_insights(raw_insights)
            if not guarded.ok:
                log_event(
                    self.state.get("run_id", "unknown"),
                    "safety_output_block",
                    reason=guarded.reason,
                )
                insights = {}
            else:
                insights = guarded.insights
            args_dict["insights"] = insights
            summary = args_dict.get("investment_summary")
            if isinstance(summary, dict):
                summary["insights"] = insights
                args_dict["investment_summary"] = summary
            payload = json.dumps(json_safe(args_dict), allow_nan=False)
            _write_tool_call_args(chart_call, payload)
            if chart_message is not last_assistant_message:
                _write_tool_call_args(last_assistant_message.tool_calls[0], payload)
        else:
            self.state['state']["insights"] = {}
            
        # Step 5.7: Mark insights extraction as completed
        index = len(self.state['state']["tool_logs"]) - 1
        self.state.get("emit_event")(
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[
                    {
                        "op": "replace",
                        "path": f"/tool_logs/{index}/status",
                        "value": "completed",
                    }
                ],
            )
        )
        await asyncio.sleep(0)
        return "end"  # All steps complete, proceed to end
    
    @listen("insights")
    def end(self):
        """
        Step 6: Final step - return the complete state after insights.
        Listening only to insights keeps kickoff from finishing as soon as chat ends.
        """
        return self.state


# ===============================================================================
# UTILITY FUNCTIONS
# ===============================================================================

def finite_float(value, default=0.0):
    try:
        if value is None:
            return default
        if pd.isna(value):
            return default
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def json_safe(value):
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (np.integer, int)) and not isinstance(value, bool):
        return int(value)
    if isinstance(value, (np.floating, float)):
        number = float(value)
        return number if math.isfinite(number) else None
    if isinstance(value, str):
        return value
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(value, "item"):
        try:
            return json_safe(value.item())
        except Exception:
            return str(value)
    return value


_MONTHS = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3,
    "april": 4, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10, "november": 11, "nov": 11, "december": 12, "dec": 12,
}
_TICKER_TOKEN = re.compile(r"\b[A-Za-z][A-Za-z0-9.]{0,9}\b")
_WATCHLIST_RE = re.compile(
    r"\b(my watchlist|the watchlist|these stocks|my portfolio|my stocks)\b",
    re.I,
)


def _iter_tool_calls(message):
    calls = getattr(message, "tool_calls", None)
    if calls is None and isinstance(message, dict):
        calls = message.get("tool_calls")
    return calls or []


def _function_name_and_args(tool_call):
    if isinstance(tool_call, dict):
        function = tool_call.get("function") or {}
    else:
        function = getattr(tool_call, "function", None) or {}
    if isinstance(function, dict):
        return function.get("name"), function.get("arguments")
    return getattr(function, "name", None), getattr(function, "arguments", None)


def _write_tool_call_args(tool_call, arguments_json):
    if isinstance(tool_call, dict):
        function = tool_call.setdefault("function", {})
        if isinstance(function, dict):
            function["arguments"] = arguments_json
        else:
            function.arguments = arguments_json
        return
    function = getattr(tool_call, "function", None)
    if isinstance(function, dict):
        function["arguments"] = arguments_json
        return
    if function is not None:
        function.arguments = arguments_json


def _parse_tool_args(raw_args):
    if isinstance(raw_args, dict):
        return dict(raw_args)
    if not raw_args:
        return {}
    try:
        parsed = json.loads(raw_args)
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _find_chart_tool_call(messages):
    for message in reversed(messages or []):
        for tool_call in _iter_tool_calls(message):
            name, arguments = _function_name_and_args(tool_call)
            if name == "render_standard_charts_and_table":
                return message, tool_call, arguments
    return None, None, None


def _clean_portfolio(portfolio):
    if isinstance(portfolio, str):
        try:
            portfolio = json.loads(portfolio)
        except json.JSONDecodeError:
            return []
    if not isinstance(portfolio, list):
        return []
    cleaned = []
    seen = set()
    for item in portfolio:
        if not isinstance(item, dict):
            continue
        ticker = is_extracted_ticker(item.get("ticker") or item.get("symbol"))
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        cleaned.append({**item, "ticker": ticker})
    return cleaned


def _price_frame(close, tickers):
    if close is None:
        return None
    if isinstance(close, pd.Series):
        name = close.name
        if name not in tickers:
            name = tickers[0] if len(tickers) == 1 else None
        if not name:
            return None
        return close.to_frame(name=name)
    if not isinstance(close, pd.DataFrame) or close.empty:
        return None
    return close


def _tickers_with_prices(close, tickers):
    frame = _price_frame(close, tickers)
    if frame is None:
        return []
    usable = []
    for ticker in tickers:
        if ticker not in frame.columns:
            continue
        values = pd.to_numeric(frame[ticker], errors="coerce")
        if values.dropna().empty:
            continue
        usable.append(ticker)
    return usable


def _align_extract_args(arguments, usable):
    tickers = arguments.get("ticker_symbols") or []
    amounts = arguments.get("amount_of_dollars_to_be_invested") or []
    kept = []
    kept_amounts = []
    for index, ticker in enumerate(tickers):
        if ticker not in usable:
            continue
        kept.append(ticker)
        if index < len(amounts):
            kept_amounts.append(amounts[index])
    if not kept:
        kept = list(usable)
        kept_amounts = [10_000.0] * len(kept)
    elif len(kept_amounts) != len(kept):
        kept_amounts = [10_000.0] * len(kept)
    return {
        **arguments,
        "ticker_symbols": kept,
        "amount_of_dollars_to_be_invested": kept_amounts,
    }


def _shift_years(today, years):
    try:
        return today.replace(year=today.year - years)
    except ValueError:
        return date(today.year - years, 2, 28)


def parse_amount_from_text(text):
    if not text:
        return None
    dollar = re.search(
        r"\$\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k\b)?",
        text,
        re.I,
    )
    if dollar:
        number = float(dollar.group(1).replace(",", ""))
        if dollar.group(2):
            number *= 1000
        return number
    thousand = re.search(r"\b(\d+(?:\.\d+)?)\s*(k|thousand)\b", text, re.I)
    if thousand:
        return float(thousand.group(1)) * 1000
    dollars = re.search(
        r"\b(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*dollars\b",
        text,
        re.I,
    )
    if dollars:
        return float(dollars.group(1).replace(",", ""))
    return None


def parse_date_from_text(text):
    if not text:
        return None
    today = datetime.today().date()
    lowered = text.lower()
    if re.search(r"\b(last year|past year|since last year|the past year)\b", lowered):
        return _shift_years(today, 1).isoformat()
    years_ago = re.search(r"\b(\d+)\s+years?\s+ago\b", lowered)
    if years_ago:
        return _normalize_date(_shift_years(today, int(years_ago.group(1))).isoformat())
    iso = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", text)
    if iso:
        return _normalize_date(iso.group(1))
    named = re.search(
        r"\b(" + "|".join(sorted(_MONTHS, key=len, reverse=True)) + r")\s+(\d{4})\b",
        lowered,
    )
    if named:
        month = _MONTHS[named.group(1)]
        return _normalize_date(f"{int(named.group(2))}-{month:02d}-01")
    year_only = re.search(r"\b(?:since|from|in)\s+(20\d{2})\b", lowered)
    if year_only:
        return _normalize_date(f"{year_only.group(1)}-01-01")
    return None


def parse_interval_from_text(text):
    if not text:
        return None
    lowered = text.lower()
    if re.search(r"\b(quarterly|every quarter)\b", lowered):
        return "3mo"
    if re.search(r"\b(weekly|every week|each week)\b", lowered):
        return "7d"
    if re.search(r"\b(daily|every day)\b", lowered):
        return "1d"
    if re.search(r"\b(dca|dollar[-\s]?cost|monthly|every month|each month|1mo)\b", lowered):
        return "1mo"
    if re.search(r"\b(single[-\s]?shot|lump sum|all at once)\b", lowered):
        return "single_shot"
    return None


def parse_tickers_from_text(text, portfolio_tickers):
    if not text:
        return None
    portfolio_set = {
        ticker for ticker in portfolio_tickers if is_extracted_ticker(ticker)
    }
    mentioned = []
    extras = []
    seen = set()
    for token in _TICKER_TOKEN.findall(text):
        ticker = is_extracted_ticker(token)
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        if ticker in portfolio_set:
            mentioned.append(ticker)
        else:
            extra = is_free_text_ticker(token, allow=portfolio_set)
            if extra:
                extras.append(extra)
    if _WATCHLIST_RE.search(text):
        combined = []
        seen = set()
        for ticker in list(portfolio_tickers) + extras:
            ticker = is_extracted_ticker(ticker)
            if not ticker or ticker in seen:
                continue
            seen.add(ticker)
            combined.append(ticker)
        return combined or None
    if mentioned or extras:
        return mentioned + extras
    return None


def watchlist_extract_args(flow_state, user_text=""):
    portfolio = flow_state.get("investment_portfolio")
    nested = flow_state.get("state")
    if portfolio is None and isinstance(nested, dict):
        portfolio = nested.get("investment_portfolio")
    if isinstance(portfolio, str):
        try:
            portfolio = json.loads(portfolio)
        except json.JSONDecodeError:
            return None
    if not isinstance(portfolio, list) or not portfolio:
        return None

    portfolio_tickers = []
    portfolio_amounts = {}
    for item in portfolio:
        if not isinstance(item, dict):
            continue
        ticker = item.get("ticker") or item.get("symbol")
        if not ticker:
            continue
        ticker = is_extracted_ticker(ticker)
        if not ticker:
            continue
        if ticker not in portfolio_tickers:
            portfolio_tickers.append(ticker)
        try:
            portfolio_amounts[ticker] = float(item.get("amount", 10_000))
        except (TypeError, ValueError):
            portfolio_amounts[ticker] = 10_000.0
    if not portfolio_tickers:
        return None

    tickers = parse_tickers_from_text(user_text, portfolio_tickers) or portfolio_tickers
    amount = parse_amount_from_text(user_text)
    if amount is not None:
        amounts = [amount] * len(tickers)
    else:
        amounts = [portfolio_amounts.get(ticker, 10_000.0) for ticker in tickers]

    today = datetime.today().date()
    investment_date = parse_date_from_text(user_text)
    if not investment_date:
        investment_date = _shift_years(today, 1).isoformat()

    return {
        "ticker_symbols": tickers,
        "investment_date": investment_date,
        "amount_of_dollars_to_be_invested": amounts,
        "interval_of_investment": parse_interval_from_text(user_text) or "single_shot",
        "to_be_added_in_portfolio": True,
    }


def convert_tool_call(tc):
    """
    Utility function to convert OpenAI tool call format to our internal format
    
    Args:
        tc: OpenAI tool call object
        
    Returns:
        dict: Formatted tool call dictionary compatible with our message system
    """
    return {
        "id": tc.id,
        "type": "function",
        "function": {
            "name": tc.function.name,
            "arguments": tc.function.arguments,
        },
    }