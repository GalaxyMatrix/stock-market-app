# FastAPI framework for building the web API
from fastapi import FastAPI
from fastapi.responses import StreamingResponse  # For streaming real-time responses to client

# Standard Python libraries
import uuid  
from typing import Any  
import os  
import uvicorn  
import asyncio  


# AG UI core components for agent communication and event handling
from ag_ui.core import (
    RunAgentInput,           
    StateSnapshotEvent,      
    EventType,               
    RunStartedEvent,        
    RunFinishedEvent,        
    TextMessageStartEvent,   
    TextMessageEndEvent,     
    TextMessageContentEvent, 
    ToolCallStartEvent,      
    ToolCallEndEvent,        
    ToolCallArgsEvent,       
    StateDeltaEvent          
)
from ag_ui.encoder import EventEncoder  # Encoder for converting events to streamable format

# Import our custom stock analysis workflow
from stock_analysis import StockAnalysisFlow
from safety.input_guard import check_messages
from observability.log import log_event

# CopilotKit state management
from copilotkit import CopilotKitState

# ===============================================================================
# APPLICATION SETUP
# ===============================================================================

# Initialize FastAPI application instance
app = FastAPI()


@app.get("/health")
async def health():
    return {"ok": True}


# ===============================================================================
# STATE MANAGEMENT
# ===============================================================================

class AgentState(CopilotKitState):
    """
    Agent state class that manages the data throughout the stock analysis workflow.
    
    This class extends CopilotKitState to provide structured state management
    for the stock analysis agent. It tracks:
    - Tool configurations and message history
    - Stock data and analysis arguments
    - Financial information (cash, investments, summaries)
    - UI interaction logs
    
    Inherits from CopilotKitState (which extends langgraph's MessagesState)
    """

    tools: list                    
    messages: list                 
    be_stock_data: Any            
    be_arguments: dict            
    available_cash: int           
    investment_summary: dict      
    tool_logs: list              

# ===============================================================================
# MAIN API ENDPOINT
# ===============================================================================

@app.post("/crewai-agent")
async def crewai_agent(input_data: RunAgentInput):
    """
    Main API endpoint for processing stock analysis requests.
    
    This endpoint:
    1. Receives user input and current state from the frontend
    2. Streams real-time events back to the client during processing
    3. Runs the StockAnalysisFlow workflow asynchronously
    4. Returns results via Server-Sent Events (SSE) streaming
    
    Args:
        input_data (RunAgentInput): Contains user messages, tools, state, thread/run IDs
        
    Returns:
        StreamingResponse: Real-time stream of events during agent execution
    """
    try:

        async def event_generator():
            """
            Asynchronous generator that streams events to the client in real-time.
            
            This function orchestrates the entire stock analysis workflow:
            1. Sets up event streaming infrastructure
            2. Emits initial state and run started events
            3. Launches the StockAnalysisFlow workflow
            4. Streams progress events as they occur
            5. Handles final results (tool calls or text messages)
            6. Emits run completion events
            
            Yields:
                Encoded events for Server-Sent Events (SSE) streaming
            """
            encoder = EventEncoder()
            event_queue = asyncio.Queue()

            def emit_event(event):
                """Callback function for the workflow to emit events"""
                event_queue.put_nowait(event)
            

            message_id = str(uuid.uuid4())
            run_id = input_data.run_id or str(uuid.uuid4())
            log_event(run_id, "run_start", thread_id=input_data.thread_id)

            yield encoder.encode(
                RunStartedEvent(
                    type=EventType.RUN_STARTED,
                    thread_id = input_data.thread_id,
                    run_id = run_id
                )
            )


            yield encoder.encode(
                StateSnapshotEvent(
                    type=EventType.STATE_SNAPSHOT,
                    snapshot={
                        "available_cash": input_data.state["available_cash"],        # Current cash balance
                        "investment_summary": input_data.state["investment_summary"], # Previous analysis results
                        "investment_portfolio": input_data.state["investment_portfolio"], # Current holdings
                        "tool_logs": []  # Reset tool logs for new analysis
                    }
                )
            )


            state = AgentState(
                tools = input_data.tools,
                messages = input_data.messages,
                be_stock_data = None,
                be_arguments = None,
                available_cash = input_data.state["available_cash"],
                investment_portfolio = input_data.state["investment_portfolio"],
                tool_logs = []
            )

            guard = check_messages(input_data.messages)
            if not guard.allowed:
                log_event(run_id, "safety_input_block", reason=guard.reason)
                log_event(run_id, "run_end", ok=False, reason=guard.reason)
                yield encoder.encode(
                    TextMessageStartEvent(
                        type=EventType.TEXT_MESSAGE_START,
                        message_id=message_id,
                        role="assistant",
                    )
                )
                yield encoder.encode(
                    TextMessageContentEvent(
                        type=EventType.TEXT_MESSAGE_CONTENT,
                        message_id=message_id,
                        delta=guard.refusal,
                    )
                )
                yield encoder.encode(
                    TextMessageEndEvent(
                        type=EventType.TEXT_MESSAGE_END,
                        message_id=message_id,
                    )
                )
                yield encoder.encode(
                    RunFinishedEvent(
                        type=EventType.RUN_FINISHED,
                        thread_id=input_data.thread_id,
                        run_id=run_id,
                    )
                )
                return

            agent_task = asyncio.create_task(
                StockAnalysisFlow().kickoff_async(inputs={
                    "state" : state,
                    "emit_event" : emit_event,
                    "investment_portfolio" : input_data.state["investment_portfolio"],
                    "run_id": run_id,
                })
            )

            chart_data_sent = False
            while True:
                try:
                    event = await asyncio.wait_for(event_queue.get(), timeout=0.1)

                    should_stream = True 


                     # Check if this is a tool log completion event (indicates allocation stage done)
                    if (hasattr(event, 'delta') and event.delta and 
                        isinstance(event.delta, list) and len(event.delta) > 0 and
                        event.delta[0].get('path') == '/tool_logs' and
                        event.delta[0].get('op') == 'replace' and
                        event.delta[0].get('value') == 'completed'):
                        chart_data_sent = True
                        # Don't stop streaming yet - let the chart data go through first
                    
                    # Check if this is the actual chart tool call being sent
                    if (hasattr(event, 'type') and event.type == EventType.TOOL_CALL_ARGS and
                        hasattr(event, 'delta') and 'render_standard_charts_and_table' in str(event.delta)):
                        # This is the chart data being sent - mark it and allow it through
                        chart_data_sent = True
                        should_stream = True
                    
                    # After chart data is sent, block insights-related events but allow portfolio updates
                    if chart_data_sent and (hasattr(event, 'delta') and event.delta and 
                        isinstance(event.delta, list) and len(event.delta) > 0):
                        # Allow portfolio updates to go through
                        if event.delta[0].get('path') == '/investment_portfolio':
                            should_stream = True
                        # Block insights-related events
                        elif ('insights' in str(event.delta[0]).lower() or 
                              'processing' in str(event.delta[0]).lower() or
                              'extracting' in str(event.delta[0]).lower()):
                            should_stream = False
                    
                    if should_stream:
                        yield encoder.encode(event)  # Stream the event to client
                        
                except asyncio.TimeoutError:
                    # No events in queue - check if workflow is complete
                    if agent_task.done():
                        break  # Exit loop when workflow finishes
                    
                    # If chart data has been sent and workflow is still running (insights stage),
                    # we can break early to make graph interactive while insights generate
                    if chart_data_sent and not agent_task.done():
                        # Minimal delay to ensure chart data is fully processed
                        await asyncio.sleep(0.2)
                        break  # Exit early to make graph interactive

            # Step 7: Clear tool logs after workflow completion
            # This prevents old progress logs from cluttering the UI
            yield encoder.encode(
            StateDeltaEvent(
                type=EventType.STATE_DELTA,
                delta=[
                    {
                        "op": "replace",
                        "path": "/tool_logs",
                        "value": []
                    }
                ]
            )
            )
            
            last_assistant = None
            for message in reversed(state["messages"]):
                if getattr(message, "role", None) == "assistant":
                    last_assistant = message
                    break

            chart_call = None
            if last_assistant and getattr(last_assistant, "tool_calls", None):
                candidate = last_assistant.tool_calls[0]
                if candidate.function.name == "render_standard_charts_and_table":
                    chart_call = candidate

            if chart_call:
                yield encoder.encode(
                    ToolCallStartEvent(
                        type=EventType.TOOL_CALL_START,
                        tool_call_id=chart_call.id,
                        toolCallName=chart_call.function.name,
                    )
                )
                yield encoder.encode(
                    ToolCallArgsEvent(
                        type=EventType.TOOL_CALL_ARGS,
                        tool_call_id=chart_call.id,
                        delta=chart_call.function.arguments,
                    )
                )
                yield encoder.encode(
                    ToolCallEndEvent(
                        type=EventType.TOOL_CALL_END,
                        tool_call_id=chart_call.id,
                    )
                )
            else:
                content = ""
                if last_assistant:
                    content = (
                        getattr(last_assistant, "content", None)
                        or getattr(last_assistant, "refusal", None)
                        or ""
                    )
                if not content:
                    content = (
                        "Analysis finished, but I have no chart or summary to show. "
                        'Try: Analyze my watchlist with $10k each since last year.'
                    )

                yield encoder.encode(
                    TextMessageStartEvent(
                        type=EventType.TEXT_MESSAGE_START,
                        message_id=message_id,
                        role="assistant",
                    )
                )
                n_parts = 100
                part_length = max(1, len(content) // n_parts)
                parts = [content[i:i + part_length] for i in range(0, len(content), part_length)]
                if len(parts) > n_parts:
                    parts = parts[:n_parts - 1] + ["".join(parts[n_parts - 1:])]
                for part in parts:
                    yield encoder.encode(
                        TextMessageContentEvent(
                            type=EventType.TEXT_MESSAGE_CONTENT,
                            message_id=message_id,
                            delta=part,
                        )
                    )
                    await asyncio.sleep(0.05)
                yield encoder.encode(
                    TextMessageEndEvent(
                        type=EventType.TEXT_MESSAGE_END,
                        message_id=message_id,
                    )
                )

            # Step 9: Emit run finished event to signal completion
            log_event(run_id, "run_end", ok=True)
            yield encoder.encode(
                RunFinishedEvent(
                    type=EventType.RUN_FINISHED,
                    thread_id=input_data.thread_id,  # Same thread ID from start
                    run_id=run_id,
                )
            )

    except Exception as e:
        # Step 10: Handle any unexpected errors during processing
        print(e)  # Log error for debugging

    # Step 11: Return streaming response to client
    # Step 11: Return streaming response to client
    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ===============================================================================
# SERVER STARTUP AND CONFIGURATION
# ===============================================================================

def main():
    """
    Main function to start the uvicorn server.
    
    This function:
    - Reads the port from environment variables (defaults to 8000)
    - Configures uvicorn server settings
    - Starts the server with hot reload enabled for development
    """
    # Get port from environment variable or use default
    port = int(os.getenv("PORT", "8000"))
    
    # Start uvicorn server with configuration
    uvicorn.run(
        "main:app",           # Module and app instance
        host="0.0.0.0",      # Listen on all network interfaces
        port=port,           # Port number
        reload=True,         # Enable hot reload for development
    )


if __name__ == "__main__":
    """
    Entry point when script is run directly.
    Starts the FastAPI server using uvicorn.
    """
    main()