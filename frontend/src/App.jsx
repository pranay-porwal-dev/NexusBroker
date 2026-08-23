import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { WebSocketProvider } from "./contexts/WebSocketContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import { ToastContainer, OrderWatcher } from "./components/Toast";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import TradePage from "./pages/TradePage";
import OrdersPage from "./pages/OrdersPage";
import WalletPage from "./pages/WalletPage";

export default function App() {
  return (
    <BrowserRouter>
    <ThemeProvider>
      <AuthProvider>
        <WebSocketProvider>
          <ToastContainer/>
          <OrderWatcher/>
          <Routes>
            {/* Public */}
            <Route path="/login"    element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected */}
            <Route path="/" element={
              <ProtectedRoute><HomePage /></ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute><DashboardPage /></ProtectedRoute>
            } />
            <Route path="/trade/:symbol" element={
              <ProtectedRoute><TradePage /></ProtectedRoute>
            } />
            <Route path="/trade" element={<Navigate to="/" replace />} />
            <Route path="/orders" element={
              <ProtectedRoute><OrdersPage /></ProtectedRoute>
            } />
            <Route path="/wallet" element={
              <ProtectedRoute><WalletPage /></ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </WebSocketProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}