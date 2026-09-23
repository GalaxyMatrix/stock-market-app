import {
    CopilotRuntime,
    copilotRuntimeNextJSAppRouterEndpoint,
    OpenAIAdapter,
  } from "@copilotkit/runtime";
  import { NextRequest } from "next/server";
  import { HttpAgent } from "@ag-ui/client";


  const crewaiAgent = new HttpAgent({
    url: process.env.CREWAI_AGENT_URL || "http://127.0.0.1:8000/crewai-agent",
});

const runtime = new CopilotRuntime({
    agents: {
        // HttpAgent and CopilotKit pin different AG-UI Message shapes
        crewaiAgent: crewaiAgent as never,
    }
});


export const POST = async (req: NextRequest) => {
    const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
      runtime,
      serviceAdapter: new OpenAIAdapter(),
      endpoint: "/api/copilotkit",
    });
    return handleRequest(req);
  };