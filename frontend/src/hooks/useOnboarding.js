import { useState, useCallback } from "react";

const TOUR_KEY = "jaryan_has_seen_tour";
const WIDGET_KEY = "jaryan_quick_start_dismissed";

/**
 * Central hook for managing the onboarding experience.
 * Persists state in localStorage so it survives page refreshes.
 */
export function useOnboarding() {
  const [hasSeen, setHasSeen] = useState(
    () => localStorage.getItem(TOUR_KEY) === "true"
  );
  const [widgetDismissed, setWidgetDismissed] = useState(
    () => localStorage.getItem(WIDGET_KEY) === "true"
  );

  const markTourSeen = useCallback(() => {
    localStorage.setItem(TOUR_KEY, "true");
    setHasSeen(true);
  }, []);

  const dismissWidget = useCallback(() => {
    localStorage.setItem(WIDGET_KEY, "true");
    setWidgetDismissed(true);
  }, []);

  const restartTour = useCallback(() => {
    localStorage.removeItem(TOUR_KEY);
    setHasSeen(false);
  }, []);

  return {
    hasSeen,
    widgetDismissed,
    markTourSeen,
    dismissWidget,
    restartTour,
  };
}
