import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * RouteAnnouncer — announces page navigation to screen readers via an
 * aria-live region. Mounted once inside the Router in App.tsx.
 *
 * On each location change it waits 100 ms (to allow the page <title> to
 * update) and then sets the region's text content to document.title.
 */
export function RouteAnnouncer() {
  const location = useLocation();
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (divRef.current) {
        divRef.current.textContent = document.title;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [location]);

  return (
    <div
      ref={divRef}
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      id="route-announcer"
    />
  );
}

export default RouteAnnouncer;
