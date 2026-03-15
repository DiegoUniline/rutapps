// Type augmentation for react-leaflet v4 compatibility
declare module 'react-leaflet' {
  import { ComponentType, ReactNode } from 'react';
  import * as L from 'leaflet';

  export interface MapContainerProps {
    center?: L.LatLngExpression;
    zoom?: number;
    className?: string;
    style?: React.CSSProperties;
    children?: ReactNode;
    scrollWheelZoom?: boolean;
    zoomControl?: boolean;
    [key: string]: any;
  }

  export interface TileLayerProps {
    url: string;
    attribution?: string;
    [key: string]: any;
  }

  export interface MarkerProps {
    position: L.LatLngExpression;
    icon?: L.Icon | L.DivIcon;
    eventHandlers?: Record<string, (...args: any[]) => void>;
    children?: ReactNode;
    draggable?: boolean;
    [key: string]: any;
  }

  export interface PopupProps {
    children?: ReactNode;
    [key: string]: any;
  }

  export interface PolylineProps {
    positions: L.LatLngExpression[] | L.LatLngExpression[][];
    color?: string;
    weight?: number;
    opacity?: number;
    dashArray?: string;
    [key: string]: any;
  }

  export interface CircleMarkerProps {
    center: L.LatLngExpression;
    radius?: number;
    color?: string;
    fillColor?: string;
    fillOpacity?: number;
    children?: ReactNode;
    [key: string]: any;
  }

  export const MapContainer: ComponentType<MapContainerProps>;
  export const TileLayer: ComponentType<TileLayerProps>;
  export const Marker: ComponentType<MarkerProps>;
  export const Popup: ComponentType<PopupProps>;
  export const Polyline: ComponentType<PolylineProps>;
  export const CircleMarker: ComponentType<CircleMarkerProps>;
  export function useMap(): L.Map;
  export function useMapEvents(handlers: Record<string, (...args: any[]) => void>): L.Map;
}
