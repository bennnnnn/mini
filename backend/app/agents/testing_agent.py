"""TestingAgent — writes tests, runs them, and fixes failures automatically.

Unlike most agents, the Testing Agent can loop internally:
write tests → run → read failures → fix code → run again.
"""

from typing import Any, Dict

from app.agents.base_agent import BaseAgent

SYSTEM = """You are the Testing Agent for Mini Cursor — an AI software engineering platform.

Your job: ensure the code works by writing and running tests.

## Workflow
1. Call list_files to see what code exists
2. Read the source files that need testing
3. Write comprehensive tests in the appropriate test file
4. Run the tests with run_tests (or run_python for a quick check)
5. If tests FAIL:
   a. Read the failure output carefully
   b. Determine if the bug is in the TEST or the SOURCE CODE
   c. Fix whichever has the bug
   d. Run tests again
6. Repeat until all tests pass (max 3 fix cycles)

## Writing good tests
- Test the happy path AND edge cases
- Test error handling (invalid inputs, missing data)
- Use descriptive test names: test_user_creation_with_valid_email()
- Group related tests in classes

## What you can do
- Read any file
- Write test files and fix source files if needed
- Run tests and Python scripts
- Search for patterns in the codebase

## Output
After tests pass, report:
- How many tests written
- What was tested
- Any fixes made to source code
"""


class TestingAgent(BaseAgent):
    name = "testing"
    system_prompt = SYSTEM

    ALLOWED_TOOLS = {
        "read_file", "write_file", "list_files", "search_files",
        "run_tests", "run_python", "run_bash",
    }

    async def run(
        self,
        task: str,
        tools: Dict[str, Any],
        context: str = "",
    ) -> Dict[str, Any]:
        """Write tests, run them, and fix failures."""
        agent_tools = {k: v for k, v in tools.items() if k in self.ALLOWED_TOOLS}

        result = await self.run_agentic_loop(
            task=task,
            tools=agent_tools,
            extra_context=context,
            max_turns=20,  # Needs extra turns: write → run → fix → run cycle
        )

        # Determine if tests passed by looking at run_tests output
        test_passed = False
        test_output = ""
        for tc in result["tool_calls"]:
            if tc["tool"] in ("run_tests", "run_python"):
                import json as _json
                try:
                    out = _json.loads(tc["output"])
                    test_passed = out.get("success", False)
                    test_output = out.get("stdout", "") or out.get("stderr", "")
                except Exception:
                    pass

        return {
            # success=True means the agent ran successfully.
            # Whether the tests PASSED is in `tests_passed`.
            "success": True,
            "tests_passed": test_passed,
            "summary": result["text"],
            "test_output": test_output,
            "tool_calls": result["tool_calls"],
            "usage": result["usage"],
        }

    @classmethod
    def format_chat(cls, result: dict) -> str:
        test_out = result.get("test_output", "").strip()
        passed = result.get("tests_passed", False)
        verdict = "✓ Tests passed" if passed else "✗ Tests failed"
        if test_out:
            return f"{verdict}\n\n```\n{test_out[:600]}\n```"
        return verdict
