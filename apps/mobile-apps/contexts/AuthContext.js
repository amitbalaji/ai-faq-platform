import React, { createContext, useContext, useState, useEffect } from "react"
import { decodeToken, setToken, clearToken, loadStoredToken, isTokenExpired } from "../services/api"

const AuthContext = createContext()

export function AuthProvider({ children }) {

  const [user, setUser] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initAuth()
  }, [])

  async function initAuth() {

    const token = await loadStoredToken()

    if (!token || isTokenExpired(token)) {
      await clearToken()
      setUser(null)
      setIsAuthenticated(false)
      setLoading(false)
      return
    }

    const decoded = decodeToken(token)

    setUser(decoded)
    setIsAuthenticated(true)
    setLoading(false)
  }

  async function login(token) {

    await setToken(token)

    const decoded = decodeToken(token)

    setUser(decoded)
    setIsAuthenticated(true)
  }

  async function logout() {

    await clearToken();
  setUser(null);
  setIsAuthenticated(false);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        loading,
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}