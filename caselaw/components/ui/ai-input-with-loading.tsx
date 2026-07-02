"use client";

import { CornerRightUp } from "lucide-react";
import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAutoResizeTextarea } from "@/components/hooks/use-auto-resize-textarea";

interface AIInputWithLoadingProps {
  id?: string;
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  loadingDuration?: number;
  thinkingDuration?: number;
  onSubmit?: (value: string) => void | Promise<void>;
  className?: string;
  autoAnimate?: boolean;
}

export function AIInputWithLoading({
  id = "ai-input-with-loading",
  placeholder = "Ask me anything!",
  minHeight = 56,
  maxHeight = 200,
  loadingDuration = 3000,
  thinkingDuration = 1000,
  onSubmit,
  className,
  autoAnimate = false,
}: AIInputWithLoadingProps) {
  const [inputValue, setInputValue] = useState("");
  const [submitted, setSubmitted] = useState(autoAnimate);
  const [isAnimating] = useState(autoAnimate);

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight,
    maxHeight,
  });

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const runAnimation = () => {
      if (!isAnimating) return;
      setSubmitted(true);
      timeoutId = setTimeout(() => {
        setSubmitted(false);
        timeoutId = setTimeout(runAnimation, thinkingDuration);
      }, loadingDuration);
    };

    if (isAnimating) runAnimation();

    return () => clearTimeout(timeoutId);
  }, [isAnimating, loadingDuration, thinkingDuration]);

  const handleSubmit = async () => {
    if (!inputValue.trim() || submitted) return;
    setSubmitted(true);
    await onSubmit?.(inputValue);
    setInputValue("");
    adjustHeight(true);
    setTimeout(() => setSubmitted(false), loadingDuration);
  };

  return (
    <div className={cn("w-full py-4", className)}>
      <div className="relative mx-auto flex w-full max-w-2xl flex-col gap-2">
        <div className="relative mx-auto w-full max-w-2xl">
          <Textarea
            id={id}
            placeholder={placeholder}
            className={cn(
              "w-full rounded-3xl bg-white/10 pl-6 pr-12 py-4",
              "border border-white/10",
              "placeholder:text-white/40 text-white",
              "resize-none leading-[1.2]",
              "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
            )}
            style={{ minHeight: `${minHeight}px` }}
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              adjustHeight();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            disabled={submitted}
          />
          <button
            onClick={() => void handleSubmit()}
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2 transition",
              submitted ? "" : "bg-white/10 hover:bg-white/20"
            )}
            type="button"
            disabled={submitted}
          >
            {submitted ? (
              <div
                className="h-4 w-4 animate-spin rounded-sm bg-white transition duration-700"
                style={{ animationDuration: "3s" }}
              />
            ) : (
              <CornerRightUp
                className={cn(
                  "h-4 w-4 text-white transition-opacity",
                  inputValue ? "opacity-100" : "opacity-30"
                )}
              />
            )}
          </button>
        </div>
        <p className="h-4 pl-4 text-center text-xs text-white/40">
          {submitted ? "AI is thinking..." : "Enter για αποστολή · Shift+Enter για νέα γραμμή"}
        </p>
      </div>
    </div>
  );
}
