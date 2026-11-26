from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi import Path as RoutePath
from fastapi.responses import JSONResponse, StreamingResponse

from src.cases import Cases
from src.config import DATA_DIR
from src.conversations import ConversationStore
from src.errors import OperationError
from src.models import CHAT_ID_PATTERN, ChatRequest, ManualInput
from src.operations import Operations

ChatIdQuery = Annotated[str, Query(pattern=CHAT_ID_PATTERN)]
ChatIdPath = Annotated[str, RoutePath(pattern=CHAT_ID_PATTERN)]


def create_app(data_dir: Path = DATA_DIR, *, max_active: int = 4) -> FastAPI:
    store = ConversationStore(data_dir)
    operations = Operations(max_active)
    cases = Cases(store, operations)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        try:
            yield
        finally:
            operations.cancel_all()

    application = FastAPI(title="Case History API", lifespan=lifespan)

    @application.exception_handler(OperationError)
    async def operation_error(_: Request, error: OperationError) -> JSONResponse:
        return JSONResponse({"detail": str(error)}, status_code=error.status_code)

    @application.get("/case-summary")
    async def case_summary(
        cnr_num: Annotated[str, Query(min_length=1, max_length=128)],
        chat_id: ChatIdQuery,
        extract_fir: bool = True,
    ) -> StreamingResponse:
        cnr = cnr_num.strip().upper()
        if not cnr:
            raise HTTPException(status_code=422, detail="Enter a CNR number.")
        return cases.start_summary(chat_id, cnr, extract_fir)

    @application.post("/manual-input/{chat_id}")
    async def manual_input(chat_id: ChatIdPath, body: ManualInput) -> dict[str, bool]:
        operations.get(chat_id).submit_input(body.model_dump(exclude_none=True))
        return {"ok": True}

    @application.post("/chat")
    async def chat(body: ChatRequest) -> StreamingResponse:
        return await cases.start_followup(body.chat_id, body.question)

    @application.get("/all-ps")
    def get_all_ps() -> dict[str, list[str]]:
        try:
            return store.stations
        except FileNotFoundError:
            raise HTTPException(
                status_code=404, detail="Station catalog unavailable."
            ) from None

    return application


app = create_app()
