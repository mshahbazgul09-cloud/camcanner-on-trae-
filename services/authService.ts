
export interface User {
  id: string;
  email: string;
}

const API_URL = '/api/auth';

export const login = async (email: string, password: string): Promise<User> => {
  const res = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  
  localStorage.setItem('token', data.token);
  return data.user;
};

export const register = async (email: string, password: string): Promise<User> => {
  const res = await fetch(`${API_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  
  localStorage.setItem('token', data.token);
  return data.user;
};

export const logout = () => {
  localStorage.removeItem('token');
};

export const getCurrentUser = async (): Promise<User | null> => {
  const token = localStorage.getItem('token');
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      return data.user;
    } else {
      localStorage.removeItem('token'); // Invalid token
      return null;
    }
  } catch (e) {
    return null;
  }
};
