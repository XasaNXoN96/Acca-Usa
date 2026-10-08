"use client";

import { useEffect } from "react";
import { touchMaterialAction } from "./actions";

/** Records the opened material once per visit so the dashboard can offer "Continue". Failures are harmless. */
export function MaterialTouch({ materialId }: { materialId: string }) {
  useEffect(() => {
    void touchMaterialAction({ materialId });
  }, [materialId]);
  return null;
}
