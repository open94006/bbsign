import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './tokens.css'
import './components.css'
import './index.css'
import App from './App.tsx'
import Admin from './Admin.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{location.pathname.startsWith('/admin') ? <Admin /> : <App />}</StrictMode>,
)
