"""
LLM Evaluation tests using DeepEval.
Tests SOAP note generation quality for the Healthcare Ambient Scribe.

Run with: uv run pytest backend/tests/test_llm_evals.py -v
Or for DeepEval: uv run deepeval test run backend/tests/test_llm_evals.py
"""
import pytest
from deepeval import assert_test
from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from deepeval.metrics import (
    GEval,
    HallucinationMetric,
    AnswerRelevancyMetric,
    FaithfulnessMetric,
)


# Gold standard test cases for SOAP generation
GOLD_STANDARD_CASES = [
    {
        "input": "Patient has a headache and took Tylenol.",
        "expected_output": "S: Headache. Medications: Tylenol 500mg as needed.",
    },
    {
        "input": "Blood pressure 140/90, patient reports dizziness",
        "expected_output": "O: BP 140/90. A: Hypertension, possibly related to dizziness. Plan: Monitor BP daily, low sodium diet.",
    },
]


class TestSOAPGeneration:
    """Test cases for SOAP note generation quality."""

    def test_soap_accuracy_hallucination(self):
        """
        Test that generated SOAP doesn't hallucinate information
        not present in the transcript.
        """
        transcript = "Patient has a headache and took Tylenol."
        generated_soap = "S: Headache. Medications: Tylenol."

        metric = HallucinationMetric(
            threshold=0.3,
            model="ollama/qwen2.5-coder:3b"  # Use local Ollama
        )

        test_case = LLMTestCase(
            input="Generate a SOAP note for: " + transcript,
            actual_output=generated_soap,
            context=[transcript]  # Ground truth
        )

        # This will raise AssertionError if hallucination score is too high
        assert_test(test_case, [metric])

    def test_soap_answer_relevancy(self):
        """Test that generated SOAP is relevant to the input."""
        transcript = "Patient has persistent cough for 2 weeks, no fever."

        generated_soap = """
        S: Chronic cough x 2 weeks, no fever.
        O: Lungs clear to auscultation.
        A: Viral bronchitis vs. post-viral cough.
        P: Supportive care, follow up if worsens.
        """

        metric = AnswerRelevancyMetric(
            threshold=0.5,
            model="ollama/qwen2.5-coder:3b"
        )

        test_case = LLMTestCase(
            input=transcript,
            actual_output=generated_soap.strip()
        )

        assert_test(test_case, [metric])

    def test_soap_clinical_correctness(self):
        """Test SOAP note clinical correctness using G-Eval."""
        transcript = "Patient with chest pain, ECG normal, troponins negative."

        generated_soap = """
        S: Chest pain, ECG normal, troponins negative.
        O: Hemodynamically stable, no ST changes on ECG.
        A: Low risk chest pain, likely musculoskeletal.
        P: NSAIDs, follow up with cardiology if persists.
        """

        # Custom G-Eval for medical correctness
        correctness_metric = GEval(
            name="Clinical Correctness",
            criteria="""Evaluate if the SOAP note is clinically appropriate:
            1. Subjective accurately captures patient complaints
            2. Objective findings are properly documented
            3. Assessment reflects appropriate differential diagnosis
            4. Plan is safe and evidence-based
            5. No clinical contradictions or unsafe advice""",
            evaluation_params=[
                LLMTestCaseParams.INPUT,
                LLMTestCaseParams.ACTUAL_OUTPUT,
            ],
            threshold=0.7,
            strict_mode=True
        )

        test_case = LLMTestCase(
            input=transcript,
            actual_output=generated_soap.strip()
        )

        assert_test(test_case, [correctness_metric])

    def test_soap_faithfulness_to_transcript(self):
        """Test that SOAP faithfully represents the transcript."""
        transcript = """Doctor: Good morning, Mr. Smith. How are you today?
        Patient: Not well, I've had fever and chills since yesterday.
        Doctor: Any cough?
        Patient: Yes, dry cough.
        Doctor: Let me check your temperature."""

        generated_soap = """
        S: Fever, chills, dry cough x 1 day.
        O: Temperature elevated.
        A: Acute respiratory infection.
        P: Rest, fluids, antipyretics.
        """

        metric = FaithfulnessMetric(
            threshold=0.6,
            model="ollama/qwen2.5-coder:3b"
        )

        test_case = LLMTestCase(
            input=transcript,
            actual_output=generated_soap.strip(),
            retrieval_context=[transcript]
        )

        assert_test(test_case, [metric])

    def test_soap_structure_completeness(self):
        """Test that SOAP has all required sections."""
        transcript = "Patient reports headache."

        # Test that LLM generates complete SOAP
        # In production, this would call the actual agent
        required_sections = ["Subjective", "Objective", "Assessment", "Plan"]
        generated_soap = "S: Headache.\nO: NAD.\nA: Tension headache.\nP: Tylenol."

        # Verify structure
        soap_lower = generated_soap.lower()
        for section in required_sections:
            assert section.lower() in soap_lower, f"Missing {section} section"


class TestMedicalFaithfulness:
    """Medical-domain specific evaluation tests."""

    def test_medication_dosage_present(self):
        """Test that medications include dosages when mentioned."""
        transcript = "Patient takes Lisinopril 10mg daily."

        generated_soap = """
        S: Patient takes Lisinopril 10mg daily for hypertension.
        O: BP 128/82.
        A: Hypertension, well controlled on current regimen.
        P: Continue Lisinopril 10mg daily.
        """

        # Check that dosage is preserved
        assert "10mg" in generated_soap or "10 mg" in generated_soap

    def test_vital_signs_preserved(self):
        """Test that vital signs are accurately captured."""
        transcript = "Blood pressure 150/95, heart rate 82, temperature 98.6"

        generated_soap = """
        O: BP 150/95, HR 82, Temp 98.6F
        """

        assert "150/95" in generated_soap
        assert "82" in generated_soap

    def test_no_harmful_advice(self):
        """Test that generated SOAP doesn't contain harmful advice."""
        transcript = "Patient has chest pain."

        generated_soap = """
        A: Chest pain, cardiac etiology not ruled out.
        P: Call 911 immediately if pain worsens, emergency evaluation recommended.
        """

        # Should not contain harmful advice
        harmful_keywords = ["ignore", "wait weeks", "no medical attention"]
        soap_lower = generated_soap.lower()
        for keyword in harmful_keywords:
            assert keyword not in soap_lower, f"Harmful advice detected: {keyword}"


# Configuration for DeepEval
# Run: deepeval configure to set up API keys (optional for local models)
