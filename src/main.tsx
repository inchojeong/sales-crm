import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthGate } from './auth'
import { BusinessProvider } from './business'
import { DirectoryProvider } from './directory'
import { CrmProvider } from './store'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <CrmProvider>
        <DirectoryProvider>
          <BusinessProvider>
            <App />
          </BusinessProvider>
        </DirectoryProvider>
      </CrmProvider>
    </AuthGate>
  </StrictMode>,
)
