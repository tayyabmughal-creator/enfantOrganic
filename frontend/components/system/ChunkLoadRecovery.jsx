"use client";

import { useEffect } from "react";

const CHUNK_RECOVERY_SESSION_KEY = "enfant-chunk-recovery-v1";

function getErrorMessage(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value?.message === "string") return value.message;
  if (typeof value?.reason?.message === "string") return value.reason.message;
  if (typeof value?.reason === "string") return value.reason;
  return "";
}

function isChunkLoadFailure(value) {
  const message = getErrorMessage(value).toLowerCase();
  if (!message) return false;
  return (
    message.includes("chunkloaderror") ||
    message.includes("loading chunk") ||
    message.includes("failed to fetch dynamically imported module")
  );
}

export default function ChunkLoadRecovery() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;

    const recover = () => {
      try {
        if (window.sessionStorage.getItem(CHUNK_RECOVERY_SESSION_KEY) === "1") {
          return;
        }
        window.sessionStorage.setItem(CHUNK_RECOVERY_SESSION_KEY, "1");
      } catch {
        return;
      }

      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("__chunk_reload", String(Date.now()));
      window.location.replace(nextUrl.toString());
    };

    const onWindowError = (event) => {
      if (isChunkLoadFailure(event?.error || event?.message || event)) {
        recover();
      }
    };

    const onUnhandledRejection = (event) => {
      if (isChunkLoadFailure(event)) {
        recover();
      }
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
