import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import 'leaflet/dist/leaflet.css'
import '@/presentation/theme/global.css'
import '@/presentation/components/ui.css'

import { App } from '@/presentation/app/App'

const root = document.getElementById('root')
if (!root) throw new Error('No existe el elemento #root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
