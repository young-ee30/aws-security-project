import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Agentation } from 'agentation'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      {import.meta.env.DEV && <Agentation />}
    </BrowserRouter>
  </React.StrictMode>,
)
