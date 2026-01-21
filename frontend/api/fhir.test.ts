// Unit tests for FHIR Bundle generation
import { describe, it, expect } from 'vitest'

// FHIR Bundle generator (copied from index.ts for testing)
function generateFhirBundle(encounter: {
  id: string
  status: string
  soapSubjective?: string | null
  soapObjective?: string | null
  soapAssessment?: string | null
  soapPlan?: string | null
  icd10Codes: string[]
  encounterDate: Date
  signedAt?: Date | null
  clinician: { id: string; name: string; specialty?: string | null }
  patient: { id: string; name: string; dob?: Date | null; mrn?: string | null }
}) {
  const now = new Date().toISOString()
  const patientId = `patient-${encounter.patient.id}`
  const practitionerId = `practitioner-${encounter.clinician.id}`
  const encounterId = `encounter-${encounter.id}`
  const compositionId = `composition-${encounter.id}`

  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: now,
    entry: [
      {
        resource: {
          resourceType: 'Patient',
          id: patientId,
          identifier: encounter.patient.mrn ? [{
            system: 'http://hospital.example.org/mrn',
            value: encounter.patient.mrn
          }] : [],
          name: [{
            use: 'official',
            family: encounter.patient.name.split(' ').pop(),
            given: [encounter.patient.name.split(' ')[0]]
          }],
          birthDate: encounter.patient.dob ? encounter.patient.dob.toISOString().split('T')[0] : undefined
        }
      },
      {
        resource: {
          resourceType: 'Practitioner',
          id: practitionerId,
          name: [{
            use: 'official',
            family: encounter.clinician.name.split(' ').pop(),
            given: [encounter.clinician.name.split(' ').slice(0, -1).join(' ')],
            prefix: ['Dr.']
          }],
          qualification: encounter.clinician.specialty ? [{
            code: {
              coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/v2-0360',
                code: 'MD',
                display: encounter.clinician.specialty
              }]
            }
          }] : []
        }
      },
      {
        resource: {
          resourceType: 'Encounter',
          id: encounterId,
          status: encounter.status === 'SIGNED' ? 'finished' : 'in-progress',
          class: {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'AMB',
            display: 'ambulatory'
          },
          subject: { reference: `Patient/${patientId}` },
          participant: [{ individual: { reference: `Practitioner/${practitionerId}` } }],
          period: {
            start: encounter.encounterDate.toISOString(),
            end: encounter.signedAt?.toISOString() || now
          }
        }
      },
      {
        resource: {
          resourceType: 'Composition',
          id: compositionId,
          status: 'final',
          type: {
            coding: [{
              system: 'http://loinc.org',
              code: '34108-1',
              display: 'Outpatient Note'
            }]
          },
          subject: { reference: `Patient/${patientId}` },
          date: now,
          author: [{ reference: `Practitioner/${practitionerId}` }],
          encounter: { reference: `Encounter/${encounterId}` },
          section: [
            { title: 'Subjective', text: { div: `<div>${encounter.soapSubjective || 'N/A'}</div>` } },
            { title: 'Objective', text: { div: `<div>${encounter.soapObjective || 'N/A'}</div>` } },
            { title: 'Assessment', text: { div: `<div>${encounter.soapAssessment || 'N/A'}</div>` } },
            { title: 'Plan', text: { div: `<div>${encounter.soapPlan || 'N/A'}</div>` } }
          ]
        }
      }
    ]
  }
}

describe('FHIR Bundle Generation', () => {
  it('should generate a valid FHIR Bundle', () => {
    const encounter = {
      id: 'enc-123',
      status: 'REVIEW',
      soapSubjective: 'Patient reports headache',
      soapObjective: 'BP 120/80',
      soapAssessment: 'Tension headache',
      soapPlan: 'Rest and fluids',
      icd10Codes: ['G44.2'],
      encounterDate: new Date('2024-01-15'),
      signedAt: undefined,
      clinician: { id: 'dr-1', name: 'Dr. House', specialty: 'Internal Medicine' },
      patient: { id: 'pat-1', name: 'John Smith', dob: new Date('1965-03-15'), mrn: 'MRN123' }
    }

    const bundle = generateFhirBundle(encounter)

    expect(bundle.resourceType).toBe('Bundle')
    expect(bundle.type).toBe('collection')
    expect(bundle.entry).toHaveLength(4)
  })

  it('should include Patient resource with correct data', () => {
    const encounter = {
      id: 'enc-123',
      status: 'REVIEW',
      soapSubjective: 'Test',
      soapObjective: 'Test',
      soapAssessment: 'Test',
      soapPlan: 'Test',
      icd10Codes: [],
      encounterDate: new Date(),
      signedAt: undefined,
      clinician: { id: 'dr-1', name: 'Dr. Smith' },
      patient: { id: 'pat-1', name: 'Jane Doe', mrn: 'MRN456' }
    }

    const bundle = generateFhirBundle(encounter)
    const patientResource = bundle.entry.find(e => e.resource.resourceType === 'Patient')?.resource

    expect(patientResource).toBeDefined()
    expect(patientResource.id).toBe('patient-pat-1')
    expect(patientResource.name[0].family).toBe('Doe')
    expect(patientResource.name[0].given).toContain('Jane')
    expect(patientResource.identifier[0].value).toBe('MRN456')
  })

  it('should include Practitioner resource', () => {
    const encounter = {
      id: 'enc-123',
      status: 'REVIEW',
      soapSubjective: 'Test',
      soapObjective: 'Test',
      soapAssessment: 'Test',
      soapPlan: 'Test',
      icd10Codes: [],
      encounterDate: new Date(),
      signedAt: undefined,
      clinician: { id: 'dr-1', name: 'Dr. House', specialty: 'Internal Medicine' },
      patient: { id: 'pat-1', name: 'John Smith' }
    }

    const bundle = generateFhirBundle(encounter)
    const practitionerResource = bundle.entry.find(e => e.resource.resourceType === 'Practitioner')?.resource

    expect(practitionerResource).toBeDefined()
    expect(practitionerResource.id).toBe('practitioner-dr-1')
    expect(practitionerResource.qualification[0].code.coding[0].display).toBe('Internal Medicine')
  })

  it('should include Encounter resource with correct status', () => {
    const encounter = {
      id: 'enc-123',
      status: 'SIGNED',
      soapSubjective: 'Test',
      soapObjective: 'Test',
      soapAssessment: 'Test',
      soapPlan: 'Test',
      icd10Codes: [],
      encounterDate: new Date('2024-01-15'),
      signedAt: new Date('2024-01-15'),
      clinician: { id: 'dr-1', name: 'Dr. Smith' },
      patient: { id: 'pat-1', name: 'John Smith' }
    }

    const bundle = generateFhirBundle(encounter)
    const encounterResource = bundle.entry.find(e => e.resource.resourceType === 'Encounter')?.resource

    expect(encounterResource).toBeDefined()
    expect(encounterResource.status).toBe('finished')
    expect(encounterResource.class.code).toBe('AMB')
  })

  it('should include Composition with SOAP sections', () => {
    const encounter = {
      id: 'enc-123',
      status: 'REVIEW',
      soapSubjective: 'Patient has headache',
      soapObjective: 'BP normal',
      soapAssessment: 'Tension headache',
      soapPlan: 'Take Tylenol',
      icd10Codes: ['G44.2'],
      encounterDate: new Date(),
      signedAt: undefined,
      clinician: { id: 'dr-1', name: 'Dr. Smith' },
      patient: { id: 'pat-1', name: 'John Smith' }
    }

    const bundle = generateFhirBundle(encounter)
    const compositionResource = bundle.entry.find(e => e.resource.resourceType === 'Composition')?.resource

    expect(compositionResource).toBeDefined()
    expect(compositionResource.type.coding[0].code).toBe('34108-1')
    expect(compositionResource.section).toHaveLength(4)
    expect(compositionResource.section[0].title).toBe('Subjective')
    expect(compositionResource.section[3].title).toBe('Plan')
  })
})
