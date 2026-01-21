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

export default app
