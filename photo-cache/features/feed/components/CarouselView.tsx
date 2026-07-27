import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useWindowDimensions,
  ViewToken,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { RoutesById } from '../../../services/photoCache';
import { photoCacheService } from '../../../services/photoCache';
import type { Route } from '../../../shared/types/holds';
import { formatGrade } from '../../../shared/types/holds';
import { getRouteDisplayStatus, RouteDisplayStatus } from '../../../shared/utils/routeStatus';
import { FEED_PIN_STYLING, CAROUSEL_CONFIG, WALL_ANGLE_LABELS } from '../config';
import { AnnotatedPhotoView } from '../../../shared/components/AnnotatedPhotoView';
import { useCachedPhotoUri } from '../../../shared/hooks/useCachedPhotoUri';
import Avatar from '../../../shared/components/Avatar';
import { RefreshIcon } from '../../../shared/components/RefreshIcon';
import { useAuth } from '../../../context/AuthContext';
import { useSettings } from '../../../context/SettingsContext';
import { ProgressBadge, useAttemptActions, useShakeGesture, AttemptInfoModal } from '../../attempts';
import { AddToListModal } from '../../lists/components/AddToListModal';

// ============================================================
// Card Layout Configuration
// ============================================================

/**
 * Configuration for route card layout.
 * 
 * The card has a split-panel design:
 * - Header: Route name + grade with subtle background
 * - Body: Left side (metadata chips) | Right side (photo thumbnail)
 * 
 * The thumbnail is sized to exactly match the photo's aspect ratio,
 * eliminating black letterbox/pillarbox bars and maximizing space usage.
 */
const CARD_LAYOUT_CONFIG = {
  /** Percentage of card width for the left (metadata) section */
  LEFT_SECTION_PERCENTAGE: 0.33,
  
  /** Header styling */
  HEADER_PADDING_VERTICAL: 10,
  HEADER_PADDING_HORIZONTAL: 12,
  HEADER_BACKGROUND: '#f8f9fa',
  HEADER_BORDER_RADIUS: 10,
  
  /**
   * Thumbnail styling
   * 
   * THUMBNAIL_PADDING: Space between thumbnail and card edge (right/bottom).
   * THUMBNAIL_BORDER_RADIUS: Rounded corners on the thumbnail container.
   * THUMBNAIL_BACKGROUND: Background color for the thumbnail area (visible
   *                        only when no photo is available).
   */
  THUMBNAIL_PADDING: 8,
  THUMBNAIL_BORDER_RADIUS: 8,
  THUMBNAIL_BACKGROUND: '#1a1a1a',
};

/**
 * Props for CarouselView component
 */
interface CarouselViewProps {
  /** Array of route IDs to display */
  routeIds: string[];
  /** Map of route IDs to Route objects */
  routesById: RoutesById;
  /** Currently selected route ID, or null if none selected */
  selectedRouteId: string | null;
  /** Callback when a route is selected */
  onSelectRoute: (routeId: string) => void;
  /** Callback when route detail should be opened */
  onOpenRouteDetail: (routeId: string) => void;
  /** Whether filters are currently active (affects empty state message) */
  hasActiveFilters?: boolean;
  /** Callback to clear filters (shown in empty state when filters are active) */
  onClearFilters?: () => void;
  /** Callback when a creator badge is tapped on a carousel card */
  onCreatorTap?: (creatorName: string) => void;
  /**
   * Force a fresh re-subscription to routes (manual failsafe refresh). Surfaced
   * in the empty state so a user who lands on an unexpectedly empty feed (e.g. a
   * stale listener after idle) can pull fresh data without restarting the app.
   */
  onRefresh?: () => void;
  /** Whether a manual/foreground refresh is currently in flight */
  isRefreshing?: boolean;
  /**
   * Optional overlay renderer for each card.
   * Used by BulkDeleteScreen to render an "Omit / Re-include" button.
   * The returned ReactNode is absolutely positioned on top of the RouteCard.
   */
  renderCardOverlay?: (routeId: string, cardWidth: number) => React.ReactNode;
  /**
   * When true, hides all action buttons on cards (attempts, sends, +List,
   * creator filter) to reduce clutter in non-interactive modes like bulk delete.
   */
  minimalMode?: boolean;
  /**
   * Override the border colour used for the selected/focused card.
   * Defaults to FEED_PIN_STYLING.SELECTED_PIN_COLOR (red).
   */
  selectedBorderColor?: string;
  /**
   * Per-card border colour overrides keyed by route ID.
   * When a card is focused AND has an entry here, this colour takes
   * precedence over `selectedBorderColor`.
   */
  cardBorderOverrides?: Record<string, string>;
}

/**
 * Extract style tags from route attributes
 */
const getStyleChips = (route: Route): string[] => {
  if (!route.attributes?.style) return [];
  return Object.keys(route.attributes.style);
};

/**
 * Style Chip component
 */
const StyleChip: React.FC<{ label: string }> = ({ label }) => (
  <View style={styles.chip}>
    <Text style={styles.chipText}>{label}</Text>
  </View>
);

interface RouteCardProps {
  route: Route;
  isSelected: boolean;
  cardWidth: number;
  onPress: () => void;
  onQuickAttempt?: () => void;
  onQuickSend?: () => void;
  isQuickActionLoading?: boolean;
  /** Counter to trigger pulse animation on attempt button (increment to trigger) */
  attemptPulseCount?: number;
  /** Counter to trigger pulse animation on send button (increment to trigger) */
  sendPulseCount?: number;
  /** Callback when add to list button is pressed */
  onAddToList?: () => void;
  /** Callback when creator badge is tapped (quick-add to creator filter) */
  onCreatorTap?: (creatorName: string) => void;
  /** Override border colour for the selected state */
  selectedBorderColor?: string;
}

const RouteCard: React.FC<RouteCardProps> = ({
  route,
  isSelected,
  cardWidth,
  onPress,
  onQuickAttempt,
  onQuickSend,
  isQuickActionLoading = false,
  attemptPulseCount = 0,
  sendPulseCount = 0,
  onAddToList,
  onCreatorTap,
  selectedBorderColor,
}) => {
  const styleChips = getStyleChips(route);
  const photo = route.photos?.[0];
  // Resolve the thumbnail cache-first (local file:// when cached; upgrades live
  // when a background download completes).
  const singleRouteById = useMemo(() => ({ [route.id]: route }), [route]);
  const resolvedPhotoUri = useCachedPhotoUri(route.id, 0, singleRouteById);
  const { user: currentUser } = useAuth();
  const [showInfo, setShowInfo] = useState(false);
  
  // Determine route display status for soft-delete handling
  // See: plans_and_descriptions/route_cleanup_refactor.md
  const displayStatus: RouteDisplayStatus = getRouteDisplayStatus(route, currentUser?.uid ?? null);
  const isDeleted = displayStatus !== 'active';
  const photosGone = displayStatus === 'photos-deleted';
  
  // Animation values for button pulse effect
  const attemptButtonScale = useRef(new Animated.Value(1)).current;
  const sendButtonScale = useRef(new Animated.Value(1)).current;
  const attemptButtonOpacity = useRef(new Animated.Value(1)).current;
  const sendButtonOpacity = useRef(new Animated.Value(1)).current;
  
  // Track previous pulse counts to detect changes
  const prevAttemptPulseCount = useRef(attemptPulseCount);
  const prevSendPulseCount = useRef(sendPulseCount);

  // Pulse animation function - single blink
  const pulseButton = useCallback((
    scaleAnim: Animated.Value,
    opacityAnim: Animated.Value
  ) => {
    // Reset to initial state
    scaleAnim.setValue(1);
    opacityAnim.setValue(1);
    
    // Create single blink sequence: grow -> settle back to normal
    Animated.sequence([
      // Grow and brighten
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 1.4,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.7,
          duration: 150,
          useNativeDriver: true,
        }),
      ]),
      // Settle back to normal
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  // Trigger attempt button pulse when count increases
  useEffect(() => {
    if (attemptPulseCount > prevAttemptPulseCount.current) {
      pulseButton(attemptButtonScale, attemptButtonOpacity);
    }
    prevAttemptPulseCount.current = attemptPulseCount;
  }, [attemptPulseCount, pulseButton, attemptButtonScale, attemptButtonOpacity]);

  // Trigger send button pulse when count increases
  useEffect(() => {
    if (sendPulseCount > prevSendPulseCount.current) {
      pulseButton(sendButtonScale, sendButtonOpacity);
    }
    prevSendPulseCount.current = sendPulseCount;
  }, [sendPulseCount, pulseButton, sendButtonScale, sendButtonOpacity]);
  
  // Get username - if it's the current user, use their displayName
  // Otherwise, we'd need to fetch it (for now, we'll show it only if it's the current user)
  const authorUsername = useMemo(() => {
    if (route.createdBy && currentUser && route.createdBy === currentUser.uid) {
      return currentUser.displayName || null;
    }
    // TODO: Fetch username for other users if needed
    // For now, return null if it's not the current user
    return null;
  }, [route.createdBy, currentUser]);

  // ============================================================
  // Dynamic Thumbnail Sizing
  // ============================================================
  // 
  // We measure the available space in the thumbnail section, then calculate
  // the optimal dimensions to display the photo at its native aspect ratio.
  // This eliminates wasted space from letterboxing/pillarboxing.
  //
  // The flow:
  // 1. thumbnailSectionLayout is null initially → show placeholder/loading
  // 2. onLayout fires → we capture available width/height
  // 3. thumbnailDimensions is computed → render photo at exact size
  
  const [thumbnailSectionLayout, setThumbnailSectionLayout] = useState<{
    width: number;
    height: number;
  } | null>(null);

  /**
   * Handle layout measurement of the thumbnail section.
   * Called by React Native when the View's dimensions are determined.
   */
  const handleThumbnailSectionLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setThumbnailSectionLayout({ width, height });
  }, []);

  /**
   * Calculate the optimal thumbnail dimensions.
   * 
   * Given the available space and the photo's aspect ratio, we compute
   * the largest possible dimensions that:
   * - Fit entirely within the available space (minus padding)
   * - Maintain the photo's original aspect ratio (no stretching)
   * 
   * For portrait photos (taller than wide), we typically constrain by width.
   * For landscape photos (wider than tall), we typically constrain by height.
   */
  const thumbnailDimensions = useMemo(() => {
    if (!thumbnailSectionLayout || !photo) return null;

    const padding = CARD_LAYOUT_CONFIG.THUMBNAIL_PADDING;
    const availableWidth = thumbnailSectionLayout.width - padding;
    const availableHeight = thumbnailSectionLayout.height - padding;

    // Photo aspect ratio: width / height
    // > 1 means landscape, < 1 means portrait
    const photoAspect = photo.width / photo.height;

    // Strategy: Try fitting by height first, then check if it exceeds width
    let thumbnailWidth = availableHeight * photoAspect;
    let thumbnailHeight = availableHeight;

    // If the calculated width is too large, constrain by width instead
    if (thumbnailWidth > availableWidth) {
      thumbnailWidth = availableWidth;
      thumbnailHeight = availableWidth / photoAspect;
    }

    return { width: thumbnailWidth, height: thumbnailHeight };
  }, [thumbnailSectionLayout, photo]);

  // Thumbnail config: thicker stroke for visibility at small sizes
  const thumbnailConfig = useMemo(() => ({
    strokeWidthNormalized: 0.012, // Thicker stroke for small thumbnails
    backgroundColor: CARD_LAYOUT_CONFIG.THUMBNAIL_BACKGROUND,
    minScale: 1,
    maxScale: 1, // No zoom for thumbnails
  }), []);

  // Calculate section widths (as DimensionValue for TypeScript)
  const leftWidth = `${CARD_LAYOUT_CONFIG.LEFT_SECTION_PERCENTAGE * 100}%` as const;
  const rightWidth = `${(1 - CARD_LAYOUT_CONFIG.LEFT_SECTION_PERCENTAGE) * 100}%` as const;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.cardContainer,
        { width: cardWidth, marginHorizontal: CAROUSEL_CONFIG.CARD_GAP / 2 },
      ]}
    >
      <View style={[
        styles.card,
        isSelected && styles.cardSelected,
        isSelected && selectedBorderColor ? { borderColor: selectedBorderColor } : undefined,
        isDeleted && styles.cardDeleted,
      ]}>
        {/* Deleted badge overlay */}
        {isDeleted && (
          <View style={styles.deletedBadge}>
            <Text style={styles.deletedBadgeText}>Removed</Text>
          </View>
        )}
        
        {/* Header: Name + Add to List + Grade + Progress Badge */}
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <Text style={[styles.routeName, isDeleted && styles.textMuted]} numberOfLines={1}>
              {route.name || 'Unnamed Route'}
            </Text>
            {/* Add to List button - only show for logged-in users on non-deleted routes */}
            {onAddToList && !isDeleted && (
              <TouchableOpacity
                style={styles.addToListButton}
                onPress={(e) => {
                  e.stopPropagation();
                  onAddToList();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Text style={styles.addToListText}>+List</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.headerRight}>
            {!isDeleted && <ProgressBadge routeId={route.id} size="medium" />}
            <Text style={[styles.grade, isDeleted && styles.gradeMuted]}>{formatGrade(route.grade)}</Text>
          </View>
        </View>

        {/* Creator attribution row — tappable to quick-add creator filter */}
        {route.createdByDisplayName && (
          <TouchableOpacity
            style={styles.creatorRow}
            activeOpacity={0.6}
            disabled={!onCreatorTap}
            onPress={(e) => {
              e.stopPropagation();
              onCreatorTap?.(route.createdByDisplayName!);
            }}
          >
            <Avatar
              name={route.createdByDisplayName}
              photoURL={route.createdByPhotoURL}
              size="large"
            />
            <Text style={styles.creatorName} numberOfLines={1}>
              {route.createdByDisplayName}
            </Text>
          </TouchableOpacity>
        )}

        {/* Body: Split view */}
        <View style={styles.cardBody}>
          {/* Left section: Metadata + Quick Actions */}
          <View style={[styles.metadataSection, { width: leftWidth }]}>
            {/* Metadata content */}
            <View style={styles.metadataContent}>
              {/* Style chips */}
              {styleChips.length > 0 && (
                <View style={styles.chipColumn}>
                  {styleChips.slice(0, 3).map((chip) => (
                    <StyleChip key={chip} label={chip} />
                  ))}
                  {styleChips.length > 3 && (
                    <Text style={styles.moreChips}>+{styleChips.length - 3} more</Text>
                  )}
                </View>
              )}

              {/* Wall angle */}
              {route.wallAngle !== undefined && (
                <Text style={styles.wallAngle}>
                  {WALL_ANGLE_LABELS[route.wallAngle] || `Angle ${route.wallAngle}`}
                </Text>
              )}

              {/* Author username (if available) */}
              {authorUsername && (
                <Text style={styles.authorName}>
                  {authorUsername}
                </Text>
              )}

              {/* Set By chip */}
              {route.setBy && (
                <View style={styles.setByChip}>
                  <Text style={styles.setByChipText}>
                    {route.setBy === 'setter' ? 'Official' : 'DIY'}
                  </Text>
                </View>
              )}
            </View>

            {/* Quick Action Buttons - bottom of left section (hidden for deleted routes) */}
            {(onQuickAttempt || onQuickSend) && currentUser && !isDeleted && (
              <View style={styles.quickActionRow}>
                {onQuickAttempt && (
                  <Animated.View
                    style={{
                      transform: [{ scale: attemptButtonScale }],
                      opacity: attemptButtonOpacity,
                    }}
                  >
                    <TouchableOpacity
                      style={[styles.quickActionButton, styles.quickAttemptButton]}
                      onPress={(e) => {
                        e.stopPropagation();
                        onQuickAttempt();
                      }}
                      disabled={isQuickActionLoading}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickActionText}>+1</Text>
                    </TouchableOpacity>
                  </Animated.View>
                )}
                {onQuickSend && (
                  <Animated.View
                    style={{
                      transform: [{ scale: sendButtonScale }],
                      opacity: sendButtonOpacity,
                    }}
                  >
                    <TouchableOpacity
                      style={[styles.quickActionButton, styles.quickSendButton]}
                      onPress={(e) => {
                        e.stopPropagation();
                        onQuickSend();
                      }}
                      disabled={isQuickActionLoading}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickActionText}>✓</Text>
                    </TouchableOpacity>
                  </Animated.View>
                )}
                {/* Legend — explains the quick-action circles + progress badge. */}
                <TouchableOpacity
                  style={styles.quickInfoButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    setShowInfo(true);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="What do these buttons mean?"
                >
                  <Text style={styles.quickInfoText}>?</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Right section: Photo thumbnail */}
          <View
            style={[styles.thumbnailSection, { width: rightWidth }]}
            onLayout={handleThumbnailSectionLayout}
          >
            {photosGone ? (
              // Photos have been hard-deleted - show placeholder
              <View style={styles.photoPlaceholder}>
                <Text style={styles.placeholderText}>Photo unavailable</Text>
              </View>
            ) : photo && thumbnailDimensions ? (
              // Render thumbnail at exact dimensions with rounded corners
              // The container is sized to match the photo's aspect ratio exactly
              <View
                style={[
                  styles.thumbnailWrapper,
                  {
                    width: thumbnailDimensions.width,
                    height: thumbnailDimensions.height,
                  },
                ]}
              >
                <AnnotatedPhotoView
                  photo={photo}
                  uri={resolvedPhotoUri}
                  enableZoom={false}
                  enablePan={false}
                  config={thumbnailConfig}
                />
              </View>
            ) : (
              <View style={styles.noPhotoPlaceholder}>
                <Text style={styles.noPhotoText}>
                  {photo ? '' : 'No photo'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Legend popup (attempt/send circles + progress badge colours) */}
      <AttemptInfoModal
        visible={showInfo}
        onClose={() => setShowInfo(false)}
        showBadgeLegend
      />
    </TouchableOpacity>
  );
};

/**
 * CarouselView component
 *
 * Displays horizontally scrollable route cards with bidirectional sync to MapView.
 *
 * Responsibilities:
 * - Render horizontally scrollable route cards for routeIds
 * - Maintain scroll position and detect which card is "focused"
 * - When the focused card changes → call onSelectRoute(routeId)
 * - When user taps a card → call onOpenRouteDetail(routeId)
 * - Show empty state with CTA when no routes are available
 *
 * Bidirectional Sync:
 * - When selectedRouteId prop changes (from pin tap), scroll to that card
 * - When user scrolls to a different card, call onSelectRoute AFTER scroll ends
 * - Selection only fires when scroll gesture is complete (finger lifted AND momentum ended)
 * - This prevents rapid selection changes during scrolling and ensures reliable auto-focus
 */
const CarouselView: React.FC<CarouselViewProps> = ({
  routeIds,
  routesById,
  selectedRouteId,
  onSelectRoute,
  onOpenRouteDetail,
  hasActiveFilters = false,
  onClearFilters,
  onCreatorTap,
  onRefresh,
  isRefreshing = false,
  renderCardOverlay,
  minimalMode = false,
  selectedBorderColor,
  cardBorderOverrides,
}) => {
  const navigation = useNavigation();
  const { width: windowWidth } = useWindowDimensions();
  const flatListRef = useRef<FlatList>(null);
  const { settings } = useSettings();
  const { user } = useAuth();
  
  // State for Add to List modal
  const [addToListRouteId, setAddToListRouteId] = useState<string | null>(null);
  const addToListRoute = addToListRouteId ? routesById[addToListRouteId] : null;

  // Get current route data for shake gesture logging
  const currentRoute = selectedRouteId ? routesById[selectedRouteId] : null;

  // Attempt actions for shake gesture logging
  const {
    logAttempt,
    isLoading: isAttemptLoading,
  } = useAttemptActions({
    routeId: selectedRouteId || '',
    gymId: settings.gymId || '',
    mapId: currentRoute?.mapId || '',
    routeGrade: currentRoute?.grade !== undefined
      ? formatGrade(currentRoute.grade)
      : 'Unknown',
    routeAngle: currentRoute?.wallAngle !== undefined
      ? String(currentRoute.wallAngle)
      : undefined,
  });

  // Track if we used shake gesture (for auto-scroll)
  const shakeGestureUsedRef = useRef(false);

  // State for triggering button pulse animations
  // We use a counter so each increment triggers a new animation
  const [attemptPulseCount, setAttemptPulseCount] = useState(0);
  const [sendPulseCount, setSendPulseCount] = useState(0);

  // Auto-scroll to next card after send/flash via shake gesture
  const scrollToNextCard = useCallback(() => {
    if (!selectedRouteId || routeIds.length === 0) return;

    const currentIndex = routeIds.indexOf(selectedRouteId);
    const nextIndex = currentIndex + 1;

    // Only scroll if there's a next card
    if (nextIndex < routeIds.length && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index: nextIndex,
        animated: true,
        viewPosition: 0.5,
      });
    }
  }, [selectedRouteId, routeIds]);

  // Shake gesture handlers
  const handleTwoShakes = useCallback(() => {
    if (!user || !selectedRouteId || !settings.gymId || isAttemptLoading) return;

    // 2 shakes = send (or flash if no prior attempts)
    // For simplicity, we'll log as 'send' - the user can use flash from detail screen
    shakeGestureUsedRef.current = true;
    
    // Trigger send button pulse animation
    setSendPulseCount(c => c + 1);
    
    logAttempt('send').then((result) => {
      if (result && settings.autoScrollOnSend) {
        // Auto-scroll to next card after successful send (if enabled)
        setTimeout(scrollToNextCard, 500);
      }
      shakeGestureUsedRef.current = false;
    });
  }, [user, selectedRouteId, settings.gymId, settings.autoScrollOnSend, isAttemptLoading, logAttempt, scrollToNextCard]);

  const handleThreeShakes = useCallback(() => {
    if (!user || !selectedRouteId || !settings.gymId || isAttemptLoading) return;

    // 3 shakes = attempt (no auto-scroll)
    // Trigger attempt button pulse animation
    setAttemptPulseCount(c => c + 1);
    
    logAttempt('attempt');
  }, [user, selectedRouteId, settings.gymId, isAttemptLoading, logAttempt]);

  // Enable shake gesture detection
  useShakeGesture({
    enabled: !!settings.shakeGesturesEnabled && !!user && !!selectedRouteId,
    onTwoShakes: handleTwoShakes,
    onThreeShakes: handleThreeShakes,
    configOverrides: settings.shakeConfig,
  });

  // Refs to access current values in callbacks without stale closures
  // This is necessary because onViewableItemsChanged must be a stable reference
  // for FlatList, but we need access to the latest prop values
  const selectedRouteIdRef = useRef(selectedRouteId);
  const onSelectRouteRef = useRef(onSelectRoute);

  // Track the currently viewed route (updated during scroll, but selection only fires on scroll end)
  const currentlyViewedRouteRef = useRef<string | null>(null);
  
  // Track if we're in an active scroll gesture (finger down or momentum active)
  const isScrollingRef = useRef(false);
  
  // Track if we're in a programmatic scroll (triggered by selectedRouteId change from external source)
  // When true, we suppress fireSelectionIfChanged to prevent ping-pong loops between
  // FeedScreenContainer's selection effect and CarouselView's viewability detection.
  // See bug fix: https://github.com/... (selection ping-pong loop)
  const isProgrammaticScrollRef = useRef(false);

  // Keep refs in sync with props
  useEffect(() => {
    selectedRouteIdRef.current = selectedRouteId;
  }, [selectedRouteId]);

  useEffect(() => {
    onSelectRouteRef.current = onSelectRoute;
  }, [onSelectRoute]);

  // Calculate card dimensions
  const cardWidth = windowWidth * CAROUSEL_CONFIG.CARD_WIDTH_FRACTION;
  const snapInterval = cardWidth + CAROUSEL_CONFIG.CARD_GAP;

  // Viewability configuration for detecting focused card
  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  // Handle viewable items change - just track what's visible, don't select yet
  // Selection only happens when scroll gesture ends (see handleScrollEnd)
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        const focusedItem = viewableItems[0];
        const focusedRouteId = focusedItem.item as string;
        // Just track the currently viewed route - don't fire selection yet
        currentlyViewedRouteRef.current = focusedRouteId;
      }
    }
  ).current;

  /**
   * Fire selection for the currently viewed route.
   * Called when scroll gesture ends (drag end without momentum, or momentum end).
   * 
   * IMPORTANT: This is suppressed during programmatic scrolls to prevent ping-pong loops.
   * When FeedScreenContainer sets selectedRouteId (e.g., after filter change), it triggers
   * a scroll here. If we then fire selection based on viewability during that scroll,
   * it can create an infinite loop of selection changes.
   */
  const fireSelectionIfChanged = useCallback(() => {
    // Skip if we're in a programmatic scroll (triggered by external selectedRouteId change)
    // This prevents ping-pong loops between selection effect and viewability detection
    if (isProgrammaticScrollRef.current) {
      return;
    }
    
    const focusedRouteId = currentlyViewedRouteRef.current;
    if (focusedRouteId && focusedRouteId !== selectedRouteIdRef.current) {
      onSelectRouteRef.current(focusedRouteId);
    }
    
    // Trigger preload for images around the focused route
    if (focusedRouteId && photoCacheService.isInitialized()) {
      const focusedIndex = routeIds.indexOf(focusedRouteId);
      if (focusedIndex >= 0) {
        photoCacheService.preload(routeIds, focusedIndex, routesById);
      }
    }
  }, [routeIds, routesById]);

  // Handle scroll begin - mark that we're in an active scroll
  const handleScrollBeginDrag = useCallback(() => {
    isScrollingRef.current = true;
    // User started scrolling manually, so clear the programmatic scroll flag
    // This ensures that user scrolls can trigger selection changes
    isProgrammaticScrollRef.current = false;
  }, []);

  // Handle scroll end drag - fires when user lifts finger
  // If there's no momentum (slow scroll), we need to fire selection here
  const handleScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const velocity = e.nativeEvent.velocity;
      // If velocity is very low, there won't be momentum, so fire selection now
      // (onMomentumScrollEnd won't be called in this case)
      if (!velocity || Math.abs(velocity.x || 0) < 0.5) {
        isScrollingRef.current = false;
        fireSelectionIfChanged();
      }
      // Otherwise, wait for onMomentumScrollEnd
    },
    [fireSelectionIfChanged]
  );

  // Handle momentum scroll end - fires when scroll animation stops
  const handleMomentumScrollEnd = useCallback(() => {
    isScrollingRef.current = false;
    fireSelectionIfChanged();
  }, [fireSelectionIfChanged]);

  // Scroll to selected route when selectedRouteId changes (from external source like pin tap)
  useEffect(() => {
    if (!selectedRouteId || routeIds.length === 0) {
      return;
    }

    const index = routeIds.indexOf(selectedRouteId);
    
    if (index >= 0 && flatListRef.current) {
      // Mark that we're starting a programmatic scroll
      // This prevents fireSelectionIfChanged from creating a ping-pong loop
      isProgrammaticScrollRef.current = true;
      
      // Update the currently viewed ref so we don't re-fire selection
      currentlyViewedRouteRef.current = selectedRouteId;
      
      // Trigger preload for images around this route
      if (photoCacheService.isInitialized()) {
        photoCacheService.preload(routeIds, index, routesById);
      }
      
      // Small delay to ensure FlatList is fully laid out after mount/remount
      const scrollTimeout = setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToIndex({
            index,
            animated: false,
            viewPosition: 0.5, // Center the card
          });
        }
        
        // Clear the programmatic scroll flag after scroll has settled
        // Use a longer delay to account for any scroll-related events that might fire
        setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 150);
      }, 50);
      
      return () => {
        clearTimeout(scrollTimeout);
        // Also clear the flag on cleanup to avoid stuck state
        isProgrammaticScrollRef.current = false;
      };
    }
  }, [selectedRouteId, routeIds, routesById]);

  // Handle card press → open route detail
  const handleCardPress = useCallback(
    (routeId: string) => {
      onOpenRouteDetail(routeId);
    },
    [onOpenRouteDetail]
  );

  // Handle "Create Route" button press. Email-verification gating is enforced
  // at the route-editor chokepoint (RouteEditorStack), so this just navigates.
  const handleCreateRoute = useCallback(() => {
    (navigation as any).navigate('RouteEditor');
  }, [navigation]);

  // Quick action handlers for the focused card
  const handleQuickAttempt = useCallback(() => {
    if (!user || !selectedRouteId || !settings.gymId || isAttemptLoading) return;
    
    // Trigger attempt button pulse animation
    setAttemptPulseCount(c => c + 1);
    
    logAttempt('attempt');
  }, [user, selectedRouteId, settings.gymId, isAttemptLoading, logAttempt]);

  const handleQuickSend = useCallback(() => {
    if (!user || !selectedRouteId || !settings.gymId || isAttemptLoading) return;
    
    // Trigger send button pulse animation
    setSendPulseCount(c => c + 1);
    
    logAttempt('send').then((result) => {
      if (result && settings.autoScrollOnSend) {
        // Auto-scroll to next card after successful send (if enabled)
        setTimeout(scrollToNextCard, 500);
      }
    });
  }, [user, selectedRouteId, settings.gymId, settings.autoScrollOnSend, isAttemptLoading, logAttempt, scrollToNextCard]);

  // Handle opening Add to List modal
  const handleAddToList = useCallback((routeId: string) => {
    setAddToListRouteId(routeId);
  }, []);

  // Render individual route card
  const renderItem = useCallback(
    ({ item: routeId }: { item: string }) => {
      const route = routesById[routeId];
      
      // Handle missing (hard-deleted) routes when viewing a list
      // Show a placeholder card instead of nothing
      if (!route) {
        return (
          <View
            style={[
              styles.cardContainer,
              { width: cardWidth, marginHorizontal: CAROUSEL_CONFIG.CARD_GAP / 2 },
            ]}
          >
            <View style={styles.missingCard}>
              <Text style={styles.missingCardIcon}>🗑️</Text>
              <Text style={styles.missingCardTitle}>Route Removed</Text>
              <Text style={styles.missingCardText}>
                This route has been permanently deleted
              </Text>
              <Text style={styles.missingCardHint}>
                Consider removing it from your list
              </Text>
            </View>
          </View>
        );
      }

      // Only show quick action buttons on the selected/focused card
      const isFocused = routeId === selectedRouteId;
      const overlay = renderCardOverlay ? renderCardOverlay(routeId, cardWidth) : null;

      return (
        <View style={{ width: cardWidth, marginHorizontal: CAROUSEL_CONFIG.CARD_GAP / 2 }}>
          <RouteCard
            route={route}
            isSelected={isFocused}
            cardWidth={cardWidth}
            onPress={() => handleCardPress(routeId)}
            onQuickAttempt={!minimalMode && isFocused && user ? handleQuickAttempt : undefined}
            onQuickSend={!minimalMode && isFocused && user ? handleQuickSend : undefined}
            isQuickActionLoading={!minimalMode && isAttemptLoading}
            attemptPulseCount={!minimalMode && isFocused ? attemptPulseCount : 0}
            sendPulseCount={!minimalMode && isFocused ? sendPulseCount : 0}
            onAddToList={!minimalMode && user ? () => handleAddToList(routeId) : undefined}
            onCreatorTap={!minimalMode ? onCreatorTap : undefined}
            selectedBorderColor={cardBorderOverrides?.[routeId] ?? selectedBorderColor}
          />
          {overlay}
        </View>
      );
    },
    [routesById, selectedRouteId, cardWidth, handleCardPress, user, handleQuickAttempt, handleQuickSend, isAttemptLoading, attemptPulseCount, sendPulseCount, handleAddToList, onCreatorTap, renderCardOverlay, minimalMode, selectedBorderColor, cardBorderOverrides]
  );

  // Key extractor
  const keyExtractor = useCallback((routeId: string) => routeId, []);

  // Get item layout for performance (fixed-size cards)
  const getItemLayout = useCallback(
    (_data: ArrayLike<string> | null | undefined, index: number) => ({
      length: snapInterval,
      offset: snapInterval * index + CAROUSEL_CONFIG.CONTENT_PADDING,
      index,
    }),
    [snapInterval]
  );

  // Handle scroll to index failure (can happen if list hasn't rendered yet)
  // This is a fallback that should rarely fire since we provide getItemLayout.
  // Uses setTimeout as a simple retry mechanism.
  const onScrollToIndexFailed = useCallback(
    (info: { index: number; highestMeasuredFrameIndex: number }) => {
      // Wait a bit and try again
      setTimeout(() => {
        if (flatListRef.current && routeIds.length > info.index) {
          flatListRef.current.scrollToIndex({
            index: info.index,
            animated: false,
            viewPosition: 0.5,
          });
        }
      }, 100);
    },
    [routeIds.length]
  );

  // Calculate initial scroll index for reliable positioning on mount.
  // This ensures the selected card is centered even when the component remounts
  // (e.g., after a gym change and navigation reset).
  // Note: This hook must be called before any early returns to follow React's rules of hooks.
  const initialScrollIndex = useMemo(() => {
    if (!selectedRouteId || routeIds.length === 0) {
      return 0;
    }
    const index = routeIds.indexOf(selectedRouteId);
    return index >= 0 ? index : 0;
  }, [selectedRouteId, routeIds]);

  // Secondary "Refresh" affordance shown in the empty state. Rebuilds the route
  // listener so a stale/empty feed can recover without an app restart.
  const renderRefreshLink = () => (
    <TouchableOpacity
      style={styles.refreshLink}
      onPress={onRefresh}
      disabled={isRefreshing}
      accessibilityRole="button"
      accessibilityLabel="Refresh routes"
    >
      {isRefreshing ? (
        <ActivityIndicator size="small" color="#666" />
      ) : (
        <>
          <RefreshIcon size={16} color="#666" />
          <Text style={styles.refreshLinkText}>Refresh</Text>
        </>
      )}
    </TouchableOpacity>
  );

  // Empty state
  if (routeIds.length === 0) {
    // Different message depending on whether filters are active
    if (hasActiveFilters) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            No routes match your filters
          </Text>
          {onClearFilters && (
            <TouchableOpacity style={styles.ctaButton} onPress={onClearFilters}>
              <Text style={styles.ctaButtonText}>Clear Filters</Text>
            </TouchableOpacity>
          )}
          {onRefresh && renderRefreshLink()}
        </View>
      );
    }
    
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          Be the first to set a custom route on this floor!
        </Text>
        <TouchableOpacity style={styles.ctaButton} onPress={handleCreateRoute}>
          <Text style={styles.ctaButtonText}>Create Route</Text>
        </TouchableOpacity>
        {onRefresh && renderRefreshLink()}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={routeIds}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={snapInterval}
        decelerationRate="fast"
        contentContainerStyle={{
          paddingHorizontal:
            CAROUSEL_CONFIG.CONTENT_PADDING - CAROUSEL_CONFIG.CARD_GAP / 2,
        }}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        getItemLayout={getItemLayout}
        onScrollToIndexFailed={onScrollToIndexFailed}
        // Initial positioning: ensures card is centered on mount/remount
        initialScrollIndex={initialScrollIndex}
        // Performance optimizations
        removeClippedSubviews
        maxToRenderPerBatch={5}
        windowSize={5}
        initialNumToRender={Math.max(3, initialScrollIndex + 2)} // Ensure initial card is rendered
      />
      
      {/* Add to List Modal */}
      {addToListRoute && (
        <AddToListModal
          visible={!!addToListRouteId}
          routeId={addToListRouteId!}
          routeName={addToListRoute.name || 'Unnamed Route'}
          isOwnRoute={!!(user && addToListRoute.createdBy === user.uid)}
          onClose={() => setAddToListRouteId(null)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 245, 245, 0.95)',
  },
  // Card container (handles margins)
  cardContainer: {
    flex: 1,
    paddingVertical: 8,
  },
  // Card styling
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardSelected: {
    borderColor: FEED_PIN_STYLING.SELECTED_PIN_COLOR,
  },
  // Deleted card styling (greyed out)
  cardDeleted: {
    opacity: 0.6,
    backgroundColor: '#f3f4f6',
  },
  // Deleted badge overlay
  deletedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 10,
  },
  deletedBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // Card header
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CARD_LAYOUT_CONFIG.HEADER_BACKGROUND,
    paddingVertical: CARD_LAYOUT_CONFIG.HEADER_PADDING_VERTICAL,
    paddingHorizontal: CARD_LAYOUT_CONFIG.HEADER_PADDING_HORIZONTAL,
    borderTopLeftRadius: CARD_LAYOUT_CONFIG.HEADER_BORDER_RADIUS,
    borderTopRightRadius: CARD_LAYOUT_CONFIG.HEADER_BORDER_RADIUS,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0, // Allow shrinking for long names
  },
  routeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flexShrink: 1,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: CARD_LAYOUT_CONFIG.HEADER_PADDING_HORIZONTAL,
    paddingBottom: 6,
    gap: 6,
  },
  creatorName: {
    fontSize: 12,
    color: '#666',
    flexShrink: 1,
  },
  addToListButton: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  addToListText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  grade: {
    fontSize: 14,
    fontWeight: '700',
    color: '#555',
    backgroundColor: '#e9ecef',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  gradeMuted: {
    color: '#9ca3af',
    backgroundColor: '#e5e7eb',
  },
  // Muted text for deleted routes
  textMuted: {
    color: '#9ca3af',
  },
  // Card body: split view
  cardBody: {
    flex: 1,
    flexDirection: 'row',
  },
  // Left section: metadata
  metadataSection: {
    padding: 10,
    justifyContent: 'space-between',
  },
  metadataContent: {
    flex: 1,
  },
  // Chips in column layout
  chipColumn: {
    flexDirection: 'column',
  },
  chip: {
    backgroundColor: '#e8f4fd',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  chipText: {
    fontSize: 11,
    color: '#4A90E2',
    fontWeight: '500',
  },
  moreChips: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  // Wall angle
  wallAngle: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
  },
  // Author name
  authorName: {
    fontSize: 11,
    color: '#888',
    marginTop: 8,
    fontWeight: '500',
  },
  // Set By chip
  setByChip: {
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  setByChipText: {
    fontSize: 11,
    color: '#555',
    fontWeight: '600',
  },
  // Quick action buttons
  quickActionRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  quickActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  quickAttemptButton: {
    backgroundColor: '#FDD835', // Yellow (working on it)
  },
  quickSendButton: {
    backgroundColor: '#E53935', // Red (sent/completed)
  },
  quickActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  // Small "?" legend trigger beside the quick-action circles
  quickInfoButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#9ca3af',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  quickInfoText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 15,
  },
  // Right section: thumbnail container
  // This section holds the dynamically-sized thumbnail.
  // The thumbnail is aligned to the top-right, with padding on right/bottom.
  thumbnailSection: {
    flex: 1,
    alignItems: 'flex-end',      // Align thumbnail to right edge
    justifyContent: 'flex-start', // Align thumbnail to top
    paddingTop: CARD_LAYOUT_CONFIG.THUMBNAIL_PADDING / 2,
  },
  // Wrapper for the actual thumbnail content.
  // Sized dynamically to match photo aspect ratio exactly.
  // Includes rounded corners and clips overflow to show rounded edges.
  thumbnailWrapper: {
    borderRadius: CARD_LAYOUT_CONFIG.THUMBNAIL_BORDER_RADIUS,
    overflow: 'hidden',
    // Spacing from card edges (matches bottom padding from size calculation)
    marginRight: CARD_LAYOUT_CONFIG.THUMBNAIL_PADDING,
    marginBottom: CARD_LAYOUT_CONFIG.THUMBNAIL_PADDING / 2,
    // Small shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  // Placeholder shown when no photo is available
  noPhotoPlaceholder: {
    flex: 1,
    backgroundColor: CARD_LAYOUT_CONFIG.THUMBNAIL_BACKGROUND,
    borderRadius: CARD_LAYOUT_CONFIG.THUMBNAIL_BORDER_RADIUS,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: CARD_LAYOUT_CONFIG.THUMBNAIL_PADDING,
    marginBottom: CARD_LAYOUT_CONFIG.THUMBNAIL_PADDING,
  },
  noPhotoText: {
    color: '#666',
    fontSize: 12,
  },
  // Placeholder for deleted routes where photos have been hard-deleted
  photoPlaceholder: {
    flex: 1,
    backgroundColor: '#d1d5db',
    borderRadius: CARD_LAYOUT_CONFIG.THUMBNAIL_BORDER_RADIUS,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: CARD_LAYOUT_CONFIG.THUMBNAIL_PADDING,
    marginBottom: CARD_LAYOUT_CONFIG.THUMBNAIL_PADDING,
  },
  placeholderText: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
  },
  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  ctaButton: {
    backgroundColor: FEED_PIN_STYLING.SELECTED_PIN_COLOR,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  ctaButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  refreshLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 32,
  },
  refreshLinkText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  // Missing route card (for hard-deleted routes in lists)
  missingCard: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  missingCardIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  missingCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  missingCardText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 8,
  },
  missingCardHint: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});

export default CarouselView;
