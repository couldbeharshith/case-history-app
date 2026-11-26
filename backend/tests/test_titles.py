from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch

from openai import OpenAIError

from src.titles import generate_case_title


class TitleTests(TestCase):
    def test_generated_title_uses_luna_and_removes_markdown(self):
        client = Mock()
        parse = client.with_options.return_value.responses.parse
        parse.return_value = SimpleNamespace(
            output_parsed=SimpleNamespace(title="**Property Boundary Appeal**")
        )
        with patch("src.titles.get_openai_client", return_value=client):
            title = generate_case_title(
                "Details of a property appeal", "ABCD010012342024"
            )
        self.assertEqual(title, "Property Boundary Appeal")
        self.assertEqual(parse.call_args.kwargs["model"], "gpt-6-luna")

    def test_fallback_uses_case_type_after_provider_failure(self):
        with patch(
            "src.titles.get_openai_client", side_effect=OpenAIError("Unavailable")
        ):
            title = generate_case_title(
                "## Case Details\n- **Case Type:** SC - Sessions Case", "CNR123"
            )
            self.assertEqual(title, "Sessions Case")
            self.assertIsNone(
                generate_case_title("## Case Details\nNo case type", "CNR123")
            )
