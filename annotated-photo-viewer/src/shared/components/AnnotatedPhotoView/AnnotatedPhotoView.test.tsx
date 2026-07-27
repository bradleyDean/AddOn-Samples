/**
 * Tests for AnnotatedPhotoView URI resolution (§3) and offline placeholder (§4).
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Image } from 'react-native';
import AnnotatedPhotoView from './AnnotatedPhotoView';

// The global gesture-handler mock (jest.setup.js) doesn't include Gesture.Race,
// which this component uses. Provide a fuller local mock.
jest.mock('react-native-gesture-handler', () => {
  const create = () => {
    const g: any = {
      onBegin: jest.fn(() => g),
      onStart: jest.fn(() => g),
      onUpdate: jest.fn(() => g),
      onEnd: jest.fn(() => g),
      enabled: jest.fn(() => g),
    };
    return g;
  };
  const Gesture = {
    Pan: create,
    Pinch: create,
    Tap: create,
    Simultaneous: jest.fn((...g) => g),
    Race: jest.fn((...g) => g),
  };
  return {
    Gesture,
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
  };
});

const photo = {
  cloudUri: 'https://remote/x.jpg',
  width: 100,
  height: 200,
  holdMarkers: [],
} as any;

describe('AnnotatedPhotoView', () => {
  describe('uri resolution (§3)', () => {
    it('renders the provided uri in preference to photo.cloudUri', () => {
      const { UNSAFE_getByType } = render(
        <AnnotatedPhotoView photo={photo} uri="file:///cache/x.jpg" enableZoom={false} enablePan={false} />
      );
      expect(UNSAFE_getByType(Image).props.source.uri).toBe('file:///cache/x.jpg');
    });

    it('falls back to photo.cloudUri when no uri is provided', () => {
      const { UNSAFE_getByType } = render(
        <AnnotatedPhotoView photo={photo} enableZoom={false} enablePan={false} />
      );
      expect(UNSAFE_getByType(Image).props.source.uri).toBe('https://remote/x.jpg');
    });
  });

  describe('offline placeholder (§4)', () => {
    it('shows the placeholder when the image fails to load', () => {
      const { UNSAFE_getByType, queryByTestId, getByTestId } = render(
        <AnnotatedPhotoView photo={photo} uri="https://remote/x.jpg" enableZoom={false} enablePan={false} />
      );
      expect(queryByTestId('photo-unavailable-placeholder')).toBeNull();
      fireEvent(UNSAFE_getByType(Image), 'error');
      expect(getByTestId('photo-unavailable-placeholder')).toBeTruthy();
    });

    it('shows the placeholder immediately when there is no uri', () => {
      const noUriPhoto = { ...photo, cloudUri: undefined, localUri: undefined };
      const { getByTestId } = render(
        <AnnotatedPhotoView photo={noUriPhoto} enableZoom={false} enablePan={false} />
      );
      expect(getByTestId('photo-unavailable-placeholder')).toBeTruthy();
    });
  });
});
