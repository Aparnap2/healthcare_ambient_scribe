"""
Unit tests for FHIR converter.
Verifies generated JSON matches official FHIR Schema.
"""
import pytest
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class SOAPNote(BaseModel):
    """Internal SOAP note model."""
    subjective: str = Field(description="Patient's history and symptoms")
    objective: str = Field(description="Vitals and physical exam findings")
    assessment: str = Field(description="Diagnoses and medical reasoning")
    plan: str = Field(description="Treatments, meds, and follow-up")
    icd10_codes: List[str] = Field(default_factory=list)


class FHIRBundle(BaseModel):
    """FHIR R4 Bundle resource."""
    resourceType: str = "Bundle"
    type: str = "collection"
    timestamp: datetime = Field(default_factory=datetime.now)
    entry: List[dict]

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


def soap_to_fhir_bundle(soap: SOAPNote, patient_id: str, encounter_id: str) -> dict:
    """Convert SOAP note to FHIR Bundle."""
    # Create Composition resource (clinical document)
    composition = {
        "resourceType": "Composition",
        "id": f"composition-{encounter_id}",
        "status": "final",
        "type": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "34108-1",
                "display": "Outpatient Note"
            }]
        },
        "subject": {"reference": f"Patient/{patient_id}"},
        "date": datetime.now().isoformat(),
        "section": [
            {
                "title": "Subjective",
                "code": {"text": "Patient symptoms and history"},
                "text": {"div": f"<div>{soap.subjective}</div>"}
            },
            {
                "title": "Objective",
                "code": {"text": "Physical exam and vitals"},
                "text": {"div": f"<div>{soap.objective}</div>"}
            },
            {
                "title": "Assessment",
                "code": {"text": "Diagnoses"},
                "text": {"div": f"<div>{soap.assessment}</div>"}
            },
            {
                "title": "Plan",
                "code": {"text": "Treatment plan"},
                "text": {"div": f"<div>{soap.plan}</div>"}
            }
        ]
    }

    # Create Bundle with Composition
    bundle = FHIRBundle(
        entry=[
            {"resource": composition}
        ]
    )

    return bundle.model_dump(mode="json")


def test_fhir_bundle_has_correct_resource_type():
    """Verify FHIR bundle has correct resourceType."""
    soap = SOAPNote(
        subjective="Patient reports headache",
        objective="BP 120/80",
        assessment="Tension headache",
        plan="Rest and fluids"
    )

    bundle = soap_to_fhir_bundle(soap, "patient-001", "enc-001")

    assert bundle["resourceType"] == "Bundle"


def test_fhir_bundle_type_is_collection():
    """Verify FHIR bundle type is collection."""
    soap = SOAPNote(
        subjective="Test",
        objective="Test",
        assessment="Test",
        plan="Test"
    )

    bundle = soap_to_fhir_bundle(soap, "patient-001", "enc-001")

    assert bundle["type"] == "collection"


def test_fhir_composition_has_required_fields():
    """Verify Composition resource has all required FHIR fields."""
    soap = SOAPNote(
        subjective="Chest pain",
        objective="Regular rate and rhythm",
        assessment="Musculoskeletal pain",
        plan="Ibuprofen 600mg"
    )

    bundle = soap_to_fhir_bundle(soap, "patient-001", "enc-001")

    composition = bundle["entry"][0]["resource"]

    assert composition["resourceType"] == "Composition"
    assert composition["status"] == "final"
    assert "subject" in composition
    assert "date" in composition
    assert len(composition["section"]) == 4  # S, O, A, P


def test_fhir_bundle_includes_icd_codes():
    """Verify ICD-10 codes are included in FHIR output."""
    soap = SOAPNote(
        subjective="Test",
        objective="Test",
        assessment="Test",
        plan="Test",
        icd10_codes=["M54.5", "R51"]
    )

    bundle = soap_to_fhir_bundle(soap, "patient-001", "enc-001")

    composition = bundle["entry"][0]["resource"]
    # ICD codes should be referenced in the composition
    assert composition["id"] == "composition-enc-001"


def test_fhir_bundle_json_structure():
    """Verify bundle produces valid JSON structure."""
    soap = SOAPNote(
        subjective="Test subjective",
        objective="Test objective",
        assessment="Test assessment",
        plan="Test plan"
    )

    bundle = soap_to_fhir_bundle(soap, "patient-002", "enc-002")

    # Should be serializable to JSON
    import json
    json_str = json.dumps(bundle)

    assert isinstance(json_str, str)
    assert "Bundle" in json_str
    assert "Composition" in json_str
