import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/hooks/useApi";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, LogOut, Bot, Key, Wifi, WifiOff, QrCode, Trash2, RefreshCw, Copy, Store, Ticket, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

export default function ConfiguracoesPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const aba = searchParams.get("aba") || "perfil";
  const { currentUser } = useAuth();

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Configurações</h1>
      <Tabs value={aba} onValueChange={(v) => navigate(`/configuracoes?aba=${v}`, { replace: true })}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="perfil">Meu Perfil</TabsTrigger>
          {currentUser?.perfil === "ADMIN" && <TabsTrigger value="usuarios">Usuários</TabsTrigger>}
          {currentUser?.perfil === "ADMIN" && <TabsTrigger value="entregadores">Entregadores</TabsTrigger>}
          {currentUser?.perfil === "ADMIN" && <TabsTrigger value="cardapio">Cardápio</TabsTrigger>}
          {currentUser?.perfil === "ADMIN" && <TabsTrigger value="loja">Loja</TabsTrigger>}
          {currentUser?.perfil === "ADMIN" && <TabsTrigger value="cupons">Cupons</TabsTrigger>}
          {currentUser?.perfil === "ADMIN" && <TabsTrigger value="ia">Agentes IA</TabsTrigger>}
          {currentUser?.perfil === "ADMIN" && <TabsTrigger value="openai">Chave OpenAI</TabsTrigger>}
        </TabsList>
        <TabsContent value="perfil" className="mt-4"><PerfilTab /></TabsContent>
        {currentUser?.perfil === "ADMIN" && <TabsContent value="usuarios" className="mt-4"><UsuariosTab /></TabsContent>}
        {currentUser?.perfil === "ADMIN" && <TabsContent value="entregadores" className="mt-4"><EntregadoresTab /></TabsContent>}
        {currentUser?.perfil === "ADMIN" && <TabsContent value="cardapio" className="mt-4"><CardapioConfigTab /></TabsContent>}
        {currentUser?.perfil === "ADMIN" && <TabsContent value="loja" className="mt-4"><LojaTab /></TabsContent>}
        {currentUser?.perfil === "ADMIN" && <TabsContent value="cupons" className="mt-4"><CuponsTab /></TabsContent>}
        {currentUser?.perfil === "ADMIN" && <TabsContent value="ia" className="mt-4"><AgentesIATab /></TabsContent>}
        {currentUser?.perfil === "ADMIN" && <TabsContent value="openai" className="mt-4"><OpenAIConfigTab /></TabsContent>}
      </Tabs>
    </div>
  );
}

// ===== ABA PERFIL =====
function PerfilTab() {
  const { currentUser, logout } = useAuth();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");

  const alterarSenha = useMutation({
    mutationFn: () => api.post("/api/usuarios/senha", { senhaAtual, novaSenha }),
    onSuccess: () => {
      toast.success("Senha alterada com sucesso");
      setSenhaAtual(""); setNovaSenha(""); setConfirmar("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Dados do Usuário</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold">
              {currentUser?.nome.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <p className="font-semibold text-lg">{currentUser?.nome}</p>
              <p className="text-sm text-muted-foreground">{currentUser?.email}</p>
              <Badge variant="outline" className="mt-1">{currentUser?.perfil}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Alterar Senha</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><Label>Senha atual</Label><Input type="password" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} /></div>
          <div className="space-y-1"><Label>Nova senha</Label><Input type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} /></div>
          <div className="space-y-1"><Label>Confirmar nova senha</Label><Input type="password" value={confirmar} onChange={e => setConfirmar(e.target.value)} /></div>
          <Button
            onClick={() => alterarSenha.mutate()}
            disabled={!senhaAtual || !novaSenha || novaSenha !== confirmar || alterarSenha.isPending}
          >
            {novaSenha && confirmar && novaSenha !== confirmar ? "Senhas não coincidem" : "Alterar Senha"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <Button variant="destructive" onClick={logout} className="w-full">
            <LogOut className="h-4 w-4 mr-2" />
            Sair do sistema
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== ABA USUÁRIOS =====
function UsuariosTab() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [form, setForm] = useState({ nome: "", email: "", senha: "", perfil: "OPERADOR", ativo: true });

  const { data: usuarios = [] } = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => api.get<any[]>("/api/usuarios"),
  });

  const criar = useMutation({
    mutationFn: (data: any) => api.post("/api/usuarios", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["usuarios"] }); toast.success("Usuário criado"); fecharModal(); },
    onError: (err: any) => toast.error(err.message),
  });

  const atualizar = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/api/usuarios/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["usuarios"] }); toast.success("Usuário atualizado"); fecharModal(); },
    onError: (err: any) => toast.error(err.message),
  });

  const fecharModal = () => { setModalOpen(false); setEditando(null); setForm({ nome: "", email: "", senha: "", perfil: "OPERADOR", ativo: true }); };
  const abrirEditar = (u: any) => { setEditando(u); setForm({ nome: u.nome, email: u.email, senha: "", perfil: u.perfil, ativo: u.ativo }); setModalOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{usuarios.length} usuários cadastrados</p>
        <Button size="sm" onClick={() => { setEditando(null); setForm({ nome: "", email: "", senha: "", perfil: "OPERADOR", ativo: true }); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />Novo Usuário
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nome}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell><Badge variant="outline">{u.perfil}</Badge></TableCell>
                  <TableCell><Badge className={u.ativo ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}>{u.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
                  <TableCell><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEditar(u)}><Edit className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editando ? "Editar Usuário" : "Novo Usuário"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
            <div className="space-y-1"><Label>E-mail *</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{editando ? "Nova senha (deixe em branco para manter)" : "Senha *"}</Label><Input type="password" value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))} /></div>
            <div className="space-y-1">
              <Label>Perfil *</Label>
              <Select value={form.perfil} onValueChange={v => setForm(f => ({ ...f, perfil: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="GERENTE">Gerente</SelectItem>
                  <SelectItem value="OPERADOR">Operador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editando && (
              <div className="flex items-center gap-3">
                <Switch checked={form.ativo} onCheckedChange={v => setForm(f => ({ ...f, ativo: v }))} />
                <Label>Usuário ativo</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
            <Button
              onClick={() => {
                const data: any = { nome: form.nome, email: form.email, perfil: form.perfil, ativo: form.ativo };
                if (form.senha) data.senha = form.senha;
                if (editando) atualizar.mutate({ id: editando.id, data });
                else criar.mutate({ ...data, senha: form.senha });
              }}
              disabled={!form.nome || !form.email || (!editando && !form.senha) || criar.isPending || atualizar.isPending}
            >
              {editando ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== ABA ENTREGADORES =====
function EntregadoresTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ nome: "", numero: "" });
  const [editando, setEditando] = useState<any>(null);

  const { data: entregadores = [] } = useQuery({
    queryKey: ["entregadores"],
    queryFn: () => api.get<any[]>("/api/entregadores"),
  });

  const criar = useMutation({
    mutationFn: (data: { nome: string; numero: string }) => api.post("/api/entregadores", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entregadores"] });
      toast.success("Entregador cadastrado");
      setForm({ nome: "", numero: "" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const atualizar = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { nome: string; numero: string } }) => api.put(`/api/entregadores/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entregadores"] });
      toast.success("Entregador atualizado");
      setEditando(null);
      setForm({ nome: "", numero: "" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const remover = useMutation({
    mutationFn: (id: string) => api.delete(`/api/entregadores/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entregadores"] });
      toast.success("Entregador removido");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const iniciarEdicao = (entregador: any) => {
    setEditando(entregador);
    setForm({ nome: entregador.nome, numero: entregador.numero });
  };

  const cancelarEdicao = () => {
    setEditando(null);
    setForm({ nome: "", numero: "" });
  };

  const salvar = () => {
    const payload = { nome: form.nome.trim(), numero: form.numero.trim() };
    if (!payload.nome || !payload.numero) return;

    if (editando) {
      atualizar.mutate({ id: editando.id, data: payload });
      return;
    }

    criar.mutate(payload);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cadastro de Entregadores</CardTitle>
          <CardDescription>Cadastre os contatos de entregadores para uso operacional.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Nome do entregador *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                placeholder="Ex: João Motoboy"
              />
            </div>
            <div className="space-y-1">
              <Label>Número *</Label>
              <Input
                value={form.numero}
                onChange={(e) => setForm((prev) => ({ ...prev, numero: e.target.value }))}
                placeholder="Ex: (85) 99999-9999"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={salvar}
              disabled={!form.nome.trim() || !form.numero.trim() || criar.isPending || atualizar.isPending}
            >
              {editando ? "Salvar alteração" : "Cadastrar entregador"}
            </Button>
            {editando && (
              <Button variant="outline" onClick={cancelarEdicao}>
                Cancelar edição
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Entregadores cadastrados</CardTitle>
          <CardDescription>{entregadores.length} registro(s)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Número</TableHead>
                <TableHead className="w-[120px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entregadores.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                    Nenhum entregador cadastrado.
                  </TableCell>
                </TableRow>
              )}
              {entregadores.map((entregador: any) => (
                <TableRow key={entregador.id}>
                  <TableCell className="font-medium">{entregador.nome}</TableCell>
                  <TableCell>{entregador.numero}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => iniciarEdicao(entregador)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => {
                          if (confirm(`Remover entregador ${entregador.nome}?`)) remover.mutate(entregador.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== ABA AGENTES IA =====
function AgentesIATab() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ nome: "", provedor: "UZAPI", metaAccessToken: "", metaPhoneNumberId: "", metaWabaId: "" });
  const [novoNumeroGestao, setNovoNumeroGestao] = useState({ numero: "", nome: "" });

  const { data: instancias = [], isLoading } = useQuery({
    queryKey: ["instancias-ia"],
    queryFn: () => api.get<any[]>("/api/ia/instancias"),
    refetchInterval: 5000, // Polling a cada 5s para monitorar status
  });

  const { data: configIA } = useQuery({
    queryKey: ["config-ia"],
    queryFn: () => api.get<any>("/api/ia/config"),
  });

  const { data: numerosGestao = [] } = useQuery({
    queryKey: ["numeros-gestao"],
    queryFn: () => api.get<any[]>("/api/ia/numeros-gestao"),
  });

  const toggleAgente = useMutation({
    mutationFn: (ativa: boolean) => api.put("/api/ia/config", { iaAtiva: ativa }),
    onSuccess: (_data, ativa) => {
      queryClient.invalidateQueries({ queryKey: ["config-ia"] });
      toast.success(ativa ? "Agente ativado" : "Agente desativado");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const adicionarNumeroGestao = useMutation({
    mutationFn: (data: { numero: string; nome: string }) => api.post("/api/ia/numeros-gestao", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["numeros-gestao"] });
      toast.success("Número de gestão adicionado");
      setNovoNumeroGestao({ numero: "", nome: "" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const removerNumeroGestao = useMutation({
    mutationFn: (id: string) => api.delete(`/api/ia/numeros-gestao/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["numeros-gestao"] });
      toast.success("Número removido");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const criar = useMutation({
    mutationFn: (data: any) => api.post("/api/ia/instancias", data),
    onSuccess: (novaInstancia: any) => {
      queryClient.setQueryData(["instancias-ia"], (prev: any[] = []) => {
        const semDuplicado = prev.filter((inst) => inst.id !== novaInstancia?.id);
        return [novaInstancia, ...semDuplicado];
      });
      queryClient.invalidateQueries({ queryKey: ["instancias-ia"] });
      if (novaInstancia?.status === "QR_CODE" && novaInstancia?.qrCode) {
        toast.success("Instancia criada com QR Code pronto para escanear.");
      } else {
        toast.success("Instancia criada! Escaneie o QR Code.");
      }
      setModalOpen(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const conectar = useMutation({
    mutationFn: (id: string) => api.post(`/api/ia/instancias/${id}/conectar`, {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["instancias-ia"] });
      if (data.status === "QR_CODE") toast.info("QR Code gerado! Escaneie com o WhatsApp.");
      else toast.success("Conectado!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const desconectar = useMutation({
    mutationFn: (id: string) => api.post(`/api/ia/instancias/${id}/desconectar`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["instancias-ia"] }); toast.success("Desconectado"); },
    onError: (err: any) => toast.error(err.message),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => api.delete(`/api/ia/instancias/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["instancias-ia"] }); toast.success("Instância excluída"); },
    onError: (err: any) => toast.error(err.message),
  });

  const verificarStatus = useMutation({
    mutationFn: (id: string) => api.get(`/api/ia/instancias/${id}/status`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["instancias-ia"] }); },
  });

  const resetForm = () => setForm({ nome: "", provedor: "UZAPI", metaAccessToken: "", metaPhoneNumberId: "", metaWabaId: "" });

  const agenteAtivo = configIA?.iaAtiva !== false;

  const statusColor = (status: string) => {
    switch (status) {
      case "CONECTADO": return "bg-emerald-100 text-emerald-700";
      case "QR_CODE": return "bg-amber-100 text-amber-700";
      case "CONECTANDO": return "bg-blue-100 text-blue-700";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "CONECTADO": return <Wifi className="h-3 w-3" />;
      case "QR_CODE": return <QrCode className="h-3 w-3" />;
      default: return <WifiOff className="h-3 w-3" />;
    }
  };

  const getQrCode = (inst: any) => {
    const possible =
      inst?.qrCode ||
      inst?.data?.instance?.qrcode ||
      inst?.data?.instance?.qr ||
      inst?.data?.instance?.qrCode ||
      inst?.data?.instance?.base64 ||
      inst?.data?.qrcode ||
      inst?.data?.qr ||
      inst?.data?.qrCode ||
      inst?.data?.base64 ||
      null;

    if (typeof possible !== "string") return null;
    const normalized = possible.trim();
    return normalized || null;
  };

  const renderInstanciaCard = (inst: any) => (
    <Card key={inst.id} className="border">
      <CardContent className="p-4">
        {(() => {
          const qrCode = getQrCode(inst);
          const shouldShowQr = (inst.status === "QR_CODE" || inst.status === "CONECTANDO") && !!qrCode;

          return (
            <>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium text-sm">{inst.nome}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-[10px]">{inst.provedor === "UZAPI" ? "UZapi" : "API Oficial"}</Badge>
                <Badge className={`text-[10px] ${statusColor(inst.status)}`}>
                  <span className="flex items-center gap-1">{statusIcon(inst.status)} {inst.status}</span>
                </Badge>
                {inst.telefone && <span className="text-xs text-muted-foreground">{inst.telefone}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => verificarStatus.mutate(inst.id)} title="Verificar status">
              <RefreshCw className="h-4 w-4" />
            </Button>
            {inst.status !== "CONECTADO" && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" onClick={() => conectar.mutate(inst.id)} title="Conectar">
                <Wifi className="h-4 w-4" />
              </Button>
            )}
            {inst.status === "CONECTADO" && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600" onClick={() => desconectar.mutate(inst.id)} title="Desconectar">
                <WifiOff className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { if (confirm("Excluir esta instância?")) excluir.mutate(inst.id); }} title="Excluir">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {shouldShowQr && qrCode && (
          <div className="mt-3 p-3 bg-white rounded border flex flex-col items-center">
            <p className="text-xs text-zinc-600 mb-2">Escaneie o QR Code com o WhatsApp:</p>
            <img src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code" className="w-48 h-48" />
          </div>
        )}
        {inst.provedor === "META_OFICIAL" && inst.webhookUrl && (
          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-800 space-y-1.5">
            <p className="text-xs font-medium text-blue-800 dark:text-blue-200">Webhook para configurar no Meta:</p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-white dark:bg-background px-2 py-1 rounded border flex-1 break-all">{inst.webhookUrl}</code>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { navigator.clipboard.writeText(inst.webhookUrl); toast.success("URL copiada!"); }} title="Copiar URL">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-700 dark:text-blue-300">Verify Token:</span>
              <code className="text-xs bg-white dark:bg-background px-2 py-1 rounded border">token123</code>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { navigator.clipboard.writeText("token123"); toast.success("Token copiado!"); }} title="Copiar token">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
            </>
          );
        })()}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Configure a instância de WhatsApp do agente de IA.</p>
          <p className="text-xs text-muted-foreground mt-1">Um único número atende clientes; os números de gestão cadastrados falam com o agente de gestão.</p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />Nova Instância
        </Button>
      </div>

      {/* Liga/desliga global do agente */}
      <Card className={agenteAtivo ? "border-emerald-200" : "border-muted"}>
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${agenteAtivo ? "bg-emerald-100" : "bg-muted"}`}>
              <Bot className={`h-5 w-5 ${agenteAtivo ? "text-emerald-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="font-medium text-sm">Agente de IA {agenteAtivo ? "ativo" : "desativado"}</p>
              <p className="text-xs text-muted-foreground">
                {agenteAtivo
                  ? "As mensagens recebidas são respondidas automaticamente."
                  : "As mensagens são registradas, mas o agente não responde."}
              </p>
            </div>
          </div>
          <Switch
            checked={agenteAtivo}
            onCheckedChange={(v) => toggleAgente.mutate(v)}
            disabled={toggleAgente.isPending}
          />
        </CardContent>
      </Card>

      {/* Instância única de WhatsApp */}
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
          <Bot className="h-5 w-5 text-primary" />
          WhatsApp do Agente
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Número único do agente. Atende clientes por padrão e responde como gestão apenas para os números cadastrados abaixo.
        </p>
        {instancias.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma instância configurada. Crie a instância do agente.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">{instancias.map(renderInstanciaCard)}</div>
        )}
      </div>

      {/* Números do agente de gestão */}
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
          <Bot className="h-5 w-5 text-amber-500" />
          Números do Agente de Gestão
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Quando um desses números manda mensagem para o WhatsApp do agente, quem responde é o agente de gestão (faturamento, vendas, estoque). Qualquer outro número é atendido normalmente.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <Input
            value={novoNumeroGestao.nome}
            onChange={(e) => setNovoNumeroGestao((n) => ({ ...n, nome: e.target.value }))}
            placeholder="Nome (opcional)"
            className="sm:max-w-[180px]"
          />
          <Input
            value={novoNumeroGestao.numero}
            onChange={(e) => setNovoNumeroGestao((n) => ({ ...n, numero: e.target.value }))}
            placeholder="Número com DDD (ex: 11 99999-9999)"
            onKeyDown={(e) => {
              if (e.key === "Enter" && novoNumeroGestao.numero.trim()) adicionarNumeroGestao.mutate(novoNumeroGestao);
            }}
          />
          <Button
            onClick={() => adicionarNumeroGestao.mutate(novoNumeroGestao)}
            disabled={!novoNumeroGestao.numero.trim() || adicionarNumeroGestao.isPending}
          >
            <Plus className="h-4 w-4 mr-1" />Adicionar
          </Button>
        </div>

        {numerosGestao.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Nenhum número de gestão cadastrado. Todos os contatos são atendidos pelo agente de atendimento.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {numerosGestao.map((n: any) => (
              <Card key={n.id} className="border">
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{n.nome || "Sem nome"}</p>
                    <p className="text-xs text-muted-foreground">{n.numero}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => { if (confirm("Remover este número de gestão?")) removerNumeroGestao.mutate(n.id); }}
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal criar instância */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova Instância WhatsApp</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome da instância *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: WhatsApp Barracão" />
            </div>
            <div className="space-y-1">
              <Label>Provedor *</Label>
              <Select value={form.provedor} onValueChange={v => setForm(f => ({ ...f, provedor: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UZAPI">UZapi</SelectItem>
                  <SelectItem value="META_OFICIAL">API Oficial (Meta)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.provedor === "UZAPI" && !configIA?.hasUzapi && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                <p className="text-xs text-amber-800">Servidor UZapi não configurado. Configure primeiro em <strong>Configurações &gt; Chave OpenAI</strong>.</p>
              </div>
            )}

            {form.provedor === "UZAPI" && configIA?.hasUzapi && (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                <p className="text-xs text-blue-800">A instância será criada automaticamente no servidor UZapi e o QR Code será gerado para conexão.</p>
              </div>
            )}

            {form.provedor === "META_OFICIAL" && (
              <>
                <div className="space-y-1">
                  <Label>Access Token *</Label>
                  <Input value={form.metaAccessToken} onChange={e => setForm(f => ({ ...f, metaAccessToken: e.target.value }))} placeholder="Token de acesso do Meta" />
                </div>
                <div className="space-y-1">
                  <Label>Phone Number ID *</Label>
                  <Input value={form.metaPhoneNumberId} onChange={e => setForm(f => ({ ...f, metaPhoneNumberId: e.target.value }))} placeholder="ID do número de telefone" />
                </div>
                <div className="space-y-1">
                  <Label>WABA ID *</Label>
                  <Input value={form.metaWabaId} onChange={e => setForm(f => ({ ...f, metaWabaId: e.target.value }))} placeholder="WhatsApp Business Account ID" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => criar.mutate({ ...form, tipo: "ATENDIMENTO" })}
              disabled={!form.nome || (form.provedor === "UZAPI" && !configIA?.hasUzapi) || (form.provedor === "META_OFICIAL" && (!form.metaAccessToken || !form.metaPhoneNumberId || !form.metaWabaId)) || criar.isPending}
            >
              {criar.isPending ? "Criando..." : "Criar Instância"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== ABA OPENAI =====
function OpenAIConfigTab() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [editingKey, setEditingKey] = useState(false);
  const [uzapiUrl, setUzapiUrl] = useState("");
  const [uzapiToken, setUzapiToken] = useState("");
  const [editingUzapi, setEditingUzapi] = useState(false);

  const { data: configIA } = useQuery({
    queryKey: ["config-ia"],
    queryFn: () => api.get<any>("/api/ia/config"),
  });

  const salvar = useMutation({
    mutationFn: (data: any) => api.put("/api/ia/config", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["config-ia"] }); toast.success("Configuração salva"); setEditingKey(false); setEditingUzapi(false); },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Key className="h-4 w-4" /> Chave da OpenAI</CardTitle>
          <CardDescription>Configure a chave de API da OpenAI para os agentes de IA funcionarem.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API Key</Label>
            {!editingKey && configIA?.hasKey ? (
              <div className="flex items-center gap-2">
                <Input value={configIA.openaiApiKey || ""} disabled className="font-mono text-sm" />
                <Button variant="outline" size="sm" onClick={() => setEditingKey(true)}>Alterar</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="font-mono text-sm"
                  type="password"
                />
                <Button size="sm" onClick={() => salvar.mutate({ openaiApiKey: apiKey })} disabled={!apiKey || salvar.isPending}>
                  Salvar
                </Button>
                {editingKey && <Button variant="ghost" size="sm" onClick={() => setEditingKey(false)}>Cancelar</Button>}
              </div>
            )}
            <p className="text-xs text-muted-foreground">A chave é armazenada de forma segura e usada para processar mensagens dos agentes.</p>
          </div>

          <div className="space-y-2">
            <Label>Modelo</Label>
            <div className="flex items-center gap-2">
              <Select value={configIA?.openaiModel || model} onValueChange={v => setModel(v)}>
                <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                  <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={() => salvar.mutate({ openaiModel: model })} disabled={salvar.isPending}>
                Atualizar Modelo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Servidor UZapi */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Wifi className="h-4 w-4" /> Servidor UZapi</CardTitle>
          <CardDescription>Configure o servidor UZapi para criar instâncias de WhatsApp automaticamente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!editingUzapi && configIA?.hasUzapi ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">URL do Servidor</Label>
                <p className="text-sm font-mono">{configIA.uzapiUrl}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Admin Token</Label>
                <p className="text-sm font-mono">{configIA.uzapiAdminToken}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditingUzapi(true)}>Alterar</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>URL do Servidor *</Label>
                <Input
                  value={uzapiUrl}
                  onChange={e => setUzapiUrl(e.target.value)}
                  placeholder="https://seu-servidor-uzapi.com"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label>Admin Token *</Label>
                <Input
                  value={uzapiToken}
                  onChange={e => setUzapiToken(e.target.value)}
                  placeholder="Token de administrador da UZapi"
                  className="font-mono text-sm"
                  type="password"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => salvar.mutate({ uzapiUrl, uzapiAdminToken: uzapiToken })} disabled={!uzapiUrl || !uzapiToken || salvar.isPending}>
                  Salvar
                </Button>
                {editingUzapi && <Button variant="ghost" size="sm" onClick={() => setEditingUzapi(false)}>Cancelar</Button>}
              </div>
              <p className="text-xs text-muted-foreground">O Admin Token é usado para criar e gerenciar instâncias automaticamente no servidor UZapi.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            {configIA?.hasKey ? (
              <>
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-emerald-700">OpenAI configurada</span>
              </>
            ) : (
              <>
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-sm text-red-700">OpenAI não configurada</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {configIA?.hasUzapi ? (
              <>
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-emerald-700">UZapi configurada</span>
              </>
            ) : (
              <>
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-sm text-red-700">UZapi não configurada</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== ABA LOJA =====
function LojaTab() {
  const queryClient = useQueryClient();
  const [mensagem, setMensagem] = useState("");

  const { data: configLoja } = useQuery({
    queryKey: ["config-loja"],
    queryFn: () => api.get<any>("/api/loja/config"),
  });

  const salvar = useMutation({
    mutationFn: (data: any) => api.put("/api/loja/config", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["config-loja"] }); toast.success("Configuração salva"); },
    onError: (err: any) => toast.error(err.message),
  });

  const mensagemAtual = mensagem || configLoja?.mensagemFechado || "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4" /> Status da Loja</CardTitle>
          <CardDescription>Quando a loja estiver fechada, os clientes não conseguem finalizar pedidos no cardápio digital.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Loja fechada</p>
              <p className="text-xs text-muted-foreground">
                {configLoja?.lojaFechada ? "Clientes não conseguem fazer pedidos agora." : "Clientes conseguem fazer pedidos normalmente."}
              </p>
            </div>
            <Switch
              checked={!!configLoja?.lojaFechada}
              onCheckedChange={(v) => salvar.mutate({ lojaFechada: v })}
            />
          </div>

          <div className="space-y-2">
            <Label>Mensagem exibida ao cliente (opcional)</Label>
            <Textarea
              value={mensagemAtual}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="A loja está fechada no momento. Tente novamente mais tarde."
              rows={3}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => salvar.mutate({ mensagemFechado: mensagemAtual || null })}
              disabled={salvar.isPending}
            >
              Salvar mensagem
            </Button>
          </div>

          <div className="flex items-center gap-2 pt-2">
            {configLoja?.lojaFechada ? (
              <>
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-sm text-red-700">Loja fechada</span>
              </>
            ) : (
              <>
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-emerald-700">Loja aberta</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== ABA CUPONS =====
const DIAS_SEMANA_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TIPOS_PEDIDO_OPCOES: { value: string; label: string }[] = [
  { value: "DELIVERY", label: "Delivery" },
  { value: "RETIRADA", label: "Retirada" },
  { value: "LOCAL", label: "Consumo local" },
];
const CARACTERES_CODIGO_CUPOM = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I

function gerarCodigoCupomAleatorio(tamanho = 8) {
  let codigo = "";
  for (let i = 0; i < tamanho; i++) {
    codigo += CARACTERES_CODIGO_CUPOM[Math.floor(Math.random() * CARACTERES_CODIGO_CUPOM.length)];
  }
  return codigo;
}

const CUPOM_FORM_VAZIO = {
  codigo: gerarCodigoCupomAleatorio(),
  tipo: "PERCENTUAL" as "PERCENTUAL" | "VALOR_FIXO",
  valor: "",
  ativo: true,
  valorMinimoPedido: "",
  descontoMaximo: "",
  limiteUsos: "",
  limitePorCliente: "",
  diasSemana: [] as number[],
  somentePix: false,
  tiposPedido: [] as string[],
};

function copiarTexto(texto: string, mensagem: string) {
  navigator.clipboard.writeText(texto).then(
    () => toast.success(mensagem),
    () => toast.error("Não foi possível copiar. Copie manualmente."),
  );
}

function CuponsTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(CUPOM_FORM_VAZIO);
  const [editando, setEditando] = useState<any>(null);

  const { data: cupons = [] } = useQuery({
    queryKey: ["cupons"],
    queryFn: () => api.get<any[]>("/api/cupons"),
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["cupons"] });

  const criar = useMutation({
    mutationFn: (data: any) => api.post("/api/cupons", data),
    onSuccess: (cupom: any) => {
      invalidar();
      toast.success(`Cupom ${cupom.codigo} criado`);
      setForm({ ...CUPOM_FORM_VAZIO, codigo: gerarCodigoCupomAleatorio() });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const atualizar = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/api/cupons/${id}`, data),
    onSuccess: () => {
      invalidar();
      toast.success("Cupom atualizado");
      setEditando(null);
      setForm({ ...CUPOM_FORM_VAZIO, codigo: gerarCodigoCupomAleatorio() });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const remover = useMutation({
    mutationFn: (id: string) => api.delete(`/api/cupons/${id}`),
    onSuccess: () => { invalidar(); toast.success("Cupom removido"); },
    onError: (err: any) => toast.error(err.message),
  });

  const alternarAtivo = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) => api.put(`/api/cupons/${id}`, { ativo }),
    onSuccess: invalidar,
    onError: (err: any) => toast.error(err.message),
  });

  const iniciarEdicao = (cupom: any) => {
    setEditando(cupom);
    setForm({
      codigo: cupom.codigo,
      tipo: cupom.tipo,
      valor: String(cupom.valor ?? ""),
      ativo: cupom.ativo,
      valorMinimoPedido: cupom.valorMinimoPedido != null ? String(cupom.valorMinimoPedido) : "",
      descontoMaximo: cupom.descontoMaximo != null ? String(cupom.descontoMaximo) : "",
      limiteUsos: cupom.limiteUsos != null ? String(cupom.limiteUsos) : "",
      limitePorCliente: cupom.limitePorCliente != null ? String(cupom.limitePorCliente) : "",
      diasSemana: cupom.diasSemana || [],
      somentePix: !!cupom.somentePix,
      tiposPedido: cupom.tiposPedido || [],
    });
  };

  const cancelarEdicao = () => {
    setEditando(null);
    setForm({ ...CUPOM_FORM_VAZIO, codigo: gerarCodigoCupomAleatorio() });
  };

  const alternarDia = (dia: number) => {
    setForm((prev) => ({
      ...prev,
      diasSemana: prev.diasSemana.includes(dia) ? prev.diasSemana.filter((d) => d !== dia) : [...prev.diasSemana, dia].sort(),
    }));
  };

  const alternarTipoPedido = (tipo: string) => {
    setForm((prev) => ({
      ...prev,
      tiposPedido: prev.tiposPedido.includes(tipo) ? prev.tiposPedido.filter((t) => t !== tipo) : [...prev.tiposPedido, tipo],
    }));
  };

  const salvar = () => {
    const valorNumero = Number(String(form.valor).replace(",", "."));
    if (!form.codigo.trim() || !Number.isFinite(valorNumero) || valorNumero <= 0) {
      toast.error("Preencha o código e um valor de desconto válido.");
      return;
    }
    const payload = {
      codigo: form.codigo.trim().toUpperCase(),
      tipo: form.tipo,
      valor: valorNumero,
      ativo: form.ativo,
      valorMinimoPedido: form.valorMinimoPedido ? Number(String(form.valorMinimoPedido).replace(",", ".")) : null,
      descontoMaximo: form.tipo === "PERCENTUAL" && form.descontoMaximo ? Number(String(form.descontoMaximo).replace(",", ".")) : null,
      limiteUsos: form.limiteUsos ? Number(form.limiteUsos) : null,
      limitePorCliente: form.limitePorCliente ? Number(form.limitePorCliente) : null,
      diasSemana: form.diasSemana,
      somentePix: form.somentePix,
      tiposPedido: form.tiposPedido,
    };

    if (editando) {
      atualizar.mutate({ id: editando.id, data: payload });
      return;
    }
    criar.mutate(payload);
  };

  const linkCardapioComCupom = (codigo: string) => `${window.location.origin}/cardapio?cupom=${codigo}`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Ticket className="h-4 w-4" /> {editando ? `Editando cupom ${editando.codigo}` : "Criar cupom"}</CardTitle>
          <CardDescription>Cupons de desconto valem no cardápio digital e em pedidos criados manualmente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Código do cupom *</Label>
              <div className="flex gap-2">
                <Input
                  value={form.codigo}
                  onChange={(e) => setForm((prev) => ({ ...prev, codigo: e.target.value.toUpperCase().replace(/\s+/g, "") }))}
                  placeholder="Ex: BEMVINDO10"
                  className="font-mono"
                />
                <Button type="button" variant="outline" size="icon" title="Gerar novo código" onClick={() => setForm((prev) => ({ ...prev, codigo: gerarCodigoCupomAleatorio() }))}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Tipo de desconto *</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((prev) => ({ ...prev, tipo: v as any, descontoMaximo: v === "VALOR_FIXO" ? "" : prev.descontoMaximo }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTUAL">Porcentagem (%)</SelectItem>
                  <SelectItem value="VALOR_FIXO">Valor fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>{form.tipo === "PERCENTUAL" ? "Desconto (%) *" : "Desconto (R$) *"}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.valor}
                onChange={(e) => setForm((prev) => ({ ...prev, valor: e.target.value }))}
                placeholder={form.tipo === "PERCENTUAL" ? "Ex: 10" : "Ex: 15.00"}
              />
            </div>
            {form.tipo === "PERCENTUAL" && (
              <div className="space-y-1">
                <Label>Desconto máximo (R$)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.descontoMaximo}
                  onChange={(e) => setForm((prev) => ({ ...prev, descontoMaximo: e.target.value }))}
                  placeholder="Opcional — teto do desconto"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Pedido mínimo (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.valorMinimoPedido}
                onChange={(e) => setForm((prev) => ({ ...prev, valorMinimoPedido: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-1">
              <Label>Limite total de usos</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={form.limiteUsos}
                onChange={(e) => setForm((prev) => ({ ...prev, limiteUsos: e.target.value }))}
                placeholder="Opcional — ilimitado"
              />
            </div>
            <div className="space-y-1">
              <Label>Limite por cliente</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={form.limitePorCliente}
                onChange={(e) => setForm((prev) => ({ ...prev, limitePorCliente: e.target.value }))}
                placeholder="Opcional — ilimitado"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Dias da semana em que o cupom fica ativo</Label>
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA_LABEL.map((label, dia) => (
                <button
                  type="button"
                  key={dia}
                  onClick={() => alternarDia(dia)}
                  className={`h-9 w-12 rounded-md border text-xs font-medium transition-colors ${
                    form.diasSemana.includes(dia) ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {form.diasSemana.length === 0 ? "Nenhum dia marcado = cupom vale todos os dias." : "Cupom só fica ativo nos dias marcados."}
            </p>
          </div>

          <div className="space-y-1">
            <Label>Tipos de pedido em que o cupom vale</Label>
            <div className="flex flex-wrap gap-2">
              {TIPOS_PEDIDO_OPCOES.map((opcao) => (
                <button
                  type="button"
                  key={opcao.value}
                  onClick={() => alternarTipoPedido(opcao.value)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    form.tiposPedido.includes(opcao.value) ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-muted"
                  }`}
                >
                  {opcao.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {form.tiposPedido.length === 0 ? "Nenhum marcado = cupom vale pra todos os tipos." : "Cupom só vale pros tipos marcados."}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Cupom ativo</p>
              <p className="text-xs text-muted-foreground">Cupons inativos não podem ser aplicados no checkout.</p>
            </div>
            <Switch checked={form.ativo} onCheckedChange={(v) => setForm((prev) => ({ ...prev, ativo: v }))} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Somente pagamento via PIX</p>
              <p className="text-xs text-muted-foreground">
                Só permite aplicar o cupom quando o cliente for pagar na hora, via PIX (Mercado Pago) — não vale
                pra cartão, dinheiro ou pagar na entrega.
              </p>
            </div>
            <Switch checked={form.somentePix} onCheckedChange={(v) => setForm((prev) => ({ ...prev, somentePix: v }))} />
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={salvar} disabled={criar.isPending || atualizar.isPending}>
              {editando ? "Salvar alteração" : "Criar cupom"}
            </Button>
            {editando && (
              <Button variant="outline" onClick={cancelarEdicao}>Cancelar edição</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cupons cadastrados</CardTitle>
          <CardDescription>{cupons.length} cupom(ns)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Desconto</TableHead>
                <TableHead>Usos</TableHead>
                <TableHead>Dias</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[160px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cupons.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Nenhum cupom cadastrado.</TableCell>
                </TableRow>
              )}
              {cupons.map((cupom: any) => (
                <TableRow key={cupom.id}>
                  <TableCell className="font-mono font-medium">{cupom.codigo}</TableCell>
                  <TableCell className="text-sm">
                    {cupom.tipo === "PERCENTUAL" ? `${cupom.valor}%` : `R$ ${Number(cupom.valor).toFixed(2)}`}
                    {cupom.valorMinimoPedido ? <span className="block text-xs text-muted-foreground">mín. R$ {Number(cupom.valorMinimoPedido).toFixed(2)}</span> : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {cupom.usosCount}{cupom.limiteUsos ? ` / ${cupom.limiteUsos}` : ""}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {cupom.diasSemana?.length ? cupom.diasSemana.map((d: number) => DIAS_SEMANA_LABEL[d]).join(", ") : "Todos"}
                    {cupom.somentePix ? <span className="block text-blue-500">Somente PIX</span> : null}
                    {cupom.tiposPedido?.length ? (
                      <span className="block text-amber-500">
                        {cupom.tiposPedido.map((t: string) => TIPOS_PEDIDO_OPCOES.find((o) => o.value === t)?.label || t).join(", ")}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Switch checked={cupom.ativo} onCheckedChange={(v) => alternarAtivo.mutate({ id: cupom.id, ativo: v })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Copiar código" onClick={() => copiarTexto(cupom.codigo, "Código copiado!")}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Copiar link do cardápio com cupom" onClick={() => copiarTexto(linkCardapioComCupom(cupom.codigo), "Link copiado!")}>
                        <LinkIcon className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => iniciarEdicao(cupom)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => { if (confirm(`Remover cupom ${cupom.codigo}?`)) remover.mutate(cupom.id); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== ABA CARDÁPIO =====
function CardapioConfigTab() {
  const queryClient = useQueryClient();
  const { data: produtos = [] } = useQuery({
    queryKey: ["estoque"],
    queryFn: () => api.get<any[]>("/api/estoque"),
  });

  const toggleDisponivel = useMutation({
    mutationFn: ({ id, disponivel }: { id: string; disponivel: boolean }) =>
      api.put(`/api/estoque/${id}`, { disponivel }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["estoque"] }); toast.success("Disponibilidade atualizada"); },
    onError: (err: any) => toast.error(err.message),
  });

  const categorias = [...new Set(produtos.map((p: any) => p.categoria))].sort();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">Gerencie quais produtos aparecem no cardapio digital publico.</p>
      </div>
      {categorias.map(cat => (
        <Card key={cat}>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{cat}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {produtos.filter((p: any) => p.categoria === cat).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium">{p.nome}</p>
                  <p className="text-xs text-muted-foreground">Estoque: {p.estoque}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{p.disponivel ? "Visivel" : "Oculto"}</span>
                  <Switch
                    checked={p.disponivel}
                    onCheckedChange={v => toggleDisponivel.mutate({ id: p.id, disponivel: v })}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
