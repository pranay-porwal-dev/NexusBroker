import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "../hooks/useApi";

const AuthContext = createContext(null);

export function AuthProvider({children}){
    const [user,setUser] = useState(null);
    const [authLoading, setAuthLoading] =useState(true);

    useEffect(()=>{
        const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

        fetch(`${API}/auth/me`, { credentials: 'include' })
          .then(async res => {
            if (res.status !== 401) {
              setUser({ verified: true });
              return;
            }
            const refreshRes = await fetch(`${API}/auth/refresh`, {
              method: 'POST',
              credentials: 'include',
            });
            if (refreshRes.ok) {
              setUser({ verified: true }); 
            } else {
              setUser(null); 
            }
          })
          .catch(() => setUser(null))
          .finally(() => setAuthLoading(false));
        },[]);

    const login = async(email,password) => {
        await apiFetch('/auth/login',{
            method: 'POST',
            body: JSON.stringify({email,password}),
        });
        setUser({verified: true});
    };

    const logout = async()=>{
        await apiFetch('/auth/logout',{method: 'POST'});
        setUser(null);
    };

    return(
        <AuthContext.Provider value={{user, authLoading, login, logout}}>
            {children}
        </AuthContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);