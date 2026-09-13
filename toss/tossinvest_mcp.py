from __future__ import annotations

import json
import os
import time
from typing import Any, Optional

import httpx
from mcp.server.fastmcp import FastMCP

BASE_URL = os.getenv("TOSSINVEST_BASE_URL", "https://openapi.tossinvest.com").rstrip("/")
TOKEN_URL = f"{BASE_URL}/oauth2/token"
DEFAULT_ACCOUNT = os.getenv("TOSSINVEST_ACCOUNT", "1")
CLIENT_ID_ENV = "TOSSINVEST_CLIENT_ID"
CLIENT_SECRET_ENV = "TOSSINVEST_CLIENT_SECRET"

mcp = FastMCP(
    name="tossinvest",
    instructions=(
        "Hermes MCP server for Toss Securities Open API. "
        "Use it for quotes and account/holdings lookups. "
        "Do not expose secrets in tool output."
    ),
)

_token_cache: dict[str, Any] = {"access_token": None, "expires_at": 0.0}


def _missing_creds() -> list[str]:
    missing = []
    if not os.getenv(CLIENT_ID_ENV):
        missing.append(CLIENT_ID_ENV)
    if not os.getenv(CLIENT_SECRET_ENV):
        missing.append(CLIENT_SECRET_ENV)
    return missing


def _client() -> httpx.Client:
    return httpx.Client(timeout=30.0)


def _get_token(force_refresh: bool = False) -> dict[str, Any]:
    missing = _missing_creds()
    if missing:
        raise RuntimeError(
            f"Missing required environment variables: {', '.join(missing)}"
        )

    now = time.time()
    if (
        not force_refresh
        and _token_cache.get("access_token")
        and now < float(_token_cache.get("expires_at", 0)) - 30
    ):
        return {
            "access_token": _token_cache["access_token"],
            "expires_at": _token_cache["expires_at"],
            "cached": True,
        }

    data = {
        "grant_type": "client_credentials",
        "client_id": os.environ[CLIENT_ID_ENV],
        "client_secret": os.environ[CLIENT_SECRET_ENV],
    }
    with _client() as client:
        resp = client.post(
            TOKEN_URL,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp.raise_for_status()
        payload = resp.json()

    access_token = payload.get("access_token")
    if not access_token:
        raise RuntimeError(f"Token response missing access_token: {payload}")

    expires_in = int(payload.get("expires_in", 3600))
    expires_at = now + expires_in
    _token_cache.update({"access_token": access_token, "expires_at": expires_at})
    return {
        "access_token": access_token,
        "expires_at": expires_at,
        "cached": False,
        "token_type": payload.get("token_type"),
        "scope": payload.get("scope"),
    }


def _auth_headers(include_account: bool = False, account: Optional[str] = None) -> dict[str, str]:
    token = _get_token()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    if include_account:
        headers["X-Tossinvest-Account"] = str(account or DEFAULT_ACCOUNT)
    return headers


def _request(method: str, path: str, *, params: dict[str, Any] | None = None, json_body: Any = None, include_account: bool = False, account: Optional[str] = None) -> dict[str, Any]:
    url = f"{BASE_URL}{path}"
    with _client() as client:
        resp = client.request(
            method.upper(),
            url,
            params=params,
            json=json_body,
            headers=_auth_headers(include_account=include_account, account=account),
        )
    try:
        payload = resp.json()
    except Exception:
        payload = {"text": resp.text}
    if resp.status_code >= 400:
        raise RuntimeError(
            json.dumps(
                {
                    "status_code": resp.status_code,
                    "url": url,
                    "response": payload,
                },
                ensure_ascii=False,
            )
        )
    return payload


@mcp.tool()
def health_check() -> dict[str, Any]:
    """Check whether Toss Securities credentials are configured and token fetch works."""
    missing = _missing_creds()
    result: dict[str, Any] = {
        "base_url": BASE_URL,
        "default_account": DEFAULT_ACCOUNT,
        "missing_env": missing,
        "configured": not missing,
    }
    if not missing:
        token = _get_token(force_refresh=False)
        result["token"] = {
            "cached": token["cached"],
            "expires_at": token["expires_at"],
        }
    return result


@mcp.tool()
def get_access_token(force_refresh: bool = False) -> dict[str, Any]:
    """Get or refresh an OAuth access token for Toss Securities Open API."""
    return _get_token(force_refresh=force_refresh)


@mcp.tool()
def get_quotes(symbols: str) -> dict[str, Any]:
    """Fetch quote or instrument data for one or more symbols (comma-separated)."""
    symbols = symbols.strip()
    if not symbols:
        raise ValueError("symbols cannot be empty")
    return _request("GET", "/api/v1/stocks", params={"symbols": symbols})


@mcp.tool()
def get_holdings(account: Optional[str] = None) -> dict[str, Any]:
    """Fetch holdings / account assets using the Tossinvest account header."""
    return _request(
        "GET",
        "/api/v1/holdings",
        include_account=True,
        account=account,
    )


@mcp.tool()
def raw_api(
    method: str,
    path: str,
    params_json: str = "{}",
    body_json: str = "{}",
    include_account: bool = False,
    account: Optional[str] = None,
) -> dict[str, Any]:
    """Low-level helper for documented Toss Securities endpoints.

    Use only for paths that are explicitly documented by Toss Securities.
    """
    path = path.strip()
    if not path.startswith("/"):
        raise ValueError("path must start with '/'")
    try:
        params = json.loads(params_json) if params_json else {}
        body = json.loads(body_json) if body_json else {}
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON: {exc}") from exc
    if method.upper() in {"GET", "DELETE"}:
        body = None
    return _request(
        method,
        path,
        params=params,
        json_body=body,
        include_account=include_account,
        account=account,
    )


if __name__ == "__main__":
    mcp.run("stdio")
