import React, { createContext, useContext, useState, useEffect } from "react"
import { setTokens, clearTokens, loadStoredTokens, isTokenExpired, decodeToken, api, refreshAccessToken } from "../services/api"

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initAuth()
  }, [])

  async function initAuth() {
    try {
      const tokens = await loadStoredTokens()

      if (!tokens || !tokens.accessToken || !tokens.refreshToken) {
        await clearTokens()
        setUser(null)
        setIsAuthenticated(false)
        setLoading(false)
        return
      }

      // CHANGE: Check if access token is expired
      if (isTokenExpired(tokens.accessToken)) {
        try {
          // CHANGE: Attempt to refresh token
          const refreshResponse = await refreshAccessToken()
          if (refreshResponse.error) {
            throw new Error(refreshResponse.error)
          }
          
          // CHANGE: Update tokens with new ones
          await setTokens(refreshResponse.accessToken, refreshResponse.refreshToken)
          const decoded = decodeToken(refreshResponse.accessToken)
          setUser(decoded)
          setIsAuthenticated(true)
        } catch (error) {
          console.error('Token refresh failed during init:', error)
          await clearTokens()
          setUser(null)
          setIsAuthenticated(false)
        }
      } else {
        // CHANGE: Use existing valid token
        const decoded = decodeToken(tokens.accessToken)
        setUser(decoded)
        setIsAuthenticated(true)
      }
    } catch (error) {
      console.error('Auth initialization error:', error)
      await clearTokens()
      setUser(null)
      setIsAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }

  async function login(email, password) {
    try {
      const response = await api.login(email, password)
      
      if (response.error) {
        throw new Error(response.error)
      }

      // CHANGE: Handle new token structure from auth service
      const { accessToken, refreshToken } = response
      
      if (!accessToken || !refreshToken) {
        throw new Error('Invalid response: missing tokens')
      }

      await setTokens(accessToken, refreshToken)
      const decoded = decodeToken(accessToken)
      
      setUser(decoded)
      setIsAuthenticated(true)
      
      return { success: true }
    } catch (error) {
      console.error('Login error:', error)
      return { error: error.message }
    }
  }

  async function signup(signupData) {
    try {
      const response = await api.signup(signupData)
      
      if (response.error) {
        throw new Error(response.error)
      }

      // CHANGE: Handle new token structure from auth service
      const { accessToken, refreshToken } = response
      
      if (!accessToken || !refreshToken) {
        throw new Error('Invalid response: missing tokens')
      }

      await setTokens(accessToken, refreshToken)
      const decoded = decodeToken(accessToken)
      
      setUser(decoded)
      setIsAuthenticated(true)
      
      return { success: true, data: response }
    } catch (error) {
      console.error('Signup error:', error)
      return { error: error.message }
    }
  }

  async function logout() {
    try {
      // CHANGE: Call logout API to invalidate refresh token on server
      await api.logout()
    } catch (error) {
      console.error('Logout API call failed:', error)
    } finally {
      // CHANGE: Always clear local state regardless of API call result
      await clearTokens()
      setUser(null)
      setIsAuthenticated(false)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        loading,
        login,
        signup,
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