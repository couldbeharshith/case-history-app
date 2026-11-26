import asyncio
import base64
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from api import create_app
from src.conversations import ConversationStore
from src.errors import OperationError
from src.operations import Operations


def case_records(cnr, publish, request_input, *, extract_fir):
    return {"overview_img_b64": "aW1hZ2U=", "history": [], "fir_file_url": None}


def events(response):
    return [
        json.loads(frame[6:])
        for frame in response.text.split("\n\n")
        if frame.startswith("data: ")
    ]


class CaseApiTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.data_dir = Path(temporary.name)
        self.client = self.enterContext(TestClient(create_app(self.data_dir)))
        self.store = ConversationStore(self.data_dir)
        self.name_case = self.enterContext(
            patch(
                "src.cases.generate_case_title", return_value="Example property appeal"
            )
        )

    def test_summary_and_followup_save_complete_turns(self):
        with (
            patch("src.cases.scrape_case_data_interactive", case_records),
            patch(
                "src.cases.stream_summary",
                side_effect=lambda *args: (chunk for chunk in ["Case ", "summary"]),
            ),
        ):
            response = self.client.get(
                "/case-summary", params={"cnr_num": " abc123 ", "chat_id": "case-1"}
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(events(response)[-1]["type"], "complete")
        self.assertEqual(
            events(response)[-1]["metadata"], {"title": "Example property appeal"}
        )
        self.name_case.assert_called_once_with("Case summary", "ABC123")

        with patch(
            "src.cases.stream_followup",
            side_effect=lambda *args: (chunk for chunk in ["The next hearing"]),
        ):
            response = self.client.post(
                "/chat", json={"chat_id": "case-1", "question": "When?"}
            )
        self.assertEqual(events(response)[-1]["type"], "complete")
        conversation = self.store.read("case-1")
        self.assertEqual(conversation.cnr_num, "ABC123")
        self.assertEqual(conversation.summary, "Case summary")
        self.assertEqual(conversation.title, "Example property appeal")
        self.assertEqual(
            [message.content for message in conversation.messages],
            ["When?", "The next hearing"],
        )

    def test_incomplete_lookup_keeps_previous_summary(self):
        def interrupted(*args):
            yield "Partial"
            raise RuntimeError("Untrusted upstream diagnostic")

        with (
            patch("src.cases.scrape_case_data_interactive", case_records),
            patch(
                "src.cases.stream_summary",
                side_effect=lambda *args: (chunk for chunk in ["Original summary"]),
            ),
        ):
            self.client.get(
                "/case-summary", params={"cnr_num": "ABC123", "chat_id": "case-1"}
            )

        with (
            patch("src.cases.scrape_case_data_interactive", case_records),
            patch("src.cases.stream_summary", interrupted),
            self.assertLogs("src.operations", level="ERROR"),
        ):
            response = self.client.get(
                "/case-summary", params={"cnr_num": "ABC123", "chat_id": "case-1"}
            )

        self.assertEqual(
            [event["type"] for event in events(response)],
            ["summary_log", "text_chunk", "summary_log"],
        )
        self.assertNotIn("Untrusted upstream diagnostic", response.text)
        self.assertEqual(self.store.read("case-1").summary, "Original summary")

    def test_legacy_overview_file_still_supports_followups(self):
        folder = self.data_dir / "legacy-case"
        folder.mkdir()
        (folder / "case_overview.png").write_bytes(b"older image")
        (folder / "conv_history.json").write_text(
            json.dumps(
                {
                    "cnr_num": "LEGACY123",
                    "summary": "An existing summary",
                    "messages": [],
                }
            ),
            encoding="utf-8",
        )
        with patch(
            "src.cases.stream_followup",
            side_effect=lambda *args: (chunk for chunk in ["Answer"]),
        ) as followup:
            response = self.client.post(
                "/chat", json={"chat_id": "legacy-case", "question": "When?"}
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            followup.call_args.args[2], base64.b64encode(b"older image").decode("ascii")
        )

    def test_missing_summary_and_invalid_chat_ids(self):
        self.assertEqual(
            self.client.post(
                "/chat", json={"chat_id": "missing", "question": "When?"}
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.get(
                "/case-summary", params={"chat_id": "../elsewhere", "cnr_num": "ABC123"}
            ).status_code,
            422,
        )


class OperationTests(unittest.IsolatedAsyncioTestCase):
    async def test_disconnect_unblocks_manual_input_and_releases_capacity(self):
        operations = Operations(max_active=1)
        operation = operations.reserve("one")
        response = operations.start(
            operation,
            lambda: operation.request_input(
                {"type": "district_ps", "police_station": "Example"}
            ),
        )
        stream = response.body_iterator
        await asyncio.wait_for(anext(stream), 2)

        with self.assertRaises(OperationError) as duplicate:
            operations.reserve("one")
        self.assertEqual(duplicate.exception.status_code, 409)
        with self.assertRaises(OperationError) as capacity:
            operations.reserve("two")
        self.assertEqual(capacity.exception.status_code, 503)
        with self.assertRaises(OperationError) as wrong_input:
            operation.submit_input({"captcha_text": "sample"})
        self.assertEqual(wrong_input.exception.status_code, 422)

        await stream.aclose()

        async def wait_for_release():
            while True:
                try:
                    operations.get(operation.chat_id)
                except OperationError:
                    return
                await asyncio.sleep(0.01)

        await asyncio.wait_for(wait_for_release(), 2)
        operations.release(operations.reserve("two"))


if __name__ == "__main__":
    unittest.main()
