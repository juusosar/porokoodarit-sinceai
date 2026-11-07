"""Per-client sliding-window limiter, shared by /v1/explain and /v1/speak."""

import threading
import time
from collections import defaultdict, deque

from fastapi import Request


class RateLimiter:
    """Sliding 60 s window per client key. In memory, per instance (fine for the MVP / one Cloud Run instance)."""

    def __init__(self, per_min: int):
        self.per_min = per_min
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= self.per_min:
                return False
            q.append(now)
            if len(self._hits) > 10_000:  # bound memory
                self._hits = defaultdict(deque, {k: v for k, v in self._hits.items() if v})
            return True


def client_key(request: Request) -> str:
    # rightmost XFF entry is the one our proxy (Cloud Run front end) added; leftmost is client-controlled
    return request.headers.get("x-forwarded-for", "").split(",")[-1].strip() or (
        request.client.host if request.client else "?"
    )
