import { Outlet } from 'react-router-dom'
import Nav from '@/components/layout/Nav'

export default function PlayLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-primary">
      <Nav />
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
    </div>
  )
}
