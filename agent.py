import asyncio
import json
import os
import sys
import tempfile
import shutil
from pathlib import Path

from dotenv import load_dotenv
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from openai import OpenAI

load_dotenv()

SYSTEM_PROMPT_FILE = Path(__file__).parent / "system.md"
STRIP_CSS_SCRIPT = Path(__file__).parent / "strip-css.js"


def load_system_prompt() -> str:
    if SYSTEM_PROMPT_FILE.exists() and SYSTEM_PROMPT_FILE.read_text(encoding="utf-8").strip():
        return SYSTEM_PROMPT_FILE.read_text(encoding="utf-8").strip()
    return (
        "You are a browser-automation assistant with Playwright tools. "
        "Use them step by step to fulfill the user's request, then give "
        "a final answer summarising what you found or did."
    )


def mcp_tools_to_openai(mcp_tools: list) -> list[dict]:
    return [
        {
            "type": "function",
            "name": t.name,
            "description": t.description or "",
            "parameters": t.inputSchema or {"type": "object", "properties": {}},
        }
        for t in mcp_tools
    ]


async def run_agent(user_query: str):
    client = OpenAI()
    tmp_dir = tempfile.mkdtemp(prefix="playwright-agent-")

    server_params = StdioServerParameters(
        command="npx",
        args=[
            "@playwright/mcp@latest",
            "--caps", "vision",
            "--output-dir", tmp_dir,
            "--init-script", STRIP_CSS_SCRIPT.as_posix(),
        ],
        cwd=tmp_dir,
    )

    try:
        async with stdio_client(server_params) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()

                tools_result = await session.list_tools()
                openai_tools = mcp_tools_to_openai(tools_result.tools)
                print(f"\nLoaded {len(openai_tools)} tools\n")

                input_items: list = [
                    {"role": "system", "content": load_system_prompt()},
                    {"role": "user", "content": user_query},
                ]

                while True:
                    response = client.responses.create(
                        model="gpt-5-mini",
                        input=input_items,
                        tools=openai_tools,
                        reasoning={"effort":"minimal"},
                    )

                    function_calls = [o for o in response.output if o.type == "function_call"]

                    if not function_calls:
                        print(f"\nAgent: {response.output_text or '(no text)'}\n")
                        break

                    input_items += response.output
                    image_parts: list[dict] = []

                    for fc in function_calls:
                        fn_args = json.loads(fc.arguments)
                        print(f"  -> {fc.name}({json.dumps(fn_args)})")

                        try:
                            result = await session.call_tool(fc.name, fn_args)
                        except Exception as exc:
                            print(f"     Error: {exc}")
                            input_items.append({"type": "function_call_output", "call_id": fc.call_id, "output": f"Error: {exc}"})
                            continue

                        texts = []
                        has_image = False
                        for block in result.content:
                            if block.type == "image":
                                has_image = True
                                mime = getattr(block, "mimeType", "image/png")
                                image_parts.append({
                                    "type": "input_image",
                                    "image_url": f"data:{mime};base64,{block.data}",
                                    "detail": "low",
                                })
                            elif block.type == "text" and block.text:
                                texts.append(block.text)

                        output = "\n".join(texts) or "(empty)"
                        tag = " [+screenshot]" if has_image else ""
                        print(f"     {output}{tag}")

                        input_items.append({"type": "function_call_output", "call_id": fc.call_id, "output": output})

                    if image_parts:
                        input_items.append({
                            "role": "user",
                            "content": [
                                {"type": "input_text", "text": "Here are the screenshots from the tool calls above. Use them to answer my request."},
                                *image_parts,
                            ],
                        })
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def main():
    if not os.getenv("OPENAI_API_KEY"):
        print("Set OPENAI_API_KEY in your .env file first!")
        sys.exit(1)

    print("Playwright + GPT-5 Browser Agent")
    print("-" * 40)

    while True:
        try:
            query = input("\nYou: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye!")
            break
        if not query:
            continue
        if query.lower() in ("exit", "quit", "q"):
            print("Bye!")
            break
        asyncio.run(run_agent(query))


if __name__ == "__main__":
    main()
