import type { Metadata } from 'next'
import './globals.css'
import { ThemeLoader } from '@/components/ThemeLoader'

export const metadata: Metadata = {
  title: 'ClawGrid',
  description: 'Fleet management for OpenClaw AI agent instances',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning><ThemeLoader />{children}</body>
    </html>
  )
}
