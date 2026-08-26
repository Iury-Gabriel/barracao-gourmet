import { config } from '../config/env';
import { notificarErroCritico } from './alertas';

// Endereco/coordenadas de origem do frete. Configuraveis pelo .env
// (LOJA_ENDERECO_BASE, LOJA_LAT, LOJA_LON, LOJA_ENDERECO_RETIRADA).
export const ENDERECO_BASE_LOJA = config.lojaEnderecoBase;
export const COORDENADAS_BASE_LOJA = {
  lat: config.lojaLat,
  lon: config.lojaLon,
};

// Limite de distancia para delivery proprio. Acima disso, oferecemos retirada (no balcao ou via Uber Flash/99).
export const LIMITE_KM_ENTREGA = 5;

// Pedido a partir deste subtotal (produtos, sem frete) sai com entrega gratis.
export const SUBTOTAL_ENTREGA_GRATIS = 200;

// Ate esta distancia a Linda pode oferecer entrega gratis como cortesia para
// cliente que pede desconto (regra de negocio informada no onboarding).
export const LIMITE_KM_CORTESIA_FRETE_GRATIS = 2;
export const ENDERECO_RETIRADA_LOJA = config.lojaEnderecoRetirada;
export const MENSAGEM_FORA_DE_AREA = `Consegue chamar um Uber Flash ou 99 na ${ENDERECO_RETIRADA_LOJA} pra retirar seu pedido aqui e levar no seu endereço?`;

export function calcularFretePorDistanciaKm(distanciaKm: number) {
  if (!Number.isFinite(distanciaKm) || distanciaKm <= 0) {
    return { atende: false, motivo: 'Distancia invalida para calcular frete.' as string, frete: 0, acimaDoLimite: false };
  }

  if (distanciaKm > LIMITE_KM_ENTREGA) {
    return {
      atende: false,
      acimaDoLimite: true,
      motivo: `Nao fazemos delivery acima de ${LIMITE_KM_ENTREGA}km.` as string,
      mensagemForaDeArea: MENSAGEM_FORA_DE_AREA as string,
      enderecoRetirada: ENDERECO_RETIRADA_LOJA as string,
      frete: 0,
    };
  }

  // Faixas por distancia (raio maximo de 5km).
  if (distanciaKm <= 2) return { atende: true, frete: 4, acimaDoLimite: false };
  if (distanciaKm <= 3) return { atende: true, frete: 5, acimaDoLimite: false };
  if (distanciaKm <= 4) return { atende: true, frete: 6, acimaDoLimite: false };
  return { atende: true, frete: 8, acimaDoLimite: false };
}

export function calcularDistanciaHaversineKm(
  origem: { lat: number; lon: number },
  destino: { lat: number; lon: number },
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const r = 6371;

  const dLat = toRad(destino.lat - origem.lat);
  const dLon = toRad(destino.lon - origem.lon);
  const lat1 = toRad(origem.lat);
  const lat2 = toRad(destino.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
}

type Coordenada = { lat: number; lon: number };

export type DadosCep = { logradouro: string; bairro: string; cidade: string; uf: string };
export type DadosCepCoord = DadosCep & { lat: number | null; lon: number | null };

/**
 * Consulta um CEP na AwesomeAPI, que retorna o endereco E as coordenadas (lat/lng)
 * diretamente do CEP. Isso evita depender do geocoder achar ruas residenciais
 * (que o OpenStreetMap frequentemente nao tem). Retorna null se indisponivel.
 */
export async function consultarCepCoordenadas(cep: string): Promise<DadosCepCoord | null> {
  const limpo = String(cep || '').replace(/\D/g, '');
  if (limpo.length !== 8) return null;

  try {
    const headers: Record<string, string> = { 'User-Agent': 'BarracaoGourmet/1.0', Accept: 'application/json' };
    // A AwesomeAPI usa o header x-api-key para a cota maior (registrada).
    if (config.awesomeApiKey) headers['x-api-key'] = config.awesomeApiKey;
    const res = await fetch(`https://cep.awesomeapi.com.br/json/${limpo}`, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[cep] AwesomeAPI HTTP nao-ok', { cep: limpo, status: res.status, body: body.slice(0, 200) });
      return null;
    }
    const d: any = await res.json().catch(() => null);
    if (!d || d.status === 404 || d.code) return null;

    // lat/lng vem como string; evita Number("")===0 (coordenada falsa).
    const lat = d.lat ? Number(d.lat) : NaN;
    const lon = d.lng ? Number(d.lng) : NaN;
    const dados: DadosCepCoord = {
      logradouro: d.address || '',
      bairro: d.district || '',
      cidade: d.city || '',
      uf: d.state || '',
      lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
      lon: Number.isFinite(lon) && lon !== 0 ? lon : null,
    };
    console.log('[cep] AwesomeAPI', { cep: limpo, ...dados });
    return dados;
  } catch (err) {
    console.warn('[cep] falha AwesomeAPI', { cep: limpo, err: err instanceof Error ? err.message : err });
    return null;
  }
}

/**
 * Consulta um CEP e retorna o endereco oficial (logradouro/bairro/cidade/uf).
 * Tenta o BrasilAPI (agrega varias fontes) e cai para o ViaCEP.
 * Usar o nome oficial da rua melhora MUITO o acerto da geocodificacao.
 */
export async function consultarCep(cep: string): Promise<DadosCep | null> {
  const limpo = String(cep || '').replace(/\D/g, '');
  if (limpo.length !== 8) return null;

  // BrasilAPI (CEP v2)
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${limpo}`, {
      headers: { 'User-Agent': 'BarracaoGourmet/1.0', Accept: 'application/json' },
    });
    if (res.ok) {
      const d: any = await res.json().catch(() => null);
      if (d && (d.street || d.neighborhood || d.city)) {
        const dados = { logradouro: d.street || '', bairro: d.neighborhood || '', cidade: d.city || '', uf: d.state || '' };
        console.log('[cep] BrasilAPI', { cep: limpo, ...dados });
        return dados;
      }
    }
  } catch (err) {
    console.warn('[cep] falha BrasilAPI, tentando ViaCEP', { cep: limpo, err: err instanceof Error ? err.message : err });
  }

  // Fallback: ViaCEP
  try {
    const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`, {
      headers: { 'User-Agent': 'BarracaoGourmet/1.0', Accept: 'application/json' },
    });
    if (res.ok) {
      const d: any = await res.json().catch(() => null);
      if (d && !d.erro) {
        const dados = { logradouro: d.logradouro || '', bairro: d.bairro || '', cidade: d.localidade || '', uf: d.uf || '' };
        console.log('[cep] ViaCEP', { cep: limpo, ...dados });
        return dados;
      }
    }
  } catch (err) {
    console.error('[cep] falha ViaCEP', { cep: limpo, err: err instanceof Error ? err.message : err });
  }

  console.warn('[cep] CEP nao encontrado em nenhuma fonte', { cep: limpo });
  return null;
}

/**
 * Geocodifica um endereco usando o OpenRouteService (geocode/search).
 * Considera somente o primeiro resultado: features[0].geometry.coordinates ([lon, lat]).
 *
 * Aceita um ponto de foco (focar resultados perto da loja) para evitar que
 * ruas homonimas em outras cidades sejam escolhidas quando o cliente nao
 * informa a cidade.
 */
export async function geocodificarEndereco(
  endereco: string,
  opts?: { focusLat?: number; focusLon?: number; radiusKm?: number },
) {
  const consulta = String(endereco || '').trim();
  if (!consulta) return null;

  if (!config.openRouteServiceApiKey) {
    console.error('[frete] OPENROUTESERVICE_API_KEY nao configurada; geocodificacao indisponivel.');
    notificarErroCritico('frete', 'OPENROUTESERVICE_API_KEY nao configurada — calculo de frete indisponivel para todos os pedidos.', {
      chave: 'frete:sem-api-key',
    });
    return null;
  }

  const url = new URL(`${config.openRouteServiceBaseUrl}/geocode/search`);
  url.searchParams.set('api_key', config.openRouteServiceApiKey);
  url.searchParams.set('text', consulta);
  url.searchParams.set('size', '10');
  // Restringe ao Brasil e prioriza/limita resultados proximos da loja.
  url.searchParams.set('boundary.country', 'BRA');
  if (typeof opts?.focusLat === 'number' && typeof opts?.focusLon === 'number') {
    url.searchParams.set('focus.point.lat', String(opts.focusLat));
    url.searchParams.set('focus.point.lon', String(opts.focusLon));
    // boundary.circle: limite RIGIDO de area (exclui resultados fora do raio, ex: outras cidades/estados).
    if (typeof opts.radiusKm === 'number' && opts.radiusKm > 0) {
      url.searchParams.set('boundary.circle.lat', String(opts.focusLat));
      url.searchParams.set('boundary.circle.lon', String(opts.focusLon));
      url.searchParams.set('boundary.circle.radius', String(opts.radiusKm));
    }
  }

  // URL para log com a api_key mascarada.
  const urlLog = new URL(url.toString());
  urlLog.searchParams.set('api_key', '***');
  console.log('[geo] -> requisicao geocode', { consulta, url: urlLog.toString() });

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[geo] <- geocode HTTP error', {
        status: res.status,
        statusText: res.statusText,
        consulta,
        body: body.slice(0, 300),
      });
      notificarErroCritico('frete', `Geocodificacao (OpenRouteService) retornou HTTP ${res.status} ao calcular frete.`, {
        detalhes: { consulta, status: res.status, body: body.slice(0, 300) },
        chave: 'frete:geocode-http-error',
      });
      return null;
    }

    const data: any = await res.json().catch(() => null);
    const features = Array.isArray(data?.features) ? data.features : [];

    // Log dos candidatos retornados para diagnostico.
    console.log('[geo] <- geocode resposta', {
      consulta,
      totalResultados: features.length,
      candidatos: features.slice(0, 5).map((f: any) => ({
        label: f?.properties?.label,
        confidence: f?.properties?.confidence,
        regiao: f?.properties?.region,
        cidade: f?.properties?.locality || f?.properties?.localadmin,
        coords: f?.geometry?.coordinates,
      })),
    });

    const first = features[0];
    const coordinates = first?.geometry?.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      console.warn('[geo] geocode sem resultado utilizavel', { consulta, totalResultados: features.length });
      return null;
    }

    // OpenRouteService retorna no formato GeoJSON: [lon, lat]
    const lon = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      console.error('[geo] geocode com coordenadas invalidas', { consulta, coordinates });
      return null;
    }

    const layer = String(first?.properties?.layer || '');
    console.log('[geo] = escolhido', { label: first?.properties?.label, layer, lat, lon });
    return { lat, lon, displayName: String(first?.properties?.label || ''), layer };
  } catch (error) {
    console.error('[geo] falha ao chamar geocode', {
      consulta,
      error: error instanceof Error ? error.message : error,
    });
    notificarErroCritico('frete', 'Falha de rede/excecao ao geocodificar endereco para calcular frete.', {
      detalhes: { consulta, error },
      chave: 'frete:geocode-excecao',
    });
    return null;
  }
}

/**
 * Calcula a distancia de rota dirigindo (driving-car) entre origem e destino
 * usando o OpenRouteService (v2/directions/driving-car).
 * O primeiro ponto enviado e sempre a loja (origem); o segundo, o endereco do cliente.
 * Retorna a distancia ja convertida de metros para km.
 */
export async function calcularDistanciaRotaKm(origem: Coordenada, destino: Coordenada) {
  if (!config.openRouteServiceApiKey) {
    console.error('[frete] OPENROUTESERVICE_API_KEY nao configurada; calculo de rota indisponivel.');
    notificarErroCritico('frete', 'OPENROUTESERVICE_API_KEY nao configurada — calculo de rota/distancia indisponivel.', {
      chave: 'frete:sem-api-key',
    });
    return null;
  }

  const url = `${config.openRouteServiceBaseUrl}/v2/directions/driving-car`;
  const body = {
    coordinates: [
      [origem.lon, origem.lat],
      [destino.lon, destino.lat],
    ],
  };

  console.log('[rota] -> requisicao directions', { url, coordinates: body.coordinates });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: config.openRouteServiceApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const erro = await res.text().catch(() => '');
      console.error('[rota] <- directions HTTP error', {
        status: res.status,
        statusText: res.statusText,
        body: erro.slice(0, 300),
      });
      notificarErroCritico('frete', `Calculo de rota (OpenRouteService) retornou HTTP ${res.status} ao calcular frete.`, {
        detalhes: { status: res.status, body: erro.slice(0, 300), origem, destino },
        chave: 'frete:rota-http-error',
      });
      return null;
    }

    const data: any = await res.json().catch(() => null);
    const rota = Array.isArray(data?.routes) ? data.routes[0] : null;
    const distanciaMetros = Number(rota?.summary?.distance);
    const duracaoSegundos = Number(rota?.summary?.duration);

    if (!Number.isFinite(distanciaMetros) || distanciaMetros <= 0) {
      console.warn('[rota] <- directions sem distancia valida', { distanciaMetros, origem, destino });
      return null;
    }

    console.log('[rota] <- directions resposta', {
      distanciaKm: Number((distanciaMetros / 1000).toFixed(2)),
      duracaoMin: Number.isFinite(duracaoSegundos) ? Number((duracaoSegundos / 60).toFixed(1)) : null,
    });

    return {
      distanciaKm: distanciaMetros / 1000,
      duracaoMin: Number.isFinite(duracaoSegundos) ? duracaoSegundos / 60 : null,
    };
  } catch (error) {
    console.error('[frete] Falha ao calcular rota dirigindo', {
      origem,
      destino,
      error: error instanceof Error ? error.message : error,
    });
    notificarErroCritico('frete', 'Falha de rede/excecao ao calcular rota de entrega para o frete.', {
      detalhes: { origem, destino, error },
      chave: 'frete:rota-excecao',
    });
    return null;
  }
}
