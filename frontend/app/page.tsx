import Dashboard from '@/app/components/Dashboard' // Import the component

export default async function Home() {
  // Middleware handles auth check
  return (
    <main className="min-h-screen bg-gray-50">
      <Dashboard /> {/* Render the dashboard */}
    </main>
  )
}