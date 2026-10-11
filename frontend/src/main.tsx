import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './tokens.css'
import './components.css'
import './index.css'
import App from './App.tsx'
// ponytail: 管理頁拆成獨立 chunk，Tailwind/shadcn 只在 /admin 載入
const Admin = lazy(() => import('./Admin.tsx'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>{location.pathname.startsWith('/admin') ? <Suspense><Admin /></Suspense> : <App />}</StrictMode>,
)
