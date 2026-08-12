import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { TabPermissionKey, hasModuleAccess, perfilPermissoes } from "@/data/usersData";
import { API_URL } from "@/lib/apiBaseUrl";

export interface SystemUser {
  id: string;
  nome: string;
  email: string;
  perfil: string; // ADMIN | GERENTE | OPERADOR
  ativo: boolean;
}

interface AuthContextType {
  currentUser: SystemUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, senha: string) => Promise<{ error: string | null }>;
  logout: () => void;
  canAccess: (permission: TabPermissionKey) => boolean;
  hasModule: (module: 'pedidos' | 'estoque' | 'clientes' | 'financeiro' | 'custos' | 'gestao' | 'whatsapp') => boolean;
}

const authContextGlobal = globalThis as typeof globalThis & {
  __barracaoAuthContext?: ReturnType<typeof createContext<AuthContextType | undefined>>;
};

const AuthContext =
  authContextGlobal.__barracaoAuthContext ??
  (authContextGlobal.__barracaoAuthContext = createContext<AuthContextType | undefined>(undefined));

AuthContext.displayName = "AuthContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<SystemUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Verificar token salvo ao carregar
  useEffect(() => {
    const token = localStorage.getItem("barracao_token");
    if (!token) {
      setIsLoading(false);
      return;
    }
    // Validar token com o backend
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Token inválido");
        return res.json();
      })
      .then((user: SystemUser) => {
        setCurrentUser(user);
      })
      .catch(() => {
        localStorage.removeItem("barracao_token");
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, senha: string): Promise<{ error: string | null }> => {
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || "Erro ao fazer login." };
      localStorage.setItem("barracao_token", data.token);
      setCurrentUser(data.user);
      return { error: null };
    } catch {
      return { error: "Erro de conexão com o servidor." };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("barracao_token");
    setCurrentUser(null);
  }, []);

  const canAccess = useCallback(
    (permission: TabPermissionKey) => {
      if (!currentUser) return false;
      const permissoes = perfilPermissoes[currentUser.perfil] ?? [];
      return permissoes.includes(permission);
    },
    [currentUser]
  );

  const hasModule = useCallback(
    (module: 'pedidos' | 'estoque' | 'clientes' | 'financeiro' | 'custos' | 'gestao' | 'whatsapp') => {
      if (!currentUser) return false;
      const permissoes = perfilPermissoes[currentUser.perfil] ?? [];
      return hasModuleAccess(permissoes, module);
    },
    [currentUser]
  );

  return (
    <AuthContext.Provider value={{
      currentUser,
      isAuthenticated: !!currentUser,
      isLoading,
      login,
      logout,
      canAccess,
      hasModule,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
