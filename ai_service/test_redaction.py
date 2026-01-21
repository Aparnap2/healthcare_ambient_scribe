"""
Unit tests for PII redaction in AI service
"""
import pytest
import re


# PII Patterns for redaction
PII_PATTERNS = {
    "NAME": r'\b[A-Z][a-z]+\s+[A-Z][a-z]+\b',
    "PHONE": r'\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b',
    "EMAIL": r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
    "SSN": r'\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b',
    "DATE": r'\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})\b',
    "MRN": r'\b(MRN|mrn)[-:#]?\s*\d+\b',
}


def redact_pii(text: str) -> tuple[str, dict]:
    """Redact PII from text and return redacted text with entities found."""
    text = text
    entities_found = {}

    for pii_type, pattern in PII_PATTERNS.items():
        matches = re.findall(pattern, text)
        if matches:
            entities_found[pii_type] = len(matches)
            text = re.sub(pattern, f"[{pii_type}]", text)

    return text, entities_found


class TestPIIRedaction:
    """Test cases for PII redaction."""

    def test_phone_redaction(self):
        """Test that phone numbers are redacted."""
        input_text = "Call me at 555-123-4567 or 555.987.6543"
        redacted, entities = redact_pii(input_text)

        assert "[PHONE]" in redacted
        assert entities["PHONE"] == 2

    def test_email_redaction(self):
        """Test that emails are redacted."""
        input_text = "Contact patient at john.doe@email.com"
        redacted, entities = redact_pii(input_text)

        assert "[EMAIL]" in redacted
        assert entities["EMAIL"] == 1

    def test_ssn_redaction(self):
        """Test that SSN is redacted."""
        input_text = "SSN is 123-45-6789"
        redacted, entities = redact_pii(input_text)

        assert "[SSN]" in redacted
        assert entities["SSN"] == 1

    def test_date_redaction(self):
        """Test that dates are redacted."""
        input_text = "Appointment on 03/15/2024 or 2024-01-15"
        redacted, entities = redact_pii(input_text)

        assert "[DATE]" in redacted
        assert entities["DATE"] == 2

    def test_mrn_redaction(self):
        """Test that MRN is redacted."""
        input_text = "Patient MRN: 12345 or mrn-67890"
        redacted, entities = redact_pii(input_text)

        assert "[MRN]" in redacted
        assert entities["MRN"] == 2

    def test_name_redaction(self):
        """Test that full names are redacted."""
        input_text = "Patient John Smith met with Dr. Jane Doe"
        redacted, entities = redact_pii(input_text)

        assert "[NAME]" in redacted
        assert entities["NAME"] == 2

    def test_multiple_pii_types(self):
        """Test redaction of multiple PII types."""
        input_text = "John Smith (DOB: 03/15/1965) called from 555-123-4567"
        redacted, entities = redact_pii(input_text)

        assert "[NAME]" in redacted
        assert "[DATE]" in redacted
        assert "[PHONE]" in redacted

    def test_no_pii_unchanged(self):
        """Test that text without PII remains unchanged."""
        input_text = "Patient reports persistent headache for 3 days"
        redacted, entities = redact_pii(input_text)

        assert redacted == input_text
        assert entities == {}

    def test_clinical_text_preserved(self):
        """Test that clinical terminology is preserved."""
        input_text = "Blood pressure 120/80, heart rate 72, respiratory rate 16"
        redacted, entities = redact_pii(input_text)

        # Vitals should remain
        assert "120/80" in redacted
        assert "heart rate" in redacted

    def test_empty_input(self):
        """Test empty string handling."""
        redacted, entities = redact_pii("")

        assert redacted == ""
        assert entities == {}

    def test_redaction_preserves_structure(self):
        """Test that redaction preserves text structure."""
        input_text = "Patient: John Smith\nDate: 01/15/2024\nPhone: 555-123-4567"
        redacted, entities = redact_pii(input_text)

        # Newlines should be preserved
        assert "\n" in redacted
        # All PII should be redacted
        assert "[NAME]" in redacted
        assert "[DATE]" in redacted
        assert "[PHONE]" in redacted


class TestPIIPatternCoverage:
    """Test that PII patterns cover common formats."""

    def test_phone_variations(self):
        """Test various phone number formats."""
        phones = [
            "555-123-4567",
            "(555) 123-4567",
            "555.123.4567",
            "555 123 4567",
            "+1 555-123-4567",
        ]

        for phone in phones:
            redacted, entities = redact_pii(phone)
            assert "[PHONE]" in redacted, f"Failed to redact: {phone}"

    def test_email_variations(self):
        """Test various email formats."""
        emails = [
            "test@example.com",
            "user.name@domain.org",
            "user+tag@sub.domain.co.uk",
        ]

        for email in emails:
            redacted, entities = redact_pii(email)
            assert "[EMAIL]" in redacted, f"Failed to redact: {email}"

    def test_ssn_variations(self):
        """Test various SSN formats."""
        ssns = [
            "123-45-6789",
            "123 45 6789",
            "123456789",
        ]

        for ssn in ssns:
            redacted, entities = redact_pii(ssn)
            assert "[SSN]" in redacted, f"Failed to redact: {ssn}"
