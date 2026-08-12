import { useAuth } from "@/contexts/AuthContext";
import { useComercialNew } from "@/contexts/ComercialNewContext";
import { useMemo } from "react";

/**
 * Maps the authenticated user to a closer ID and provides
 * filtered data based on the user's profile restrictions.
 * 
 * - Admins see everything.
 * - Closers with `apenasLeadsAtribuidos` only see their own data.
 */
export function useCloserIsolation() {
  const { currentUser, currentProfile } = useAuth();
  const ctx = useComercialNew();

  const isRestricted = currentProfile.apenasLeadsAtribuidos;

  // Map auth user to closer by direct ID lookup
  const myCloserId = useMemo(() => {
    if (!isRestricted) return null;
    return currentUser.closerId ?? null;
  }, [isRestricted, currentUser.closerId]);

  // Filtered leads
  const leads = useMemo(() => {
    if (!isRestricted || !myCloserId) return ctx.leads;
    return ctx.leads.filter((l) => l.closerId === myCloserId);
  }, [ctx.leads, isRestricted, myCloserId]);

  // Filtered clients
  const clientes = useMemo(() => {
    if (!isRestricted || !myCloserId) return ctx.clientes;
    return ctx.clientes.filter((c) => c.closerId === myCloserId);
  }, [ctx.clientes, isRestricted, myCloserId]);

  // Filtered closers (closer only sees themselves)
  const closers = useMemo(() => {
    if (!isRestricted || !myCloserId) return ctx.closers;
    return ctx.closers.filter((c) => c.id === myCloserId);
  }, [ctx.closers, isRestricted, myCloserId]);

  // Filtered tasks
  const tasks = useMemo(() => {
    if (!isRestricted || !myCloserId) return ctx.tasks;
    return ctx.tasks.filter((t) => {
      const responsavel = ctx.closers.find(
        (c) => c.id === t.responsavelId || c.profileId === t.responsavelId
      );
      const pertenceAoMeuPipeline =
        (t.vinculoTipo === "lead" && ctx.leads.some((l) => l.id === t.vinculoId && l.closerId === myCloserId)) ||
        (t.vinculoTipo === "cliente" && ctx.clientes.some((c) => c.id === t.vinculoId && c.closerId === myCloserId));

      return pertenceAoMeuPipeline || responsavel?.id === myCloserId;
    });
  }, [ctx.tasks, ctx.leads, ctx.clientes, ctx.closers, isRestricted, myCloserId]);

  return {
    ...ctx,
    leads,
    clientes,
    closers,
    tasks,
    isRestricted,
    myCloserId,
  };
}
