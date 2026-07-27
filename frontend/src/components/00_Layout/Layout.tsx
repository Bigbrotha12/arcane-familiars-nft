import { Outlet } from 'react-router-dom'
import Nav from '../layout/Nav'
import Footer from '../layout/Footer'

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-primary">
      <Nav />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
