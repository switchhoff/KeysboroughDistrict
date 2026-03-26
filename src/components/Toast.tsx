'use client'

import { useEffect } from 'react'
import { CheckCircle, X, AlertCircle } from 'lucide-react'

interface ToastProps {
  message: string
  type?: 'success' | 'error'
  onClose: () => void
}

export default function Toast({ message, type = 'success', onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl max-w-sm mx-4 ${
        type === 'success' ? 'bg-club-red text-white' : 'bg-red-600 text-white'
      }`}>
        {type === 'success' ? (
          <CheckCircle className="w-5 h-5 shrink-0" />
        ) : (
          <AlertCircle className="w-5 h-5 shrink-0" />
        )}
        <span className="text-sm font-medium flex-1">{message}</span>
        <button onClick={onClose} className="shrink-0 opacity-80 hover:opacity-100">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
