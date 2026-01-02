'use client'

import { useState, useRef, useEffect } from 'react'
import type { HA } from '@mindwatch/shared'
import { packAudioEmbedding } from '@/lib/embeddings'

interface AudioCaptureProps {
  enabled: boolean
  onCapture: (embedding: HA, features: any) => void
  onError: (error: string) => void
  onNoiseLevel: (level: number) => void
}

export default function AudioCapture({
  enabled,
  onCapture,
  onError,
  onNoiseLevel,
}: AudioCaptureProps) {
  // ─────────────────────────────────────────────
  // REFS (must be top-level)
  // ─────────────────────────────────────────────
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const captureTimeoutRef = useRef<number | null>(null)

  // ─────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────
  const [audioLevel, setAudioLevel] = useState(0)
  const [status, setStatus] = useState<
    'idle' | 'requesting' | 'recording' | 'error'
  >('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // ─────────────────────────────────────────────
  // CLEANUP ON DISABLE / UNMOUNT
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      stopCapture()
      setStatus('idle')
      setErrorMsg(null)
    }

    return () => stopCapture()
  }, [enabled])

  // ─────────────────────────────────────────────
  // START AUDIO CAPTURE
  // ─────────────────────────────────────────────
  const startCapture = async () => {
    try {
      setStatus('requesting')
      setErrorMsg(null)

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      streamRef.current = stream

      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)()
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyserRef.current = analyser
      source.connect(analyser)

      setStatus('recording')

      monitorAudioLevel()

      // Capture once after 3 seconds
      captureTimeoutRef.current = window.setTimeout(() => {
        captureAudio()
        stopCapture()
      }, 3000)
    } catch (err) {
      setStatus('error')
      setErrorMsg('Microphone permission denied or unavailable.')
      onError('Microphone permission denied.')
    }
  }

  // ─────────────────────────────────────────────
  // STOP AUDIO CAPTURE
  // ─────────────────────────────────────────────
  const stopCapture = () => {
    if (captureTimeoutRef.current) {
      clearTimeout(captureTimeoutRef.current)
      captureTimeoutRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    analyserRef.current = null
   
    setStatus("idle")
    setAudioLevel(0)
   

  }

  const retryAudio = () => {
    setErrorMsg(null)
    setStatus('idle')
  }

  // ─────────────────────────────────────────────
  // AUDIO LEVEL MONITOR (LIVE)
  // ─────────────────────────────────────────────
  const monitorAudioLevel = () => {
    if (!analyserRef.current) return

    const analyser = analyserRef.current
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    const updateLevel = () => {
      if (!analyserRef.current) return

      analyser.getByteFrequencyData(dataArray)
      const average =
        dataArray.reduce((a, b) => a + b, 0) / dataArray.length

      const level = (average / 255) * 100
      setAudioLevel(level)
      onNoiseLevel(level)

      requestAnimationFrame(updateLevel)
    }

    updateLevel()
  }

  // ─────────────────────────────────────────────
  // CAPTURE FEATURES
  // ─────────────────────────────────────────────
  const captureAudio = () => {
    if (!analyserRef.current) return

    const analyser = analyserRef.current
    const bufferLength = analyser.frequencyBinCount
    const byteData = new Uint8Array(bufferLength)
    const floatData = new Float32Array(bufferLength)

    analyser.getByteFrequencyData(byteData)
    analyser.getFloatFrequencyData(floatData)

    const features = extractAudioFeatures(byteData, floatData)
    const embedding = packAudioEmbedding(features)
    onCapture(embedding, features)
  }

  // ─────────────────────────────────────────────
  // FEATURE EXTRACTION (UNCHANGED LOGIC)
  // ─────────────────────────────────────────────
  const extractAudioFeatures = (
    frequencyData: Uint8Array,
    floatFrequencyData: Float32Array
  ) => {
    const energy =
      Math.sqrt(
        Array.from(frequencyData).reduce((s, v) => s + v * v, 0) /
          frequencyData.length
      ) / 255

    let maxIndex = 0
    for (let i = 1; i < frequencyData.length; i++) {
      if (frequencyData[i] > frequencyData[maxIndex]) {
        maxIndex = i
      }
    }

    const sampleRate = audioContextRef.current?.sampleRate || 44100
    const pitch = (maxIndex * sampleRate) / (2 * frequencyData.length)

    let weightedSum = 0
    let magnitudeSum = 0

    for (let i = 0; i < floatFrequencyData.length; i++) {
      const mag = Math.abs(floatFrequencyData[i])
      const freq = (i * sampleRate) / (2 * frequencyData.length)
      weightedSum += freq * mag
      magnitudeSum += mag
    }

    const spectralCentroid =
      magnitudeSum > 0 ? weightedSum / magnitudeSum : 0

    return {
      energy: Math.min(energy, 1),
      pitch: Math.min(pitch / 1000, 1),
      speakingRate: 0.5,
      spectralCentroid: Math.min(spectralCentroid / 5000, 1),
    }
  }

  // ─────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────
  if (!enabled) {
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500">
        Microphone disabled. Enable in consent settings.
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      {status === 'idle' && (
        <button
          onClick={startCapture}
          disabled={status !== "idle"}
          className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg disabled:opacity-50"
        >
          🎤 Start Recording
        </button>
      )}

      {status === 'requesting' && (
        <p className="text-sm text-gray-600 text-center">
          Requesting microphone permission…
        </p>
      )}

      {status === 'recording' && (
        <>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Audio Level</span>
              <span>{Math.round(audioLevel)}%</span>
            </div>
            <div className="w-full bg-gray-200 h-2 rounded-full">
              <div
                className="bg-indigo-600 h-2 rounded-full"
                style={{ width: `${audioLevel}%` }}
              />
            </div>
          </div>

          <div className="flex justify-center">
            <div
              className="h-4 w-4 bg-red-500 rounded-full"
              style={{
                transform: `scale(${1 + audioLevel / 100})`,
                opacity: Math.min(1, 0.3 + audioLevel / 100),
              }}
            />
          </div>

          <p className="text-sm text-indigo-600 text-center">
            Recording 3-second sample…
          </p>
        </>
      )}

      {status === 'error' && (
        <div className="text-center">
          <p className="text-sm text-red-600 mb-2">{errorMsg}</p>
          <button
            onClick={retryAudio}
            className="bg-gray-700 text-white px-4 py-2 rounded-lg"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
