import { useAuth } from "../contexts/AuthContext"
import {Navigate} from "react-router-dom";

export default function ProtectedRoute({children}){
    const {user, authLoading} = useAuth();

    if(authLoading) return <div>Loading...</div>
    if(!user) return <Navigate to="/login" replace />;
    return children;
}