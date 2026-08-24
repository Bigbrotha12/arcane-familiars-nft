import { Outlet } from 'react-router-dom'
import Nav from '@/components/layout/Nav'

export default function PlayLayout() {
  return (
    <div className="h-screen flex flex-col bg-surface-primary overflow-hidden">
      <Nav />
      <main className="flex-1 flex flex-col min-h-0">
        <Outlet />
      </main>
    </div>
  )
}
