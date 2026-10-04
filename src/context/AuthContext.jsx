import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../createClient";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [roleLevel, setRoleLevel] = useState(null);
  const [branch, setBranch] = useState(null);
  const [staffId, setStaffId] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null); // NEW
  const [loading, setLoading] = useState(true);

  async function fetchRole(userId) {
    const { data, error } = await supabase.rpc("user_info");
    console.log("Fetched role data:", data);

    if (error) {
      console.error("Failed to load profile:", error.message);
      setRole(null);
      setRoleLevel(null);
      setBranch(null);
      setStaffId(null);
      setAvatarUrl(null); // NEW
      setLoading(false);
      return;
    }

    setRole(data?.roles || null);
    setRoleLevel(data?.role_level ?? null);
    setBranch(data?.branch || null);
    setStaffId(data?.staff_id || null);
    setAvatarUrl(data?.avatar_url || null); // NEW
    setLoading(false);
  }

  useEffect(() => {
    async function loadSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        fetchRole(user.id);
      } else {
        setLoading(false);
      }
    }
    loadSession();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
    setRoleLevel(null);
    setBranch(null);
    setStaffId(null);
    setAvatarUrl(null); // NEW
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        roleLevel,
        branch,
        staffId,
        avatarUrl, // NEW
        setAvatarUrl, // NEW
        setUser,
        fetchRole,
        loading,
        setLoading,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);