import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { TabPermissionKey } from "@/data/usersData";

interface ProtectedRouteProps {
  permission?: TabPermissionKey;
  children: React.ReactNode;
}

export function ProtectedRoute({ permission, children }: ProtectedRouteProps) {
  const { canAccess, hasModule } = useAuth();

  if (permission && !canAccess(permission)) {
    const fallback = hasModule('pedidos')
      ? '/pedidos'
      : hasModule('estoque')
        ? '/estoque/produtos'
        : hasModule('clientes')
          ? '/clientes'
          : hasModule('financeiro')
            ? '/financeiro'
            : hasModule('custos')
              ? '/custos'
              : '/gestao/dashboard';
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
