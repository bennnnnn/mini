"""GitHub integration tools — branch, commit, PR management.

All GitHub operations use the user's encrypted OAuth token.
Destructive operations (force push, repo deletion) are BLOCKED.
"""

import base64
from typing import Any, Dict, Optional

import httpx

from app.core.security import decrypt_token
from app.tools.base import Tool

GITHUB_API = "https://api.github.com"


def _github_headers(encrypted_token: str) -> Dict[str, str]:
    token = decrypt_token(encrypted_token)
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def _gh_request(
    method: str,
    path: str,
    encrypted_token: str,
    json_body: Optional[Dict] = None,
) -> Dict[str, Any]:
    """Make an authenticated GitHub API request."""
    headers = _github_headers(encrypted_token)
    async with httpx.AsyncClient(timeout=30) as client:
        if method == "GET":
            resp = await client.get(f"{GITHUB_API}{path}", headers=headers)
        elif method == "POST":
            resp = await client.post(f"{GITHUB_API}{path}", headers=headers, json=json_body)
        elif method == "PATCH":
            resp = await client.patch(f"{GITHUB_API}{path}", headers=headers, json=json_body)
        else:
            return {"success": False, "error": f"Unsupported method: {method}"}

        if resp.status_code >= 400:
            return {"success": False, "error": f"GitHub API error ({resp.status_code}): {resp.text[:500]}"}

        return {"success": True, "data": resp.json() if resp.text else {}}


class CreateBranchTool(Tool):
    name = "create_branch"
    description = "Create a new branch in a GitHub repository."
    input_schema = {
        "type": "object",
        "properties": {
            "repo": {"type": "string", "description": "Repository name (owner/repo)"},
            "branch": {"type": "string", "description": "New branch name"},
            "base_branch": {"type": "string", "description": "Base branch (default: main)", "default": "main"},
        },
        "required": ["repo", "branch"],
    }

    def __init__(self, encrypted_token: str):
        self.encrypted_token = encrypted_token

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        repo = input["repo"]
        branch = input["branch"]
        base = input.get("base_branch", "main")

        # Get SHA of base branch
        ref_resp = await _gh_request("GET", f"/repos/{repo}/git/ref/heads/{base}", self.encrypted_token)
        if not ref_resp["success"]:
            return ref_resp

        sha = ref_resp["data"]["object"]["sha"]

        # Create new branch
        return await _gh_request(
            "POST",
            f"/repos/{repo}/git/refs",
            self.encrypted_token,
            json_body={"ref": f"refs/heads/{branch}", "sha": sha},
        )


class CommitChangesTool(Tool):
    name = "commit_changes"
    description = "Commit file changes to a branch via GitHub API."
    input_schema = {
        "type": "object",
        "properties": {
            "repo": {"type": "string", "description": "Repository name (owner/repo)"},
            "branch": {"type": "string", "description": "Branch name"},
            "message": {"type": "string", "description": "Commit message"},
            "files": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "content": {"type": "string"},
                    },
                },
                "description": "Files to commit",
            },
        },
        "required": ["repo", "branch", "message", "files"],
    }

    def __init__(self, encrypted_token: str):
        self.encrypted_token = encrypted_token

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        repo = input["repo"]
        branch = input["branch"]
        message = input["message"]
        files = input["files"]

        # Build the tree
        tree_items = []
        for f in files:
            content_b64 = base64.b64encode(f["content"].encode()).decode()
            # Create blob
            blob_resp = await _gh_request(
                "POST",
                f"/repos/{repo}/git/blobs",
                self.encrypted_token,
                json_body={"content": f["content"], "encoding": "utf-8"},
            )
            if not blob_resp["success"]:
                return blob_resp
            tree_items.append({
                "path": f["path"],
                "mode": "100644",
                "type": "blob",
                "sha": blob_resp["data"]["sha"],
            })

        # Get base tree SHA
        ref_resp = await _gh_request("GET", f"/repos/{repo}/git/ref/heads/{branch}", self.encrypted_token)
        if not ref_resp["success"]:
            base_tree_sha = None
        else:
            commit_resp = await _gh_request("GET", f"/repos/{repo}/git/commits/{ref_resp['data']['object']['sha']}", self.encrypted_token)
            base_tree_sha = commit_resp["data"]["tree"]["sha"] if commit_resp["success"] else None

        # Create tree
        tree_body = {"tree": tree_items}
        if base_tree_sha:
            tree_body["base_tree"] = base_tree_sha

        tree_resp = await _gh_request("POST", f"/repos/{repo}/git/trees", self.encrypted_token, json_body=tree_body)
        if not tree_resp["success"]:
            return tree_resp

        # Create commit
        commit_body = {
            "message": message,
            "tree": tree_resp["data"]["sha"],
        }
        if ref_resp["success"]:
            commit_body["parents"] = [ref_resp["data"]["object"]["sha"]]

        commit_resp = await _gh_request(
            "POST", f"/repos/{repo}/git/commits", self.encrypted_token, json_body=commit_body
        )
        if not commit_resp["success"]:
            return commit_resp

        # Update ref
        return await _gh_request(
            "PATCH",
            f"/repos/{repo}/git/refs/heads/{branch}",
            self.encrypted_token,
            json_body={"sha": commit_resp["data"]["sha"], "force": False},  # NEVER force push
        )


class CreatePRTool(Tool):
    name = "create_pr"
    description = "Create a pull request on GitHub."
    input_schema = {
        "type": "object",
        "properties": {
            "repo": {"type": "string", "description": "Repository name (owner/repo)"},
            "title": {"type": "string", "description": "PR title"},
            "head": {"type": "string", "description": "Head branch"},
            "base": {"type": "string", "description": "Base branch (default: main)", "default": "main"},
            "body": {"type": "string", "description": "PR description", "default": ""},
        },
        "required": ["repo", "title", "head"],
    }

    def __init__(self, encrypted_token: str):
        self.encrypted_token = encrypted_token

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        return await _gh_request(
            "POST",
            f"/repos/{input['repo']}/pulls",
            self.encrypted_token,
            json_body={
                "title": input["title"],
                "head": input["head"],
                "base": input.get("base", "main"),
                "body": input.get("body", ""),
            },
        )


class ListPRsTool(Tool):
    name = "list_prs"
    description = "List pull requests in a repository."
    input_schema = {
        "type": "object",
        "properties": {
            "repo": {"type": "string", "description": "Repository name (owner/repo)"},
            "state": {"type": "string", "description": "open | closed | all", "default": "open"},
        },
        "required": ["repo"],
    }

    def __init__(self, encrypted_token: str):
        self.encrypted_token = encrypted_token

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        state = input.get("state", "open")
        return await _gh_request("GET", f"/repos/{input['repo']}/pulls?state={state}", self.encrypted_token)


class MergePRTool(Tool):
    name = "merge_pr"
    description = "Merge a pull request. BLOCKED for production branches."
    input_schema = {
        "type": "object",
        "properties": {
            "repo": {"type": "string", "description": "Repository name (owner/repo)"},
            "pr_number": {"type": "integer", "description": "PR number"},
        },
        "required": ["repo", "pr_number"],
    }

    def __init__(self, encrypted_token: str):
        self.encrypted_token = encrypted_token

    async def execute(self, input: Dict[str, Any]) -> Dict[str, Any]:
        # Check base branch — block production merges
        pr_resp = await _gh_request(
            "GET", f"/repos/{input['repo']}/pulls/{input['pr_number']}", self.encrypted_token
        )
        if pr_resp["success"]:
            base = pr_resp["data"].get("base", {}).get("ref", "")
            if base in ("main", "master", "production"):
                return {"success": False, "error": f"Direct merge to '{base}' is blocked. Use PR approval workflow."}

        return await _gh_request(
            "PUT",
            f"/repos/{input['repo']}/pulls/{input['pr_number']}/merge",
            self.encrypted_token,
        )
