import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ServiceWorkerSetup from '@/components/ServiceWorkerSetup'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'KDFC Fan Zone',
  description: 'Keysborough District FC — Fan Zone',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'KDFC Fan Zone',
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
      <body className={inter.className}>
        <ServiceWorkerSetup />
        {children}
      </body>
    </html>
  )
}
