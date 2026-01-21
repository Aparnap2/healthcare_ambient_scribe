import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { PrismaClient } from '@prisma/client'

const app = new Hono<{ Bindings: { DATABASE_URL: string } }>()

app.use('/*', cors())

// Prisma client singleton
let prisma: PrismaClient | null = null

function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ambient_scribe'
        }
      }
    })
  }
  return prisma
}

// Types
interface Encounter {
  id: string
  status: string
  patientName: string
  clinicianName: string
  encounterDate: string
  audioUrl?: string
  transcript?: string
  soapSubjective?: string
  soapObjective?: string
  soapAssessment?: string
  soapPlan?: string
}

// Routes

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'healthy', service: 'api' })
})

// Get all encounters
app.get('/api/encounters', async (c) => {
  try {
    const prisma = getPrisma()
    const encounters = await prisma.encounter.findMany({
      include: {
        clinician: true,
        patient: true,
      },
      orderBy: { encounterDate: 'desc' },
    })

    const result: Encounter[] = encounters.map((e) => ({
      id: e.id,
      status: e.status,
      patientName: e.patient.name,
      clinicianName: e.clinician.name,
      encounterDate: e.encounterDate.toISOString(),
      audioUrl: e.audioUrl || undefined,
      transcript: e.transcript || undefined,
      soapSubjective: e.soapSubjective || undefined,
      soapObjective: e.soapObjective || undefined,
      soapAssessment: e.soapAssessment || undefined,
      soapPlan: e.soapPlan || undefined,
    }))

    return c.json(result)
  } catch (error) {
    console.error('Error fetching encounters:', error)
    return c.json({ error: 'Failed to fetch encounters' }, 500)
  }
})

// Get single encounter
app.get('/api/encounters/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const prisma = getPrisma()
    const encounter = await prisma.encounter.findUnique({
      where: { id },
      include: {
        clinician: true,
        patient: true,
      },
    })

    if (!encounter) {
      return c.json({ error: 'Encounter not found' }, 404)
    }

    return c.json({
      id: encounter.id,
      status: encounter.status,
      patientName: encounter.patient.name,
      clinicianName: encounter.clinician.name,
      encounterDate: encounter.encounterDate.toISOString(),
      audioUrl: encounter.audioUrl || undefined,
      transcript: encounter.transcript || undefined,
      soapSubjective: encounter.soapSubjective || undefined,
      soapObjective: encounter.soapObjective || undefined,
      soapAssessment: encounter.soapAssessment || undefined,
      soapPlan: encounter.soapPlan || undefined,
    })
  } catch (error) {
    console.error('Error fetching encounter:', error)
    return c.json({ error: 'Failed to fetch encounter' }, 500)
  }
})

// Create new encounter
app.post('/api/encounters', async (c) => {
  try {
    const body = await c.req.json()
    const { patientId, clinicianId = 'demo-clinician' } = body

    const prisma = getPrisma()

    // Ensure demo clinician exists
    let clinician = await prisma.clinician.findUnique({
      where: { id: clinicianId },
    })

    if (!clinician) {
      clinician = await prisma.clinician.create({
        data: {
          id: clinicianId,
          name: 'Dr. Gregory House',
          specialty: 'Internal Medicine',
        },
      })
    }

    // Ensure patient exists or create
    let patient = await prisma.patient.findUnique({
      where: { id: patientId },
    })

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          id: patientId,
          name: body.patientName || 'Unknown Patient',
          dob: body.patientDob ? new Date(body.patientDob) : undefined,
          mrn: body.patientMRN,
        },
      })
    }

    const encounter = await prisma.encounter.create({
      data: {
        clinicianId: clinician.id,
        patientId: patient.id,
        status: 'RECORDING',
      },
    })

    return c.json({
      id: encounter.id,
      status: encounter.status,
      patientName: patient.name,
      clinicianName: clinician.name,
      encounterDate: encounter.encounterDate.toISOString(),
    }, 201)
  } catch (error) {
    console.error('Error creating encounter:', error)
    return c.json({ error: 'Failed to create encounter' }, 500)
  }
})

// Update encounter (transcript, SOAP, etc.)
app.patch('/api/encounters/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const body = await c.req.json()
    const prisma = getPrisma()

    const updateData: Record<string, unknown> = {}

    if (body.status) updateData.status = body.status
    if (body.transcript !== undefined) updateData.transcript = body.transcript
    if (body.audioUrl !== undefined) updateData.audioUrl = body.audioUrl
    if (body.soapSubjective !== undefined) updateData.soapSubjective = body.soapSubjective
    if (body.soapObjective !== undefined) updateData.soapObjective = body.soapObjective
    if (body.soapAssessment !== undefined) updateData.soapAssessment = body.soapAssessment
    if (body.soapPlan !== undefined) updateData.soapPlan = body.soapPlan
    if (body.icd10Codes) updateData.icd10Codes = body.icd10Codes
    if (body.status === 'SIGNED') updateData.signedAt = new Date()

    const encounter = await prisma.encounter.update({
      where: { id },
      data: updateData,
      include: {
        clinician: true,
        patient: true,
      },
    })

    return c.json({
      id: encounter.id,
      status: encounter.status,
      patientName: encounter.patient.name,
      clinicianName: encounter.clinician.name,
    })
  } catch (error) {
    console.error('Error updating encounter:', error)
    return c.json({ error: 'Failed to update encounter' }, 500)
  }
})

// Generate SOAP from transcript (calls AI service)
app.post('/api/encounters/:id/generate-soap', async (c) => {
  const id = c.req.param('id')
  try {
    const prisma = getPrisma()
    const encounter = await prisma.encounter.findUnique({ where: { id } })

    if (!encounter) {
      return c.json({ error: 'Encounter not found' }, 404)
    }

    if (!encounter.transcript) {
      return c.json({ error: 'No transcript available' }, 400)
    }

    // Call AI service
    const aiResponse = await fetch('http://localhost:8001/api/ai/generate-soap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: encounter.transcript }),
    })

    if (!aiResponse.ok) {
      throw new Error('AI service error')
    }

    const soapResult = await aiResponse.json()

    // Update encounter with SOAP
    await prisma.encounter.update({
      where: { id },
      data: {
        status: 'REVIEW',
        soapSubjective: soapResult.soap.subjective,
        soapObjective: soapResult.soap.objective,
        soapAssessment: soapResult.soap.assessment,
        soapPlan: soapResult.soap.plan,
        icd10Codes: soapResult.icd10_codes,
      },
    })

    return c.json({
      success: true,
      soap: soapResult.soap,
      processingTimeMs: soapResult.processing_time_ms,
    })
  } catch (error) {
    console.error('Error generating SOAP:', error)
    return c.json({ error: 'Failed to generate SOAP' }, 500)
  }
})

// Sign encounter
app.post('/api/encounters/:id/sign', async (c) => {
  const id = c.req.param('id')
  try {
    const prisma = getPrisma()
    const encounter = await prisma.encounter.update({
      where: { id },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
      },
    })

    return c.json({ success: true, status: encounter.status })
  } catch (error) {
    console.error('Error signing encounter:', error)
    return c.json({ error: 'Failed to sign encounter' }, 500)
  }
})

// FHIR Export - Generate FHIR Bundle for an encounter
app.get('/api/encounters/:id/fhir', async (c) => {
  const id = c.req.param('id')
  try {
    const prisma = getPrisma()
    const encounter = await prisma.encounter.findUnique({
      where: { id },
      include: {
        clinician: true,
        patient: true,
      },
    })

    if (!encounter) {
      return c.json({ error: 'Encounter not found' }, 404)
    }

    // Generate FHIR Bundle
    const fhirBundle = generateFhirBundle(encounter)

    return c.json(fhirBundle)
  } catch (error) {
    console.error('Error generating FHIR bundle:', error)
    return c.json({ error: 'Failed to generate FHIR bundle' }, 500)
  }
})

// Post FHIR Bundle to external FHIR server
app.post('/api/encounters/:id/fhir-export', async (c) => {
  const id = c.req.param('id')
  try {
    const prisma = getPrisma()
    const encounter = await prisma.encounter.findUnique({
      where: { id },
      include: {
        clinician: true,
        patient: true,
      },
    })

    if (!encounter) {
      return c.json({ error: 'Encounter not found' }, 404)
    }

    // Generate FHIR Bundle
    const fhirBundle = generateFhirBundle(encounter)

    // Post to external FHIR server
    const fhirServerUrl = process.env.FHIR_BASE_URL || 'http://localhost:8080/fhir'
    const response = await fetch(fhirServerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json',
      },
      body: JSON.stringify(fhirBundle),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return c.json({
        error: 'Failed to post to FHIR server',
        details: errorText
      }, 500)
    }

    const fhirResult = await response.json()

    // Update encounter with FHIR bundle ID
    await prisma.encounter.update({
      where: { id },
      data: { fhirBundleId: fhirResult.id },
    })

    return c.json({
      success: true,
      fhirId: fhirResult.id,
      fhirUrl: `${fhirServerUrl}/${fhirResult.resourceType}/${fhirResult.id}`
    })
  } catch (error) {
    console.error('Error exporting to FHIR:', error)
    return c.json({ error: 'Failed to export to FHIR server' }, 500)
  }
})

// FHIR Bundle generator function
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

  // Generate unique IDs
  const patientId = `patient-${encounter.patient.id}`
  const practitionerId = `practitioner-${encounter.clinician.id}`
  const encounterId = `encounter-${encounter.id}`
  const compositionId = `composition-${encounter.id}`

  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: now,
    entry: [
      // Patient Resource
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
      // Practitioner Resource
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
      // Encounter Resource
      {
        resource: {
          resourceType: 'Encounter',
          id: encounterId,
          status: encounter.status === 'SIGNED' ? 'finished' :
                  encounter.status === 'REVIEW' ? 'in-progress' :
                  encounter.status === 'PROCESSING' ? 'in-progress' : 'in-progress',
          class: {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'AMB',
            display: 'ambulatory'
          },
          subject: { reference: `Patient/${patientId}` },
          participant: [{
            individual: { reference: `Practitioner/${practitionerId}` }
          }],
          period: {
            start: encounter.encounterDate.toISOString(),
            end: encounter.signedAt?.toISOString() || now
          },
          reasonCode: encounter.icd10Codes.length > 0 ? [{
            coding: encounter.icd10Codes.map(code => ({
              system: 'http://hl7.org/fhir/sid/icd-10-cm',
              code: code,
              display: code
            }))
          }] : undefined
        }
      },
      // Composition Resource (Clinical Document)
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
            {
              title: 'Subjective',
              code: { text: 'Patient symptoms and history' },
              text: { div: `<div>${encounter.soapSubjective || 'N/A'}</div>` }
            },
            {
              title: 'Objective',
              code: { text: 'Physical exam and vitals' },
              text: { div: `<div>${encounter.soapObjective || 'N/A'}</div>` }
            },
            {
              title: 'Assessment',
              code: { text: 'Diagnoses' },
              text: { div: `<div>${encounter.soapAssessment || 'N/A'}</div>` }
            },
            {
              title: 'Plan',
              code: { text: 'Treatment plan' },
              text: { div: `<div>${encounter.soapPlan || 'N/A'}</div>` }
            }
          ]
        }
      }
    ]
  }
}

export default app
