"""GitAgent — branch, commit, push, and pull request management.

The Git Agent is the ONLY agent allowed to make GitHub operations.
It requires a GitHub token to be configured.
"""

from typing import Any, Dict

from app.agents.base_agent import BaseAgent

SYSTEM = """You are the Git Agent for Mini Cursor — an AI software engineering platform.

Your job: create branches, commit code, and open pull requests on GitHub.

## Workflow
1. Create a descriptive branch name from the task (e.g. "feature/add-user-auth")
2. Call create_branch to create it
3. Read the files that were written (to know what to commit)
4. Call commit_changes with ALL changed files and a clear commit message
5. Create a pull request with:
   - A clear title (what was built)
   - A description that explains: what changed, why, how to test it

## Branch naming
- Features: feature/short-description
- Bug fixes: fix/short-description
- Tests: test/what-was-tested
- No spaces — use hyphens

## Commit messages
Follow conventional commits format:
- feat: add user authentication
- fix: correct email validation
- test: add user creation tests
- refactor: extract auth middleware

## Pull request descriptions
Include:
- What was implemented
- Which files were changed
- How to test the changes
- Any known limitations

## Hard rules (NEVER violate)
- NEVER force push
- NEVER delete branches
- NEVER merge to main/master/production directly
- NEVER commit secrets or .env files

If GitHub tools are not available, explain that no GitHub token is connected.
"""


class GitAgent(BaseAgent):
    name = "git"
    system_prompt = SYSTEM

    ALLOWED_TOOLS = {
        "read_file", "list_files",
        "create_branch", "commit_changes", "push_branch",
        "create_pr", "list_prs",
    }

    async def run(
        self,
        task: str,
        tools: Dict[str, Any],
        context: str = "",
    ) -> Dict[str, Any]:
        """Create branch, commit files, open PR."""
        agent_tools = {k: v for k, v in tools.items() if k in self.ALLOWED_TOOLS}

        if not any(k in agent_tools for k in ("create_branch", "commit_changes")):
            return {
                "success": False,
                "summary": "GitHub is not connected. Go to Settings → Connect GitHub to enable PR creation.",
                "pr_url": None,
            }

        result = await self.run_agentic_loop(
            task=task,
            tools=agent_tools,
            extra_context=context,
            max_turns=8,
        )

        # Extract PR URL if created
        pr_url = None
        for tc in result["tool_calls"]:
            if tc["tool"] == "create_pr":
                import json as _json
                try:
                    out = _json.loads(tc["output"])
                    pr_url = out.get("data", {}).get("html_url")
                except Exception:
                    pass

        return {
            "success": True,
            "summary": result["text"],
            "pr_url": pr_url,
            "tool_calls": result["tool_calls"],
            "usage": result["usage"],
        }

    @classmethod
    def format_chat(cls, result: dict) -> str:
        pr_url = result.get("pr_url")
        summary = result.get("summary", "")
        if pr_url:
            return f"Pull request created: {pr_url}"
        return summary
