'use client'

import { useState } from 'react'
import type { HC } from '@mindwatch/shared'
import { packContextEmbedding } from '@/lib/embeddings'

interface ContextProbeProps {
  enabled: boolean
  noiseLevel: number
  onCapture: (embedding: HC, features: any) => void
}

type Status = 'idle' | 'requesting' | 'success' | 'error'

export default function ContextProbe({
  enabled,
  noiseLevel,
  onCapture,
}: ContextProbeProps) {
  const [location, setLocation] = useState<{
    latitude: number
    longitude: number
  } | null>(null)

  const [status, setStatus] = useState<Status>('idle')
  const [locationError, setLocationError] = useState<string | null>(null)

  const captureContext = () => {
    if (!navigator.geolocation) {
      setStatus('error')
      setLocationError('Geolocation not supported by this browser.')
      return
    }

    setStatus('requesting')
    setLocationError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Math.round(position.coords.latitude * 100) / 100
        const lon = Math.round(position.coords.longitude * 100) / 100

        setLocation({ latitude: lat, longitude: lon })
        setStatus('success')

        const now = new Date()
        const hourOfDay = now.getHours() + now.getMinutes() / 60

        const features = {
          latitude: lat,
          longitude: lon,
          hourOfDay,
          noiseLevel,
        }

        const embedding = packContextEmbedding(features)
        onCapture(embedding, features)
      },
      (error) => {
        setStatus('error')

        if (error.code === error.PERMISSION_DENIED) {
          setLocationError('Location permission denied.')
        } else if (error.code === error.TIMEOUT) {
          setLocationError('Location request timed out.')
        } else {
          setLocationError('Unable to retrieve location.')
        }
      },
      {
        enableHighAccuracy: false, // coarse location only
        timeout: 5000,
        maximumAge: 60000,
      }
    )
  }

  const retryLocation = () => {
    setStatus('idle')
    setLocation(null)
    setLocationError(null)
  }

  if (!enabled) {
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500">
        Context collection disabled. Enable in consent settings.
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Context</h3>

      {/* IDLE */}
      {status === 'idle' && (
        <button
          onClick={captureContext}
          className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg"
        >
          📍 Get Location
        </button>
      )}

      {/* REQUESTING */}
      {status === 'requesting' && (
        <p className="text-sm text-gray-600 text-center">
          Fetching location…
        </p>
      )}

      {/* SUCCESS */}
      {status === 'success' && location && (
        <div className="space-y-2 text-sm text-gray-600">
          <div>
            <span className="font-medium">Location:</span>{' '}
            {location.latitude.toFixed(2)}, {location.longitude.toFixed(2)}
          </div>
          <div>
            <span className="font-medium">Time:</span>{' '}
            {new Date().toLocaleTimeString()}
          </div>
          <div>
            <span className="font-medium">Noise Level:</span>{' '}
            {Math.round(noiseLevel)}%
          </div>
        </div>
      )}

      {/* ERROR */}
      {status === 'error' && (
        <div className="text-center text-red-600 text-sm">
          <p className="mb-2">{locationError}</p>
          <button
            onClick={retryLocation}
            className="bg-gray-700 text-white px-4 py-2 rounded-lg"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
