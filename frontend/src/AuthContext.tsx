import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from './lib/db.ts';
import { API_ENDPOINTS, fetchWithAuth } from './lib/api.ts';

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, email: string, password: string, displayName?: string) => Promise<void>;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('access_token'));
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (token) {
            // Fetch current user
            fetchWithAuth(API_ENDPOINTS.me)
                .then((userData) => {
                    setUser({
                        ...userData,
                        created_at: new Date(userData.created_at),
                        last_seen: new Date(userData.last_seen),
                    });
                })
                .catch(() => {
                    // Token might be invalid
                    localStorage.removeItem('access_token');
                    setToken(null);
                })
                .finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    }, [token]);

    const login = async (username: string, password: string) => {
        const response = await fetch(API_ENDPOINTS.login, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Login failed');
        }

        const data = await response.json();
        localStorage.setItem('access_token', data.access_token);
        setToken(data.access_token);
    };

    const register = async (username: string, email: string, password: string, displayName?: string) => {
        const response = await fetch(API_ENDPOINTS.register, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password, display_name: displayName }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Registration failed');
        }

        // Auto-login after registration
        await login(username, password);
    };

    const logout = () => {
        localStorage.removeItem('access_token');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, register, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}
