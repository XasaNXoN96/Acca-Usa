"use client";

import { useEffect } from "react";
import { touchTopicAction } from "./actions";

/** Marks the topic as "started" once, after it is opened. Fire-and-forget; failures are harmless. */
export function TopicTouch({ topicId, active }: { topicId: string; active: boolean }) {
  useEffect(() => {
    if (active) void touchTopicAction({ topicId });
  }, [topicId, active]);
  return null;
}
