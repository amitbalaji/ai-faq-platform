import { jwtDecode } from 'jwt-decode';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = "http://localhost:4000"
const TOKEN_KEY = '@auth_token';

let TOKEN = null

// CHANGE: Made setToken async to properly handle AsyncStorage
export async function setToken(t) {
  TOKEN = t;
  if (t) {
    await AsyncStorage.setItem(TOKEN_KEY, t);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

export function getToken(){
  return TOKEN
}

export async function loadStoredToken() {
  try {
    const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      TOKEN = storedToken;
      return storedToken;
    }
    return null;
  } catch (error) {
    console.error('Error loading stored token:', error);
    return null;
  }
}

// CHANGE: Ensure clearToken removes from both memory and storage
export async function clearToken() {
  TOKEN = null;
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
    console.log('Token cleared successfully'); // CHANGE: Added logging
  } catch (error) {
    console.error('Error clearing token:', error);
  }
}

export function isTokenExpired(token) {
  try {
    const decoded = jwtDecode(token);
    const currentTime = Date.now() / 1000;
    return decoded.exp < currentTime;
  } catch (error) {
    console.error('Error checking token expiration:', error);
    return true;
  }
}

export function decodeToken(token) {
  try {
    const decoded = jwtDecode(token);
    return {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role,
      iat: decoded.iat,
      exp: decoded.exp,
    };
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
}

async function request(path,options={}){

const res = await fetch(BASE+path,{
...options,
headers:{
"Content-Type":"application/json",
Authorization: TOKEN ? `Bearer ${TOKEN}` : "",
...(options.headers||{})
}
})

return res.json()
}

export const api={

signup:(data)=>
request("/auth/signup",{
method:"POST",
body:JSON.stringify(data)
}),

login:(email,password)=>
request("/auth/login",{
method:"POST",
body:JSON.stringify({email,password})
}),

chat:(query,conversationId)=>
request("/chat",{
method:"POST",
body:JSON.stringify({query, conversationId})
}),

upload:(fileName)=>
request("/documents",{
method:"POST",
body:JSON.stringify({fileName})
}),

faqs:()=>request("/faqs")

}