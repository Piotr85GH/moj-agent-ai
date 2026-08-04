"use client";

import { useEffect } from "react";

export function PwaInstaller() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // PWA still works as a regular site if service worker registration fails.
    });
  }, []);

  return null;
}
