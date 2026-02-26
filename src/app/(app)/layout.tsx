import Sidebar from "../components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-0 md:ml-16 transition-all duration-300">
        {children}
      </main>
    </div>
  );
}
