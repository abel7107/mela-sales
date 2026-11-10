import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { LoadingBlock } from './components/ui'
import { BusinessesPage } from './pages/BusinessesPage'
import { CustomersPage } from './pages/CustomersPage'
import { DashboardPage } from './pages/DashboardPage'
import { InstallmentsPage } from './pages/InstallmentsPage'
import { DevLoginPage } from './pages/DevLoginPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { ProductsPage } from './pages/ProductsPage'
import { ReportsPage } from './pages/ReportsPage'
import { SaleDetailPage } from './pages/SaleDetailPage'
import { SalesListPage } from './pages/SalesListPage'
import { SaleNewPage } from './pages/SaleNewPage'
import { SettingsPage } from './pages/SettingsPage'

function RequireAuth() {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return <Outlet />
}

function RequireBusiness() {
  const { token, business, loading } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (loading) return <LoadingBlock label="Loading businesses…" />
  if (!business) return <Navigate to="/businesses" replace />
  return <Outlet />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/dev" element={<DevLoginPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/businesses" element={<BusinessesPage />} />

          <Route element={<RequireBusiness />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/sales" element={<SalesListPage />} />
              <Route path="/sales/new" element={<SaleNewPage />} />
              <Route path="/sales/:saleId" element={<SaleDetailPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/installments" element={<InstallmentsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
