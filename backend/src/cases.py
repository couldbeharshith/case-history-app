import asyncio
from collections.abc import Iterable
from contextlib import closing

from fastapi.responses import StreamingResponse

from src.conversations import Conversation, ConversationStore, Message
from src.errors import OperationError
from src.llm import stream_followup, stream_summary, upload_fir_file
from src.operations import Operation, Operations
from src.scraper import scrape_case_data_interactive


class Cases:
    def __init__(self, store: ConversationStore, operations: Operations) -> None:
        self.store = store
        self.operations = operations

    def start_summary(
        self, chat_id: str, cnr_num: str, extract_fir: bool
    ) -> StreamingResponse:
        operation = self.operations.reserve(chat_id)
        return self.operations.start(
            operation, lambda: self._generate_summary(operation, cnr_num, extract_fir)
        )

    async def start_followup(self, chat_id: str, question: str) -> StreamingResponse:
        operation = self.operations.reserve(chat_id)
        try:
            conversation = await asyncio.to_thread(self.store.read, chat_id)
            if conversation is None:
                raise OperationError(
                    "No summary found for this chat. Generate the summary first."
                )
        except BaseException:
            self.operations.release(operation)
            raise
        return self.operations.start(
            operation,
            lambda: self._generate_followup(operation, conversation, question),
        )

    def _generate_summary(
        self, operation: Operation, cnr_num: str, extract_fir: bool
    ) -> None:
        records = scrape_case_data_interactive(
            cnr_num,
            operation.publish,
            operation.request_input,
            extract_fir=extract_fir,
        )
        operation.ensure_connected()
        fir_url = records["fir_file_url"]
        file_id = upload_fir_file(fir_url) if fir_url else None
        if fir_url and file_id is None:
            operation.progress("FIR not available — generating summary without it")

        operation.progress("Generating case summary")
        with closing(
            stream_summary(records["overview_img_b64"], records["history"], file_id)
        ) as chunks:
            summary = self._stream_text(operation, chunks)
        operation.ensure_connected()
        self.store.write(
            operation.chat_id,
            Conversation(
                cnr_num=cnr_num,
                extract_fir=extract_fir,
                fir_file_url=fir_url,
                summary=summary,
                overview_img_b64=records["overview_img_b64"],
            ),
        )

    def _generate_followup(
        self, operation: Operation, conversation: Conversation, question: str
    ) -> None:
        file_id = (
            upload_fir_file(conversation.fir_file_url)
            if conversation.fir_file_url
            else None
        )
        messages = [*conversation.messages, Message(role="user", content=question)]
        with closing(
            stream_followup(
                conversation.summary,
                [message.model_dump() for message in messages],
                conversation.overview_img_b64 or "",
                file_id,
            )
        ) as chunks:
            answer = self._stream_text(operation, chunks)
        operation.ensure_connected()
        conversation.messages = [*messages, Message(role="assistant", content=answer)]
        self.store.write(operation.chat_id, conversation)

    @staticmethod
    def _stream_text(operation: Operation, chunks: Iterable[str]) -> str:
        parts: list[str] = []
        for chunk in chunks:
            operation.text(chunk)
            parts.append(chunk)
        result = "".join(parts)
        if not result.strip():
            raise OperationError("CaseFlow received an empty response. Try again.")
        return result
