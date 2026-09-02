import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { API_URL } from "@/lib/apiBaseUrl";
import { Bike, Store, AlertTriangle } from "lucide-react";

/**
 * Mapa de acompanhamento da entrega, mostrado ao cliente no cardápio digital.
 *
 * Vale saber: o GPS do navegador para quando o entregador bloqueia a tela do
 * celular. Por isso a tela mostra a idade da posição em vez de fingir que está
 * sempre ao vivo.
 */

// O Leaflet monta a URL dos ícones a partir do caminho do bundle, o que quebra
// no build. Definimos ícones em SVG inline e não dependemos de asset externo.
function iconeSvg(svg: string, cor: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${cor};border-radius:9999px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4)">${svg}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

const SVG_MOTO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>';
const SVG_LOJA =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7l1-3h18l1 3"/><path d="M4 7v13h16V7"/><path d="M9 20v-6h6v6"/></svg>';

const iconeEntregador = iconeSvg(SVG_MOTO, "#C4161C");
const iconeLoja = iconeSvg(SVG_LOJA, "#5B4636");

type Rastreio = {
  emRota: boolean;
  origem: { lat: number; lon: number };
  posicao: { lat: number; lon: number; atualizadoEm: string } | null;
  posicaoAntiga: boolean;
  idadeSegundos?: number;
  distanciaKm: number | null;
};

/** Recentraliza o mapa quando o entregador se move. */
function SeguirEntregador({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], map.getZoom(), { animate: true });
  }, [lat, lon, map]);
  return null;
}

export function RastreioEntrega({ pedidoId }: { pedidoId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["rastreio", pedidoId],
    queryFn: async (): Promise<Rastreio> => {
      const res = await fetch(`${API_URL}/api/cardapio/pedido/${pedidoId}/rastreio`);
      if (!res.ok) throw new Error("Não foi possível carregar o rastreio.");
      return res.json();
    },
    refetchInterval: 15000,
  });

  if (isLoading) {
    return <p className="mt-2 text-xs text-marrom-300">Carregando o mapa...</p>;
  }

  if (!data?.emRota) return null;

  if (!data.posicao) {
    return (
      <p className="mt-2 rounded-lg bg-marrom-800/60 px-3 py-2 text-xs text-marrom-200">
        Seu pedido saiu para entrega. O mapa aparece assim que o entregador ligar a localização.
      </p>
    );
  }

  const { lat, lon } = data.posicao;

  return (
    <div className="mt-3 space-y-2">
      <div className="h-56 overflow-hidden rounded-xl border border-marrom-800">
        <MapContainer
          center={[lat, lon]}
          zoom={15}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[lat, lon]} icon={iconeEntregador}>
            <Popup>Seu pedido está aqui</Popup>
          </Marker>
          <Marker position={[data.origem.lat, data.origem.lon]} icon={iconeLoja}>
            <Popup>Barracão Gourmet</Popup>
          </Marker>
          <SeguirEntregador lat={lat} lon={lon} />
        </MapContainer>
      </div>

      {data.posicaoAntiga ? (
        <p className="flex items-center gap-2 text-xs text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Sem sinal do entregador há {Math.round((data.idadeSegundos ?? 0) / 60)} min. A última
          posição conhecida é a do mapa.
        </p>
      ) : (
        <p className="flex items-center gap-2 text-xs text-marrom-300">
          <Bike className="h-3.5 w-3.5 shrink-0" />
          A caminho, atualizado agora há pouco.
          {data.distanciaKm !== null && ` Já percorreu cerca de ${data.distanciaKm} km desde a loja.`}
        </p>
      )}

      <p className="flex items-center gap-2 text-[11px] text-marrom-400">
        <Store className="h-3 w-3 shrink-0" />
        O marcador marrom é o restaurante.
      </p>
    </div>
  );
}
