import asyncio
import threading
from collections.abc import AsyncIterator, Callable
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass
from queue import Empty, Queue
from time import monotonic

from fastapi.responses import StreamingResponse

from src.config import get_logger
from src.errors import ClientDisconnected, InputExpired, OperationError
from src.models import SSEvent, SSEventType

logger = get_logger(__name__)
INPUT_TIMEOUT = 120
HEARTBEAT_INTERVAL = 15


@dataclass
class InputPrompt:
    fields: frozenset[str]
    answer: Queue[dict[str, str]]


class Operation:
    def __init__(self, chat_id: str) -> None:
        self.chat_id = chat_id
        self.loop = asyncio.get_running_loop()
        self.events: asyncio.Queue[SSEvent | None] = asyncio.Queue(maxsize=64)
        self.disconnected = threading.Event()
        self._input_lock = threading.Lock()
        self._prompt: InputPrompt | None = None

    def ensure_connected(self) -> None:
        if self.disconnected.is_set():
            raise ClientDisconnected

    def publish(self, event: SSEvent | None) -> None:
        self.ensure_connected()
        delivery = asyncio.run_coroutine_threadsafe(self.events.put(event), self.loop)
        try:
            while True:
                self.ensure_connected()
                try:
                    delivery.result(timeout=0.25)
                    return
                except FutureTimeout:
                    continue
        finally:
            if not delivery.done():
                delivery.cancel()

    def progress(self, content: str) -> None:
        self.publish(SSEvent(type=SSEventType.SUMMARY_LOG, content=content))

    def text(self, content: str) -> None:
        self.publish(SSEvent(type=SSEventType.TEXT_CHUNK, content=content))

    def request_input(self, metadata: dict[str, str]) -> dict[str, str]:
        fields = frozenset(
            {"captcha_text"}
            if metadata["type"] == "solve_captcha"
            else {"district", "ps"}
        )
        prompt = InputPrompt(fields=fields, answer=Queue(maxsize=1))
        with self._input_lock:
            self._prompt = prompt

        try:
            self.publish(
                SSEvent(
                    type=SSEventType.MANUAL_INPUT_REQUEST,
                    content=None,
                    metadata=metadata,
                )
            )
            deadline = monotonic() + INPUT_TIMEOUT
            while monotonic() < deadline:
                self.ensure_connected()
                try:
                    return prompt.answer.get(timeout=0.25)
                except Empty:
                    continue
            raise InputExpired
        finally:
            with self._input_lock:
                self._prompt = None

    def submit_input(self, values: dict[str, str]) -> None:
        with self._input_lock:
            prompt = self._prompt
            if self.disconnected.is_set() or prompt is None:
                raise OperationError("This lookup is not waiting for input.", 409)
            if values.keys() != prompt.fields:
                raise OperationError("Send the fields requested for this lookup.", 422)
            prompt.answer.put_nowait(values)
            self._prompt = None

    async def _frames(self) -> AsyncIterator[str]:
        try:
            while True:
                try:
                    event = await asyncio.wait_for(
                        self.events.get(), HEARTBEAT_INTERVAL
                    )
                except TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                if event is None:
                    return
                yield f"data: {event.model_dump_json()}\n\n"
        finally:
            self.disconnected.set()

    def response(self) -> StreamingResponse:
        return StreamingResponse(
            self._frames(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "X-CaseFlow-Stream": "2",
            },
        )


class Operations:
    def __init__(self, max_active: int) -> None:
        self._max_active = max_active
        self._active: dict[str, Operation] = {}
        self._lock = threading.Lock()

    def reserve(self, chat_id: str) -> Operation:
        with self._lock:
            if chat_id in self._active:
                raise OperationError(
                    "This chat already has a request in progress.", 409
                )
            if len(self._active) >= self._max_active:
                raise OperationError("CaseFlow is busy. Try again in a moment.", 503)
            operation = Operation(chat_id)
            self._active[chat_id] = operation
            return operation

    def release(self, operation: Operation) -> None:
        with self._lock:
            if self._active.get(operation.chat_id) is operation:
                del self._active[operation.chat_id]

    def get(self, chat_id: str) -> Operation:
        with self._lock:
            operation = self._active.get(chat_id)
        if operation is None:
            raise OperationError("No active session for this chat.", 404)
        return operation

    def cancel_all(self) -> None:
        with self._lock:
            for operation in self._active.values():
                operation.disconnected.set()

    def start(
        self, operation: Operation, work: Callable[[], None]
    ) -> StreamingResponse:
        def run() -> None:
            error = None
            try:
                work()
                operation.publish(SSEvent(type=SSEventType.COMPLETE, content=None))
            except ClientDisconnected:
                return
            except OperationError as exc:
                error = str(exc)
            except Exception:
                logger.exception("Case operation failed for chat %s", operation.chat_id)
                error = "CaseFlow couldn’t finish this request. Try again."
            finally:
                self.release(operation)
                try:
                    if error:
                        operation.progress(f"Error: {error}")
                    operation.publish(None)
                except ClientDisconnected:
                    pass

        thread = threading.Thread(target=run, daemon=True, name="caseflow-operation")
        try:
            thread.start()
        except Exception:
            self.release(operation)
            raise
        return operation.response()
