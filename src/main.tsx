import './bridge'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App, { type ShellRole } from './App'
import './index.css'
import './native.css'

const roleParam = new URLSearchParams(window.location.search).get('role')
const role: ShellRole =
  roleParam === 'ribbon'
    ? 'ribbon'
    : roleParam === 'player'
    ? 'player'
    : roleParam === 'edge'
    ? 'edge'
    : roleParam === 'downloads'
    ? 'downloads'
    : 'pane'

document.documentElement.dataset.role = role
// Tab look: 'binder' draws the ribbon as coloured divider tabs; remove for the classic strip.
document.documentElement.dataset.tabStyle = 'binder'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App role={role} />
  </React.StrictMode>,
)
