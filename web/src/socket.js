import { io } from 'socket.io-client'
import { resolveApiBase, getApiBaseSync } from './api.js'
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
    const initialBase = getApiBaseSync()
    socket = io(initialBase, {
      auth: { token },
      query: { userId, uid },
      autoConnect: true,
      reconnection: true,
      transports: ['websocket'],
      path: '/socket.io',
    })
    // Re-resolve base and reconnect if needed
    resolveApiBase().then((base) => {
      try {
        if (base && socket?.io?.uri && socket.io.uri !== base) {
          socket.disconnect()
          socket = io(base, {
            auth: { token },
            query: { userId, uid },
            autoConnect: true,
            reconnection: true,
            transports: ['websocket'],
            path: '/socket.io',
          })
        }
      } catch {}
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
