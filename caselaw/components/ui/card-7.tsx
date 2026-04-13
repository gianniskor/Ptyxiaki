"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// --- PROPS INTERFACE ---
interface InteractiveProductCardProps extends React.HTMLAttributes<HTMLDivElement> {
  imageUrl: string;
  logoUrl?: string;
  title: string;
}

// --- COMPONENT DEFINITION ---
export function InteractiveProductCard({
  className,
  imageUrl,
  logoUrl,
  title,
  ...props
}: InteractiveProductCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [style, setStyle] = React.useState<React.CSSProperties>({});

  // --- MOUSE MOVE HANDLER ---
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;

    const { left, top, width, height } = cardRef.current.getBoundingClientRect();
    const x = e.clientX - left;
    const y = e.clientY - top;

    const rotateX = ((y - height / 2) / (height / 2)) * -8;
    const rotateY = ((x - width / 2) / (width / 2)) * 8;

    setStyle({
      transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`,
      transition: "transform 0.1s ease-out",
    });
  };

  // --- MOUSE LEAVE HANDLER ---
  const handleMouseLeave = () => {
    setStyle({
      transform: "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
      transition: "transform 0.4s ease-in-out",
    });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={style}
      className={cn(
        "relative w-full max-w-[340px] aspect-[9/12] rounded-3xl bg-[#1a1a1c] shadow-lg cursor-pointer",
        className
      )}
      {...props}
    >
      {/* Background Image */}
      <img
        src={imageUrl}
        alt={title}
        className="absolute inset-0 h-full w-full object-cover rounded-3xl"
        style={{ transform: "translateZ(-20px) scale(1.1)" }}
      />
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/20 to-transparent rounded-3xl" />

      {/* Main Content with 3D effect */}
      <div
        className="absolute inset-0 p-3 pt-6 flex flex-col"
        style={{ transform: "translateZ(40px)" }}
      >
        {/* Glassmorphism Header */}
        <div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-2 backdrop-blur-xs">
          <div className="flex flex-col items-center">
            <h3 className="text-lg font-bold text-white text-center">{title}</h3>
          </div>
          {logoUrl && (
            <img src={logoUrl} alt="Brand Logo" className="h-2 w-auto" />
          )}
        </div>


      </div>
    </div>
  );
}
