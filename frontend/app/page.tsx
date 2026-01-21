'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, Square, FileText, Check, Clock, User, Stethoscope, Volume2, Loader2 } from 'lucide-react'

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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const WHISPER_URL = process.env.NEXT_PUBLIC_WHISPER_URL || 'http://localhost:8088'
const TTS_URL = process.env.NEXT_PUBLIC_TTS_URL || 'http://localhost:8080'

export default function Home() {
  const [encounters, setEncounters] = useState<Encounter[]>([])
  const [selectedEncounter, setSelectedEncounter] = useState<Encounter | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [playingAudio, setPlayingAudio] = useState(false)

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)

  // Fetch encounters
  const fetchEncounters = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/encounters`)
      if (res.ok) {
        const data = await res.json()
        setEncounters(data)
      }
    } catch (error) {
      console.error('Failed to fetch encounters:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEncounters()
  }, [])

  // Recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isRecording])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SIGNED': return 'bg-green-100 text-green-800'
      case 'REVIEW': return 'bg-yellow-100 text-yellow-800'
      case 'PROCESSING': return 'bg-blue-100 text-blue-800'
      case 'RECORDING': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  // Start audio recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      })

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      })

      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current.start(1000) // Collect chunks every second
      setIsRecording(true)
      setRecordingTime(0)
    } catch (error) {
      console.error('Failed to start recording:', error)
      alert('Could not access microphone. Please allow microphone access.')
    }
  }

  // Stop recording and transcribe
  const stopRecording = async () => {
    if (!mediaRecorderRef.current) return

    return new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = async () => {
        setIsRecording(false)

        // Stop all tracks
        mediaRecorderRef.current!.stream.getTracks().forEach(track => track.stop())

        // Create audio blob
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })

        // Create encounter first
        try {
          const createRes = await fetch(`${API_BASE}/api/encounters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patientId: `patient-${Date.now()}`,
              patientName: 'New Patient',
            }),
          })

          if (createRes.ok) {
            const newEncounter = await createRes.json()

            // Transcribe audio
            await transcribeAudio(audioBlob, newEncounter.id)
            fetchEncounters()
            setSelectedEncounter({ ...newEncounter, transcript: 'Transcribing...' })
          }
        } catch (error) {
          console.error('Failed to create encounter:', error)
        }

        resolve()
      }

      mediaRecorderRef.current.stop()
    })
  }

  // Transcribe audio using Whisper
  const transcribeAudio = async (audioBlob: Blob, encounterId: string) => {
    setTranscribing(true)
    try {
      const formData = new FormData()
      formData.append('file', audioBlob, 'recording.webm')
      formData.append('model', 'tiny')
      formData.append('language', 'en')

      const response = await fetch(`${WHISPER_URL}/transcribe`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Transcription failed')
      }

      const result = await response.json()
      const transcript = result.text || result.transcript || ''

      // Update encounter with transcript
      await fetch(`${API_BASE}/api/encounters/${encounterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          status: 'PROCESSING'
        }),
      })

      fetchEncounters()
    } catch (error) {
      console.error('Transcription error:', error)
    } finally {
      setTranscribing(false)
    }
  }

  // Generate SOAP from transcript
  const generateSOAP = async (encounter: Encounter) => {
    setGenerating(true)
    try {
      const res = await fetch(`${API_BASE}/api/encounters/${encounter.id}/generate-soap`, {
        method: 'POST',
      })

      if (res.ok) {
        fetchEncounters()
        const refreshed = encounters.find(e => e.id === encounter.id)
        if (refreshed) setSelectedEncounter(refreshed)
      }
    } catch (error) {
      console.error('Failed to generate SOAP:', error)
    } finally {
      setGenerating(false)
    }
  }

  // Sign encounter
  const signEncounter = async (encounter: Encounter) => {
    try {
      const res = await fetch(`${API_BASE}/api/encounters/${encounter.id}/sign`, {
        method: 'POST',
      })

      if (res.ok) {
        fetchEncounters()
        setSelectedEncounter(null)
      }
    } catch (error) {
      console.error('Failed to sign encounter:', error)
    }
  }

  // Play SOAP note using Kokoro TTS
  const playSOAP = async (encounter: Encounter) => {
    if (!encounter.soapSubjective) return

    setPlayingAudio(true)
    try {
      const textToRead = `
        Subjective: ${encounter.soapSubjective}
        Objective: ${encounter.soapObjective}
        Assessment: ${encounter.soapAssessment}
        Plan: ${encounter.soapPlan}
      `

      const response = await fetch(`${TTS_URL}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: textToRead,
          voice: 'af_heart',
          response_format: 'mp3',
        }),
      })

      if (!response.ok) {
        throw new Error('TTS request failed')
      }

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)

      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = audioUrl
        audioPlayerRef.current.play()
      }
    } catch (error) {
      console.error('TTS error:', error)
    } finally {
      setPlayingAudio(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-8 w-8 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">Healthcare Ambient Scribe</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <User className="h-4 w-4" />
            <span>Dr. Gregory House</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Recording & Encounters */}
          <div className="lg:col-span-1 space-y-6">
            {/* Recording Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Recording</h2>

              {isRecording ? (
                <div className="text-center">
                  <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                    <Mic className="h-10 w-10 text-red-600" />
                  </div>
                  <div className="text-3xl font-mono mb-4">{formatTime(recordingTime)}</div>
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-4">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
                    Recording...
                  </div>
                  <button
                    onClick={stopRecording}
                    className="w-full bg-gray-900 text-white py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-800"
                  >
                    <Square className="h-4 w-4" />
                    Stop Recording
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mic className="h-10 w-10 text-gray-400" />
                  </div>
                  <button
                    onClick={startRecording}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700"
                  >
                    <Mic className="h-4 w-4" />
                    Start Recording
                  </button>
                  <p className="text-xs text-gray-500 mt-2">
                    Records audio and auto-transcribes via Whisper
                  </p>
                </div>
              )}
            </div>

            {/* Encounters List */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">Recent Encounters</h2>
              </div>
              <div className="divide-y max-h-[500px] overflow-y-auto">
                {loading ? (
                  <div className="p-6 text-center text-gray-500">Loading...</div>
                ) : encounters.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">No encounters yet</div>
                ) : (
                  encounters.map((encounter) => (
                    <button
                      key={encounter.id}
                      onClick={() => setSelectedEncounter(encounter)}
                      className={`w-full px-6 py-4 text-left hover:bg-gray-50 transition-colors ${
                        selectedEncounter?.id === encounter.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium">{encounter.patientName}</div>
                          <div className="text-sm text-gray-500">
                            {new Date(encounter.encounterDate).toLocaleDateString()}
                          </div>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(encounter.status)}`}>
                          {encounter.status}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Encounter Details */}
          <div className="lg:col-span-2">
            {selectedEncounter ? (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{selectedEncounter.patientName}</h2>
                  <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(selectedEncounter.status)}`}>
                    {selectedEncounter.status}
                  </span>
                </div>

                <div className="p-6 space-y-6">
                  {/* Transcript */}
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Transcript</h3>
                    <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 min-h-[100px]">
                      {transcribing ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Transcribing audio with Whisper...
                        </div>
                      ) : selectedEncounter.transcript ? (
                        selectedEncounter.transcript
                      ) : (
                        'No transcript available. Start recording to generate transcript.'
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {!selectedEncounter.soapSubjective && (
                    <div className="flex gap-3">
                      <button
                        onClick={() => generateSOAP(selectedEncounter)}
                        disabled={generating || !selectedEncounter.transcript}
                        className="flex-1 bg-blue-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50"
                      >
                        <FileText className="h-4 w-4" />
                        {generating ? 'Generating...' : 'Generate SOAP'}
                      </button>
                    </div>
                  )}

                  {/* SOAP Note */}
                  {selectedEncounter.soapSubjective && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-gray-900">SOAP Note</h3>
                        <button
                          onClick={() => playSOAP(selectedEncounter)}
                          disabled={playingAudio}
                          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                        >
                          <Volume2 className="h-4 w-4" />
                          {playingAudio ? 'Playing...' : 'Read Aloud'}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-blue-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-blue-600 uppercase mb-1">Subjective</div>
                          <div className="text-sm">{selectedEncounter.soapSubjective}</div>
                        </div>

                        <div className="bg-green-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-green-600 uppercase mb-1">Objective</div>
                          <div className="text-sm">{selectedEncounter.soapObjective}</div>
                        </div>

                        <div className="bg-yellow-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-yellow-600 uppercase mb-1">Assessment</div>
                          <div className="text-sm">{selectedEncounter.soapAssessment}</div>
                        </div>

                        <div className="bg-purple-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-purple-600 uppercase mb-1">Plan</div>
                          <div className="text-sm">{selectedEncounter.soapPlan}</div>
                        </div>
                      </div>

                      {/* Sign Button */}
                      {selectedEncounter.status !== 'SIGNED' && (
                        <button
                          onClick={() => signEncounter(selectedEncounter)}
                          className="w-full bg-green-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-green-700"
                        >
                          <Check className="h-4 w-4" />
                          Sign Encounter
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select an Encounter</h3>
                <p className="text-gray-500">Choose an encounter from the list to view details</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Hidden audio player */}
      <audio
        ref={audioPlayerRef}
        onEnded={() => setPlayingAudio(false)}
        style={{ display: 'none' }}
      />
    </div>
  )
}
