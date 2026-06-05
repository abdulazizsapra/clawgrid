import fs from 'fs'
import path from 'path'
import { DocsViewer } from '@/components/docs/DocsViewer'

export default function DocsPage() {
  const md = fs.readFileSync(path.join(process.cwd(), 'ONBOARDING.md'), 'utf-8')
  return <DocsViewer markdown={md} />
}
