#!/usr/bin/env python3
"""
Seed script for demo data.
Populates the database with sample encounters in different states.

Usage:
    python seed.py [--reset]
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Demo data for encounters
DEMO_CLINICIAN = {
    "id": "dr-house",
    "name": "Dr. Gregory House",
    "specialty": "Internal Medicine"
}

DEMO_PATIENTS = [
    {
        "id": "patient-001",
        "name": "John Smith",
        "dob": "1965-03-15",
        "mrn": "MRN-12345"
    },
    {
        "id": "patient-002",
        "name": "Jane Doe",
        "dob": "1978-07-22",
        "mrn": "MRN-67890"
    },
    {
        "id": "patient-003",
        "name": "Robert Johnson",
        "dob": "1952-11-08",
        "mrn": "MRN-11111"
    }
]

DEMO_ENCOUNTERS = [
    {
        "status": "signed",
        "patient_id": "patient-001",
        "transcript": """
Doctor: Good morning, Mr. Smith. How are you feeling today?
Patient: Not great, doc. I've had this persistent cough for about two weeks now.
Doctor: Two weeks. Any other symptoms?
Patient: Yeah, I've been really tired and I get short of breath when I climb stairs.
Doctor: Let me listen to your lungs. Take a deep breath... and again.
Patient: *coughing*
Doctor: Your lungs sound clear. No fever?
Patient: No, but I've been sweating at night.
Doctor: Any weight loss?
Patient: Maybe a few pounds, but I've been eating less.
Doctor: Given your history of smoking, I'd like to order a chest X-ray and some blood work.
Patient: Is it serious, doctor?
Doctor: Let's not jump to conclusions. We'll get some tests and go from there.
        """.strip(),
        "soap_note": """## Subjective
Mr. John Smith, 59-year-old male, presents with 2-week history of persistent cough associated with fatigue and exertional dyspnea. Patient reports night sweats and unintentional weight loss of approximately 5 lbs. No fever. 40 pack-year smoking history, quit 5 years ago.

## Objective
Vital Signs: BP 128/82, HR 88, RR 18, SpO2 96% RA, Temp 97.8F
General: Alert, cooperative, no acute distress
Respiratory: Lungs clear to auscultation bilaterally, no wheezes or rales

## Assessment
1. Chronic cough - differential includes post-viral, GERD, tobacco-related lung disease
2. Unintentional weight loss with night sweats - requires evaluation for underlying etiology

## Plan
1. Chest X-ray to rule out infiltrates/masses
2. CBC, CMP, ESR/CRP
3. Follow up in 1 week with results
4. Smoking cessation reinforcement
5. Consider chest CT if X-ray abnormal or symptoms persist
        """.strip()
    },
    {
        "status": "draft",
        "patient_id": "patient-002",
        "transcript": """
Doctor: Hi Jane, what brings you in today?
Patient: I've been having really bad headaches for the past month.
Doctor: Can you describe the pain? Where is it located?
Patient: Mostly on the right side of my head, around my eye.
Doctor: Throbbing or constant?
Patient: Throbbing, like a heartbeat. Light hurts my eyes.
Doctor: How often do these headaches occur?
Patient: Maybe 2-3 times a week. They last all day sometimes.
Doctor: Any nausea with them?
Patient: Yes, I've thrown up a couple times.
Doctor: Any family history of migraines?
Patient: My mom gets bad headaches too.
Doctor: Based on your symptoms, this sounds like migraine headaches.
        """.strip(),
        "soap_note": None  # AI-generated note pending
    },
    {
        "status": "processing",
        "patient_id": "patient-003",
        "transcript": """
Doctor: Mr. Johnson, let's review your blood pressure readings from home.
Patient: Okay. I've been taking them like you said.
Doctor: This morning it was 148/92?
Patient: Yes, but I was worried about coming to the appointment.
Doctor: That's understandable. Last week you had 142/88.
Patient: Is that better?
Doctor: It's still above our target of 130/80. Are you taking your medications?
Patient: Yes, every morning with breakfast.
Doctor: Have you been following the low-sodium diet?
Patient: I've tried, but it's hard.
Doctor: I understand. Let's discuss some strategies to reduce sodium intake.
        """.strip(),
        "soap_note": None
    }
]


def generate_seed_data() -> dict:
    """Generate the complete seed data structure."""
    return {
        "clinicians": [DEMO_CLINICIAN],
        "patients": DEMO_PATIENTS,
        "encounters": [
            {
                **encounter,
                "id": f"encounter-{i+1:03d}",
                "clinician_id": DEMO_CLINICIAN["id"],
                "created_at": (datetime.now() - timedelta(days=i)).isoformat(),
                "updated_at": datetime.now().isoformat(),
            }
            for i, encounter in enumerate(DEMO_ENCOUNTERS)
        ]
    }


def main():
    print("🌱 Generating seed data for Healthcare Ambient Scribe...")
    print()

    seed_data = generate_seed_data()

    # Output as JSON for easy consumption
    output_path = Path(__file__).parent / "seed_data.json"
    with open(output_path, "w") as f:
        json.dump(seed_data, f, indent=2)

    print(f"✅ Seed data generated: {output_path}")
    print()
    print("Summary:")
    print(f"  - Clinicians: {len(seed_data['clinicians'])}")
    print(f"  - Patients: {len(seed_data['patients'])}")
    print(f"  - Encounters: {len(seed_data['encounters'])}")
    print()
    print("Encounter states:")
    for enc in seed_data["encounters"]:
        patient = next(p for p in seed_data["patients"] if p["id"] == enc["patient_id"])
        print(f"  - {enc['id']}: {enc['status']} - {patient['name']}")

    print()
    print("📝 To load this data into your database, implement a seed endpoint or use Prisma db seed.")


if __name__ == "__main__":
    main()
