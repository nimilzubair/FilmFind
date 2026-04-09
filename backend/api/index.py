from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from backend.app.main import app as fastapi_app


class ApiPrefixStrippingApp:
    """ASGI adapter that accepts both /path and /api/path requests."""

    def __init__(self, target_app: Callable[[dict[str, Any], Callable[[], Awaitable[dict[str, Any]]], Callable[[dict[str, Any]], Awaitable[None]]], Awaitable[None]]):
        self._target_app = target_app

    async def __call__(
        self,
        scope: dict[str, Any],
        receive: Callable[[], Awaitable[dict[str, Any]]],
        send: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        if scope.get("type") == "http":
            path = str(scope.get("path") or "")
            if path == "/api" or path.startswith("/api/"):
                rewritten_scope = dict(scope)
                stripped = path[4:]
                rewritten_scope["path"] = stripped if stripped else "/"
                await self._target_app(rewritten_scope, receive, send)
                return

        await self._target_app(scope, receive, send)


app = ApiPrefixStrippingApp(fastapi_app)