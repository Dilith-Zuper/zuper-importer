'use client'
import { useWizardStore } from '@/store/wizard-store'
import { WizardShell } from '@/components/wizard/WizardShell'
import { Landing } from '@/components/Landing'
import { RemapShell } from '@/components/remap/RemapShell'

export default function Home() {
  const mode = useWizardStore(s => s.mode)
  if (mode === 'import') return <WizardShell />
  if (mode === 'remap') return <RemapShell />
  return <Landing />
}
