"use client";
import { useState, useEffect, useCallback, useRef } from "react";

const CHAR_INTERVAL_MS = 100;
const START_DELAY_MS = 280;

export function useKeywordParam(initialKeyword: string) {
  const [value, setValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const timers = useRef<{ interval?: ReturnType<typeof setInterval>; timeout?: ReturnType<typeof setTimeout> }>({});

  const cancelTyping = useCallback(() => {
    clearTimeout(timers.current.timeout);
    clearInterval(timers.current.interval);
    setIsTyping(false);
  }, []);

  // External set (askAI, scheduledEntry effects) cancels typewriter and sets directly
  const set = useCallback((v: string) => {
    cancelTyping();
    setValue(v);
  }, [cancelTyping]);

  useEffect(() => {
    if (!initialKeyword) return;
    let i = 0;
    timers.current.timeout = setTimeout(() => {
      setIsTyping(true);
      timers.current.interval = setInterval(() => {
        i++;
        setValue(initialKeyword.slice(0, i));
        if (i >= initialKeyword.length) {
          clearInterval(timers.current.interval);
          setIsTyping(false);
        }
      }, CHAR_INTERVAL_MS);
    }, START_DELAY_MS);
    return cancelTyping;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { value, setValue: set, isTyping };
}
