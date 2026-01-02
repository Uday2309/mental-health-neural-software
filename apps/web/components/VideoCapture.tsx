'use client'

import { useState, useRef, useEffect } from 'react'
import type { HV } from '@mindwatch/shared'
import { packVisionEmbedding } from '@/lib/embeddings'

interface VideoCaptureProps {
  enabled: boolean
  onCapture: (embedding: HV, features: any) => void
  onError: (error: string) => void
}

export default function VideoCapture({
  enabled,
  onCapture,
  onError,
}: VideoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const captureIntervalRef = useRef<number | null>(null)
  const frameCountRef = useRef(0)

  const [status, setStatus] = useState<
    'idle' | 'requesting' | 'capturing' | 'error'
  >('idle')

  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Cleanup when disabled or unmounted
  useEffect(() => {
    if (!enabled) {
      stopCapture()
      setStatus('idle')
      setErrorMsg(null)
    }

    return () => stopCapture()
  }, [enabled])

  // ─────────────────────────────────────────────
  // START CAMERA
  // ─────────────────────────────────────────────
  const startCapture = async () => {
    try {
      setStatus('requesting')
      setErrorMsg(null)

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: 640,
          height: 480,
        },
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setStatus('capturing')

      // Capture 2 frames over 10 seconds (every 5s)
      frameCountRef.current = 0
      captureIntervalRef.current = window.setInterval(() => {
        captureFrame()
        frameCountRef.current++

        if (frameCountRef.current >= 2) {
          stopCapture()
          setStatus('idle')
        }
      }, 5000)
    } catch (err) {
      setStatus('error')
      setErrorMsg('Camera permission denied or unavailable.')
      onError('Camera permission denied.')
    }
  }

  // ─────────────────────────────────────────────
  // STOP CAMERA
  // ─────────────────────────────────────────────
  const stopCapture = () => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current)
      captureIntervalRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    frameCountRef.current = 0
  }

  const retryCamera = () => {
    setErrorMsg(null)
    setStatus('idle')
  }

  // ─────────────────────────────────────────────
  // FRAME CAPTURE
  // ─────────────────────────────────────────────
  const captureFrame = () => {
    if (!videoRef.current) return

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)

    const features = extractFacialFeatures(canvas)
    const embedding = packVisionEmbedding(features)
    onCapture(embedding, features)
  }

  // ─────────────────────────────────────────────
  // STUB FEATURE EXTRACTION (UNCHANGED LOGIC)
  // ─────────────────────────────────────────────
  const extractFacialFeatures = (canvas: HTMLCanvasElement) => {
    const eyeAspectRatio = 0.25 + Math.random() * 0.1
    const mouthOpenness = Math.random() * 0.3
    const browRaise = Math.random() * 0.2

    const headPose = {
      pitch: (Math.random() - 0.5) * 20,
      yaw: (Math.random() - 0.5) * 30,
      roll: (Math.random() - 0.5) * 10,
    }

    return {
      eyeAspectRatio,
      mouthOpenness,
      browRaise,
      headPose,
    }
  }

  // ─────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────
  if (!enabled) {
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500">
        Camera disabled. Enable in consent settings.
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-medium text-gray-700">Vision (Camera)</h3>

      {status === 'idle' && (
        <button
          onClick={startCapture}
          className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg"
        >
          📷 Start Camera
        </button>
      )}

      {status === 'requesting' && (
        <p className="text-sm text-gray-600 text-center">
          Requesting camera permission…
        </p>
      )}

      {(status === 'requesting' || status === 'capturing') && (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-lg border"
          />
          {status === 'capturing' && (
          <p className="text-sm text-indigo-600 text-center">
            Capturing… ({frameCountRef.current}/2)
          </p>
          )}
        </>
      )}

      {status === 'error' && (
        <div className="text-center">
          <p className="text-sm text-red-600 mb-2">{errorMsg}</p>
          <button
            onClick={retryCamera}
            className="bg-gray-700 text-white px-4 py-2 rounded-lg"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
