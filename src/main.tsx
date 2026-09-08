import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BiliupProvider } from './components/BiliupProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BiliupProvider><App /></BiliupProvider>
  </StrictMode>,
)
