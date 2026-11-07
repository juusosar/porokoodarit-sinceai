from __future__ import annotations

from collections.abc import Iterator
from typing import Protocol


class TTSError(Exception):
    pass


class TTSProvider(Protocol):
    name: str
    model: str
    voice: str
    media_type: str

    def available(self) -> bool: ...

    def stream(self, text: str) -> Iterator[bytes]:
        """Audio bytes for `text`, chunk by chunk. Raises TTSError before the first chunk on failure."""
        ...
