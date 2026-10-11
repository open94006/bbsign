import { lazy, StrictMode, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { createRoot } from 'react-dom/client'
import './tokens.css'
import './components.css'
import './index.css'
import App from './App.tsx'

// ponytail: 依路徑挑頁面，每頁一個 chunk（管理頁的 Tailwind/shadcn 只在 /admin 載入）；要巢狀路由或路徑參數時再換 router
const PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  '/admin': lazy(() => import('./Admin.tsx')),
  '/weather': lazy(() => import('./weather/WeatherPage.tsx')),
  '/pace': lazy(() => import('./pace/PacePage.tsx')),
  '/tools': lazy(() => import('./tools/ToolsPage.tsx')),
  '/tools/badminton': lazy(() => import('./tools/Badminton.tsx')),
  '/tools/convert': lazy(() => import('./tools/Converter.tsx')),
}
const path = location.pathname.replace(/\/+$/, '')
const Page = PAGES[path.startsWith('/admin') ? '/admin' : path]

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {Page ? (
      <Suspense>
        <Page />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
