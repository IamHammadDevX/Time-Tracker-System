import { io } from 'socket.io-client'

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'
let socket = null

function parseToken(token) {
  try {
    const p = JSON.parse(atob((token || '').split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))
    return {
      userId: p?.email || p?.userId || '',
      uid: p?.uid || ''
    }
  } catch {
    return { userId: '', uid: '' }
  }
}

export function getSocket() {
  const token = localStorage.getItem('token') || ''
  const { userId, uid } = parseToken(token)

  if (!socket) {
    socket = io(API, {
      auth: { token },
      query: { userId, uid },
      autoConnect: true,
      reconnection: true,
    })
  } else {
    // update auth on the existing socket in case token changed
    socket.auth = { token }
  }

  return socket
}

export function disconnectSocket() {
  if (socket) socket.disconnect()
}