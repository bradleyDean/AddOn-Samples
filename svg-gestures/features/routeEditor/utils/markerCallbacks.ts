import React from 'react';
import { HoldMarker } from '../../../shared/types/holds';
import { HoldMarkerLayerConfig } from '../../../shared/config/holdMarkerLayerConfig';

export interface MarkerCallbacks {
  handleMoveHold: (id: string, newX: number, newY: number) => void;
  handleResizeHold: (id: string, newRadius: number) => void;
  handleSelect: (tapX: number, tapY: number) => void;
  handleDeselect: () => void;
  handleCreateMarker: (tapX: number, tapY: number) => void;
  handleTapWhileSelected: () => void;
  handlePanCanvas: (tx: number, ty: number) => void;
  handleZoomCanvas: (scale: number) => void;
}

export const createMarkerCallbacks = (
  setMarkers: React.Dispatch<React.SetStateAction<HoldMarker[]>>,
  config: HoldMarkerLayerConfig
): MarkerCallbacks => ({
  handleMoveHold: (id: string, newX: number, newY: number) => {
    setMarkers(prev => prev.map(m => (m.id === id ? { ...m, x: newX, y: newY } : m)));
  },

  handleResizeHold: (id: string, newRadius: number) => {
    setMarkers(prev => prev.map(m => (m.id === id ? { ...m, r: newRadius } : m)));
  },

  handleSelect: (tapX: number, tapY: number) => {
    setMarkers((prevMarkers: HoldMarker[]) => {
      // Find which marker was hit and select only that one
      const updatedMarkers = prevMarkers.map((marker: HoldMarker) => {
        const dx = tapX - marker.x;
        const dy = tapY - marker.y;
        const isHit = dx * dx + dy * dy <= marker.r * marker.r;
        return {
          ...marker,
          selected: isHit, // Only the hit marker becomes selected
        };
      });
      return updatedMarkers;
    });
  },

  handleDeselect: () => {
    setMarkers((prevMarkers: HoldMarker[]) => 
      prevMarkers.map((marker: HoldMarker) => ({ ...marker, selected: false }))
    );
  },

  handleCreateMarker: (tapX: number, tapY: number) => {
    const newMarker: HoldMarker = {
      id: `marker-${Date.now()}`, // Simple unique ID based on timestamp
      x: tapX,
      y: tapY,
      r: config.defaultRadius, // Use config defaultRadius
      type: 'intermediate', // Default to intermediate hold
      selected: false,
    };
    setMarkers((prevMarkers: HoldMarker[]) => [...prevMarkers, newMarker]);
  },

  handleTapWhileSelected: () => {
    // Marker tapped while selected - no action needed
  },

  handlePanCanvas: (_tx: number, _ty: number) => {
    // Canvas pan handled by gesture system
  },

  handleZoomCanvas: (_scale: number) => {
    // Canvas zoom handled by gesture system
  },
});
