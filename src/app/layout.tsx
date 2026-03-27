import type { Metadata, Viewport } from 'next'
import './globals.css'
import ServiceWorkerSetup from '@/components/ServiceWorkerSetup'

export const metadata: Metadata = {
  title: 'KDFC MOTM — Man of the Match Voting',
  description: '3-2-1 Man of the Match voting for Keysborough District FC',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'KDFC MOTM',
  },
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#c01e1e',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <ServiceWorkerSetup />
        {children}
      </body>
    </html>
  )
}
