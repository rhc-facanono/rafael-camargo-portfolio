import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from './components/ThemeProvider'
import { TuningProvider } from './context/TuningContext' // <-- IMPORTAMOS O MOTOR AQUI
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light" storageKey="rafael-portfolio-theme">
      {/* ABRAÇAMOS O APP COM O MOTOR DE AFINAÇÃO */}
      <TuningProvider>
        <App />
      </TuningProvider>
    </ThemeProvider>
  </StrictMode>,
)