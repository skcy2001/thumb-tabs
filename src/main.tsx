import './bridge'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App, { type ShellRole } from './App'
import './index.css'
import './themes.css'
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
// Defaults until the first state arrives; the bridge then applies the saved look.
document.documentElement.dataset.theme = 'cocoa'
document.documentElement.dataset.tabStyle = 'binder'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App role={role} />
  </React.StrictMode>,
)
