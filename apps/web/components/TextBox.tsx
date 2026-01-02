'use client'

import { useState } from 'react'
import type { HT } from '@mindwatch/shared'
import { packTextEmbedding } from '@/lib/embeddings'
import Sentiment from 'sentiment'

interface TextBoxProps {
  enabled: boolean
  onCapture: (embedding: HT, features: any) => void
}

const sentiment = new Sentiment()

export default function TextBox({ enabled, onCapture }: TextBoxProps) {
  const [text, setText] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [status, setStatus] = useState<'idle' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  
  const handleAnalyze = () => {
    if (!text.trim() || !enabled) return
    setIsAnalyzing(true)
    setStatus('idle')
    setErrorMsg(null)

    try {
      const result = sentiment.analyze(text)

      const words = text.trim().split(/\s+/)
      const wordCount = words.length
      const negationCount =
        (text.match(/\b(not|no|never|nothing|nobody|nowhere|neither|nor)\b/gi) || [])
      .length

    const features = {
    polarity: (result.score || 0) / 10,
    subjectivity: Math.abs(result.comparative || 0),
    negationCount: Math.min(negationCount / wordCount, 1),
    wordCount: Math.min(wordCount / 100, 1),
  }

  const embedding = packTextEmbedding(features)
  onCapture(embedding, features)

  setStatus('done')
} catch (err) {
  setStatus('error')
  setErrorMsg('Text analysis failed.')
} finally {
  setIsAnalyzing(false)
}

  }

  if (!enabled) {
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500">
        Text analysis disabled. Enable in consent settings.
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Journal Entry / Text Input
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="How are you feeling today? Share your thoughts..."
        className="w-full border border-gray-300 rounded-lg p-3 min-h-[120px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        rows={5}
      />
      <button
        onClick={handleAnalyze}
        disabled={!text.trim() || isAnalyzing}
        className="mt-3 bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {isAnalyzing ? 'Analyzing...' : 'Analyze Text'}
      </button>
      {status === 'done' && (
  <p className="text-sm text-green-600 mt-2 text-center">
    ✓ Text analyzed successfully
  </p>
)}

{status === 'error' && (
  <div className="text-center mt-2">
    <p className="text-sm text-red-600">{errorMsg}</p>
    <button
      onClick={() => {
        setStatus('idle')
        setErrorMsg(null)
      }}
      className="text-sm text-indigo-600 underline"
    >
      Retry
    </button>
  </div>
)}

    </div>
  )
}


