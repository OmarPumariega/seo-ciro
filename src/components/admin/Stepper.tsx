"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Indicador de progreso reutilizable para flujos multi-paso (wizard). Cada paso
// es un círcculo numerado conectado por una línea; los completados muestran un
// check. Solo se permite volver hacia atrás (onStepClick sobre pasos ya hechos
// o el actual), nunca saltar a pasos futuros.

export type StepDescriptor = { title: string; optional?: boolean };

export default function Stepper({
  steps,
  current,
  onStepClick,
}: {
  steps: StepDescriptor[];
  current: number;
  onStepClick?: (index: number) => void;
}) {
  return (
    <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1">
      {steps.map((step, i) => {
        const isDone = i < current;
        const isCurrent = i === current;
        const clickable = onStepClick && i <= current;
        return (
          <li key={step.title} className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick?.(i)}
              className={cn(
                "flex items-center gap-1.5 sm:gap-2 group",
                clickable ? "cursor-pointer" : "cursor-default"
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 rounded-full text-xs font-semibold border transition-colors",
                  isDone && "bg-gray-900 text-white border-gray-900",
                  isCurrent && "bg-white text-gray-900 border-gray-900",
                  !isDone && !isCurrent && "bg-white text-gray-400 border-gray-200"
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-xs sm:text-sm hidden sm:block",
                  isCurrent ? "text-gray-900 font-medium" : isDone ? "text-gray-700" : "text-gray-400"
                )}
              >
                {step.title}
                {step.optional && <span className="text-gray-300 font-normal"> · opcional</span>}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span
                className={cn(
                  "h-px w-4 sm:w-8 shrink-0",
                  i < current ? "bg-gray-900" : "bg-gray-200"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
