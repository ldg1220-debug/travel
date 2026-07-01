"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal(props: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

// Plain CSS transitions rather than the tailwindcss-animate plugin's
// animate-in/slide-in-from-* utilities (not installed) — Radix's Presence
// primitive still waits for `transitionend` before unmounting, so this
// animates both the open and close direction correctly.
function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/40 opacity-0 transition-opacity duration-300 data-[state=open]:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "bottom",
  container,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  /** Portal target — defaults to document.body (Radix default) if omitted. */
  container?: HTMLElement | null;
}) {
  return (
    <SheetPortal container={container}>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "bg-white fixed z-50 flex flex-col gap-4 shadow-lg transition-transform duration-300 ease-out",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[80%] translate-y-full rounded-t-3xl border-t data-[state=open]:translate-y-0",
          side === "top" &&
            "inset-x-0 top-0 -translate-y-full rounded-b-3xl border-b data-[state=open]:translate-y-0",
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 translate-x-full border-l data-[state=open]:translate-x-0 sm:max-w-sm",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 -translate-x-full border-r data-[state=open]:translate-x-0 sm:max-w-sm",
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute top-4 right-4 rounded-full bg-slate-100 p-1.5 opacity-80 transition-opacity hover:opacity-100">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1 p-4", className)} {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-slate-900 font-semibold", className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-slate-500 text-sm", className)}
      {...props}
    />
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription };
