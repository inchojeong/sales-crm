import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthGate } from './auth'
import { CrmProvider } from './store'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <CrmProvider>
        <App />
      </CrmProvider>
    </AuthGate>
  </StrictMode>,
)
