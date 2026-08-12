// Permissões por aba — Barracão Gourmet
export type TabPermissionKey =
  // Módulo Pedidos
  | 'aba_pedidos_pipeline'
  | 'aba_pedidos_novo'
  | 'aba_pedidos_historico'
  | 'aba_pedidos_operacional'
  | 'aba_pedidos_entrega'
  | 'aba_pedidos_kpis'
  // Módulo Estoque
  | 'aba_estoque_produtos'
  | 'aba_estoque_movimentacoes'
  | 'aba_estoque_alertas'
  | 'aba_estoque_categorias'
  // Módulo Clientes
  | 'aba_clientes_base'
  | 'aba_clientes_detalhe'
  | 'aba_clientes_recorrencia'
  | 'aba_clientes_interacoes'
  // Módulo Financeiro
  | 'aba_financeiro_visao'
  | 'aba_financeiro_lancamentos'
  // Módulo Custos
  | 'aba_custos_painel'
  | 'aba_custos_produtos'
  // Módulo Gestão
  | 'aba_gestao_dashboard'
  | 'aba_gestao_clientes'
  | 'aba_gestao_financeira'
  | 'aba_gestao_projecao'
  | 'aba_gestao_kpis'
  | 'aba_gestao_automacoes'
  | 'aba_gestao_configuracoes'
  // Módulo WhatsApp
  | 'aba_whatsapp_atendimentos';

export type PermissionKey = TabPermissionKey;

export interface TabPermissionGroup {
  module: string;
  label: string;
  permissions: { key: TabPermissionKey; label: string }[];
}

export const permissionGroups: TabPermissionGroup[] = [
  {
    module: 'pedidos',
    label: 'Pedidos',
    permissions: [
      { key: 'aba_pedidos_pipeline',    label: 'Pipeline de Pedidos' },
      { key: 'aba_pedidos_novo',        label: 'Novo Pedido' },
      { key: 'aba_pedidos_historico',   label: 'Histórico' },
      { key: 'aba_pedidos_operacional', label: 'Painel Operacional' },
      { key: 'aba_pedidos_entrega',     label: 'Controle de Entrega' },
      { key: 'aba_pedidos_kpis',        label: 'KPIs de Pedidos' },
    ],
  },
  {
    module: 'estoque',
    label: 'Estoque',
    permissions: [
      { key: 'aba_estoque_produtos',      label: 'Produtos' },
      { key: 'aba_estoque_categorias',    label: 'Por Categoria' },
      { key: 'aba_estoque_movimentacoes', label: 'Movimentações' },
      { key: 'aba_estoque_alertas',       label: 'Alertas de Estoque' },
    ],
  },
  {
    module: 'clientes',
    label: 'Clientes',
    permissions: [
      { key: 'aba_clientes_base',        label: 'Base de Clientes' },
      { key: 'aba_clientes_recorrencia', label: 'Recorrência' },
      { key: 'aba_clientes_interacoes',  label: 'Interações' },
    ],
  },
  {
    module: 'financeiro',
    label: 'Financeiro',
    permissions: [
      { key: 'aba_financeiro_visao',       label: 'Visão Geral' },
      { key: 'aba_financeiro_lancamentos',  label: 'Lançamentos' },
    ],
  },
  {
    module: 'custos',
    label: 'Custos',
    permissions: [
      { key: 'aba_custos_painel',   label: 'Painel de Custos' },
      { key: 'aba_custos_produtos', label: 'Produtos por Custo' },
    ],
  },
  {
    module: 'gestao',
    label: 'Gestão',
    permissions: [
      { key: 'aba_gestao_dashboard',     label: 'Dashboard Executivo' },
      { key: 'aba_gestao_clientes',      label: 'Clientes Ativos' },
      { key: 'aba_gestao_financeira',    label: 'Gestão Financeira' },
      { key: 'aba_gestao_projecao',      label: 'Projeção' },
      { key: 'aba_gestao_kpis',          label: 'KPIs & Indicadores' },
      { key: 'aba_gestao_automacoes',    label: 'Automações' },
      { key: 'aba_gestao_configuracoes', label: 'Configurações' },
    ],
  },
  {
    module: 'whatsapp',
    label: 'WhatsApp',
    permissions: [
      { key: 'aba_whatsapp_atendimentos', label: 'Atendimentos' },
    ],
  },
];

export const allPermissionKeys: TabPermissionKey[] = permissionGroups.flatMap(g =>
  g.permissions.map(p => p.key)
);

export function hasModuleAccess(
  permissoes: TabPermissionKey[],
  module: 'pedidos' | 'estoque' | 'clientes' | 'financeiro' | 'custos' | 'gestao' | 'whatsapp'
): boolean {
  const group = permissionGroups.find(g => g.module === module);
  if (!group) return false;
  return group.permissions.some(p => permissoes.includes(p.key));
}

// Permissões por perfil
export const perfilPermissoes: Record<string, TabPermissionKey[]> = {
  ADMIN: [...allPermissionKeys],
  GERENTE: [
    'aba_pedidos_pipeline', 'aba_pedidos_novo', 'aba_pedidos_historico',
    'aba_pedidos_operacional', 'aba_pedidos_entrega', 'aba_pedidos_kpis',
    'aba_estoque_produtos', 'aba_estoque_categorias', 'aba_estoque_movimentacoes', 'aba_estoque_alertas',
    'aba_clientes_base', 'aba_clientes_recorrencia', 'aba_clientes_interacoes',
    'aba_financeiro_visao', 'aba_financeiro_lancamentos',
    'aba_custos_painel', 'aba_custos_produtos',
    'aba_gestao_dashboard', 'aba_gestao_clientes', 'aba_gestao_financeira', 'aba_gestao_projecao',
    'aba_gestao_kpis', 'aba_gestao_configuracoes',
    'aba_whatsapp_atendimentos',
  ],
  OPERADOR: [
    'aba_pedidos_pipeline', 'aba_pedidos_novo', 'aba_pedidos_operacional', 'aba_pedidos_entrega',
    'aba_estoque_produtos', 'aba_estoque_alertas',
    'aba_clientes_base',
    'aba_gestao_configuracoes',
    'aba_whatsapp_atendimentos',
  ],
};
